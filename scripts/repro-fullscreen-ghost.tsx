/**
 * Fullscreen ghost repro (issue #39 DECSTBM fast-path hypothesis + #38/#19
 * scroll scenes). Two oracles —
 * 1. Final-state equivalence: the same final UI, incrementally streamed
 *    (xterm A) vs freshly mounted (xterm B) must match; a diff is a
 *    differential-pipeline bug.
 * 2. In-screen coherence: after SGR wheel injects into stdin, each unique
 *    marker row appears at most once and in document order; a repeat or
 *    reorder is a ghost.
 *
 * Pathological condition (per #39): the tail streams taller while a mid
 * reasoning row folds (height shrink) — frames whose height growth and
 * scrollTop delta disagree.
 * Run: node --import tsx/esm scripts/repro-fullscreen-ghost.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'WezTerm'  // DEC-2026 sync output so DECSTBM scroll opt applies
process.env.DSH_TUI_THEME = 'dark'

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render, AlternateScreen }, { Chat }, { QuestionStore }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
])

const COLS = 100
const ROWS = 40
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let failed = 0
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

function makeTerm() {
  return new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
}
function makeStreams(term: InstanceType<typeof XTerm>) {
  class FakeStdout extends Writable {
    columns = COLS
    rows = ROWS
    isTTY = true
    _write(chunk: unknown, _e: BufferEncoding, cb: () => void) {
      term.write(String(chunk), cb)
    }
  }
  class FakeStderr extends Writable {
    isTTY = true
    _write(_c: unknown, _e: BufferEncoding, cb: () => void) { cb() }
  }
  class FakeStdin extends PassThrough {
    isTTY = true
    setRawMode() { return this }
    ref() { return this }
    unref() { return this }
  }
  return { stdout: new FakeStdout(), stderr: new FakeStderr(), stdin: new FakeStdin() }
}
function screenLines(term: InstanceType<typeof XTerm>): string[] {
  const buf = term.buffer.active
  const out: string[] = []
  for (let y = 0; y < ROWS; y++) out.push((buf.getLine(y)?.translateToString(true) ?? '').replace(/\s+$/, ''))
  return out
}

/** Unique marker rows: each appears once in the full document.
 *  Section titles match the whole line (body rows are `- title item N…`,
 *  they contain the title string but are not equal to it). Logo / user
 *  messages use includes. */
const MARKERS = ['1. Project positioning', '3. Core features', '5. Code structure', '7. Build and release', '9. Current status notes', 'Explore the uncharted', 'Look at this project and give an overview']
const matchesMarker = (line: string, m: string) =>
  m === 'Explore the uncharted' || m === 'Look at this project and give an overview' ? line.includes(m) : line.trim() === m
/** In-screen coherence: each marker at most once, in document order. */
function assertScreenCoherent(tag: string, lines: string[]) {
  const seen: Array<{ marker: string; row: number }> = []
  for (const m of MARKERS) {
    const rows = lines.map((l, i) => (matchesMarker(l, m) ? i : -1)).filter(i => i >= 0)
    check(`[${tag}] "${m}" appears at most once`, rows.length <= 1, `rows ${rows.join(',')}`)
    if (rows.length === 1) seen.push({ marker: m, row: rows[0] })
  }
  const ordered = MARKERS.filter(m => seen.some(s => s.marker === m))
  const byRow = [...seen].sort((a, b) => a.row - b.row).map(s => s.marker)
  // Logo / user message come before every section title in document order.
  const docOrder = ['Explore the uncharted', 'Look at this project and give an overview', '1. Project positioning', '3. Core features', '5. Code structure', '7. Build and release', '9. Current status notes']
  const expect = docOrder.filter(m => ordered.includes(m))
  check(`[${tag}] markers follow document order`, JSON.stringify(byRow) === JSON.stringify(expect), `got ${byRow.join('>')}`)
}

function makeChannel(rows: any[]) {
  const listeners = new Set<() => void>()
  const channel: any = {
    version: 0,
    rows,
    status: 'idle',
    sessionTitle: 'probe',
    agentId: 'probe',
    model: 'deepseek-v4-flash',
    reasoningEffort: 'max',
    tokens: { input: 120, output: 45 },
    cwd: '/tmp/demo',
    gitBranch: 'main',
    working: false,
    spinnerMode: 'requesting',
    responseChars: 500,
    activeToolCount: 0,
    mode: { id: 'default', plan: false },
    turnStart: 0,
    lastUserText: 'Look at this project',
    pending: [],
    commandList: [],
    commandCompletions: () => [],
    notifications: [],
    subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
    submit: () => {},
    cancel: () => {},
    clear: () => {},
    notify: () => {},
    listModels: () => Promise.resolve([]),
    listSessions: () => [],
    setResumeTarget: () => {},
    loadOlder: () => {},
    mcpStatus: () => [],
  }
  const bump = () => { channel.version++; for (const cb of listeners) (cb as () => void)() }
  return { channel, bump }
}

function seedHistory(rows: any[], idRef: { v: number }) {
  for (let turn = 0; turn < 2; turn++) {
    rows.push({ id: idRef.v++, kind: 'user', text: `History question ${turn}: check the build config` })
    rows.push({ id: idRef.v++, kind: 'reasoning', text: 'The user wants the build config; find the config file first.'.repeat(3), streaming: false, durationMs: 1200 })
    for (let t = 0; t < 4; t++) {
      rows.push({
        id: idRef.v++, kind: 'tool', text: '',
        tool: {
          callId: `h${turn}-${t}`, name: t % 2 ? 'Read' : 'Bash',
          argsText: t % 2 ? `{"file_path": "/home/demo/lib/history${turn}_${t}.dart"}` : '{"command": "git log --oneline -15"}',
          argsFull: '{}',
          status: 'ok', startedAt: 0, durationMs: 30,
          resultText: Array.from({ length: 8 + t * 5 }, (_, i) => `History result line ${turn}-${t}-${i}`).join('\n'),
        },
      })
    }
    rows.push({ id: idRef.v++, kind: 'assistant', text: `History answer ${turn}:\n\n- Build config is in \`pubspec.yaml\``, streaming: false })
  }
}

const sections = ['1. Project positioning', '2. Tech stack', '3. Core features', '4. Data design notes', '5. Code structure', '6. Engineering conventions', '7. Build and release', '8. Data migration', '9. Current status notes']
function buildDocChunks(): string[] {
  const docLines: string[] = []
  for (const sec of sections) {
    docLines.push(sec + '\n')
    for (let i = 0; i < 11; i++) docLines.push(`- ${sec}  item ${i + 1}: app assembly, theme system, sync and encrypted packaging\n`)
    docLines.push('\n')
  }
  const doc: string[] = []
  let acc = ''
  for (const l of docLines) {
    acc += l
    if (acc.length > 60) { doc.push(acc); acc = '' }
  }
  if (acc) doc.push(acc)
  return doc
}

/** SGR wheel inject: 64=up 65=down, coords at mid-screen (inside ScrollBox). */
function wheel(stdin: any, dir: 'up' | 'down', ticks: number) {
  const btn = dir === 'up' ? 64 : 65
  for (let i = 0; i < ticks; i++) stdin.write(`\x1b[<${btn};50;18M`)
}

// ═══════════════ Run A: incremental stream (mid fold + mid-stream scroll) ═══════════════
const termA = makeTerm()
const sA = makeStreams(termA)
const idRef = { v: 0 }
const rowsA: any[] = []
seedHistory(rowsA, idRef)
const { channel: chA, bump: bumpA } = makeChannel(rowsA)
chA.working = true
chA.activeToolCount = 1

const instA = await render(
  <AlternateScreen>
    <Chat channel={chA} questionStore={new QuestionStore()} />
  </AlternateScreen>,
  { stdout: sA.stdout as any, stdin: sA.stdin as any, stderr: sA.stderr as any, exitOnCtrlC: false, patchConsole: false },
)
const ticker = setInterval(() => { chA.responseChars += 7; bumpA() }, 100)
await sleep(800)

rowsA.push({ id: idRef.v++, kind: 'user', text: 'Look at this project and give an overview' }); bumpA()
await sleep(120)

// Live reasoning: stream expanded, then fold during the tail stream — mid-height shrink.
const think = { id: idRef.v++, kind: 'reasoning', text: '', streaming: true, durationMs: undefined as number | undefined }
rowsA.push(think); bumpA()
for (const chunk of ['Look at the directory layout first', ', read README and the build config', ', compare dependency versions', ', then summarize the points.']) {
  think.text += chunk; bumpA(); await sleep(120)
}

const tool1 = {
  id: idRef.v++, kind: 'tool', text: '',
  tool: {
    callId: 'c1', name: 'Bash', argsText: '{"command": "git log --oneline -15"}', argsFull: '{}',
    status: 'running' as string, resultText: undefined as string | undefined, startedAt: 0, durationMs: undefined as number | undefined,
  },
}
rowsA.push(tool1); bumpA(); await sleep(300)

// Tail long-text stream; think folds after chunk 6 (mid shrink), tool1 settles after 10 (mid grow).
const finalMsg = { id: idRef.v++, kind: 'assistant', text: '', streaming: true }
rowsA.push(finalMsg); bumpA()
const doc = buildDocChunks()
let i = 0
for (const chunk of doc) {
  finalMsg.text += chunk
  i++
  if (i === 6) { think.streaming = false; think.durationMs = 2000 }
  if (i === 10) {
    tool1.tool.status = 'ok'
    tool1.tool.durationMs = 42
    tool1.tool.resultText = Array.from({ length: 20 }, (_, k) => `Tool result line ${k}`).join('\n')
    chA.activeToolCount = 0
  }
  bumpA()
  await sleep(90)
  // At 1/3: scroll up 5 rows mid-stream then back to the bottom (issue #19).
  if (i === Math.floor(doc.length / 3)) {
    wheel(sA.stdin, 'up', 5); await sleep(200)
    assertScreenCoherent('A:scroll-up mid-stream', screenLines(termA))
    wheel(sA.stdin, 'down', 40); await sleep(200)
  }
}
finalMsg.streaming = false
chA.working = false
bumpA()
await sleep(800)
clearInterval(ticker)
await sleep(300)

const snapA_bottom = screenLines(termA)
assertScreenCoherent('A:final bottom', snapA_bottom)

// After the turn: scroll up in steps to the top (issue #38); each step must stay coherent.
wheel(sA.stdin, 'up', 10); await sleep(250)
assertScreenCoherent('A:scroll-up-10', screenLines(termA))
wheel(sA.stdin, 'up', 60); await sleep(300)
assertScreenCoherent('A:scroll-to-top', screenLines(termA))
wheel(sA.stdin, 'down', 90); await sleep(300)
const snapA_rebottom = screenLines(termA)
assertScreenCoherent('A:scroll-back-bottom', snapA_rebottom)

// Final snapshot (for B): deep-copy the row data.
const finalRows = structuredClone(rowsA)
await instA.unmount()

// ═══════════════ Run B: same final state freshly mounted (gold) ═══════════════
const termB = makeTerm()
const sB = makeStreams(termB)
const { channel: chB, bump: bumpB } = makeChannel(finalRows)
const instB = await render(
  <AlternateScreen>
    <Chat channel={chB} questionStore={new QuestionStore()} />
  </AlternateScreen>,
  { stdout: sB.stdout as any, stdin: sB.stdin as any, stderr: sB.stderr as any, exitOnCtrlC: false, patchConsole: false },
)
await sleep(1000)
const snapB_bottom = screenLines(termB)
await instB.unmount()

// ═══════════════ Final-state equivalence ═══════════════
// Status-bar rows carry volatile tps/ctx numbers; normalize digits before compare.
const normalize = (l: string) => l.replace(/\d+(\.\d+)?/g, '#')
let diffCount = 0
const diffs: string[] = []
for (let y = 0; y < ROWS; y++) {
  const a = normalize(snapA_bottom[y] ?? '')
  const b = normalize(snapB_bottom[y] ?? '')
  if (a !== b) {
    diffCount++
    diffs.push(`  row ${String(y).padStart(2)} A|${snapA_bottom[y]}`)
    diffs.push(`      B|${snapB_bottom[y]}`)
  }
}
check('final-state equivalence: incremental == fresh mount', diffCount === 0, `${diffCount} rows differ`)
if (diffCount > 0) {
  console.log('=== final-state diffs (A=incremental B=fresh) ===')
  console.log(diffs.join('\n'))
}
assertScreenCoherent('B:gold', snapB_bottom)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
