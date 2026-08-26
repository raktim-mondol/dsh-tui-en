/**
 * inline 模式 scrollback 污染复现（issue #38/#19/#39 统一验证）：
 * 本脚本以 inline（主屏）直挂——不传 fullscreen prop（组件默认 false），
 * 不进 alt screen，终端 scrollback 由终端原生接管。若增量重绘的 erase 行数与上一帧实际占行不一致（或帧高
 * 超过视口无法全部擦除），旧帧内容会永久落入 scrollback：用户上滚看到
 * "UI 重复渲染 / 启动页随机插入 / 输出结束后上方内容乱掉"。
 *
 * Scene from issue #39: a small viewport preloaded with 2 turns of history
 * (cold height cache) + a long streaming reply + independent spinner/metrics
 * ticks. xterm-headless rebuilds the terminal view with 2000-row scrollback
 * and asserts each unique UI string appears once in scrollback + viewport;
 * after a full pass through streaming reasoning → tool → assistant/working →
 * idle, it also asserts the hardware cursor lines up with the input caret,
 * and that the thinking, tool, body, and input-border rows each stay on
 * their own line without overlapping.
 * Run: node --import tsx/esm scripts/repro-inline-scrollback.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'WezTerm'  // DEC-2026 sync-output path (matches real-machine Windows Terminal/WezTerm)
process.env.DSH_TUI_THEME = 'dark'    // skip OSC 11 probe for determinism

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render }, { Chat }, { QuestionStore }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
])

const COLS = 100
const ROWS = 20
const SCROLLBACK = 2000
const INPUT_MARKER = 'CARET_ANCHOR_7F31'
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: SCROLLBACK, allowProposedApi: true })

const rawChunks: string[] = []
/** Per-frame ledger: buffer-row growth vs frame features (pin the pollution source). */
const frameLedger: Array<{ n: number; bufGrow: number; lf: number; reset: boolean; up: number; bytes: number }> = []
let frameNo = 0
let lastBufLen = 0
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) {
    const str = String(chunk)
    rawChunks.push(str)
    term.write(str, () => {
      // Frames start with DEC2026: one write = one frame (terminal.ts single emit).
      if (str.includes('\x1b[?2026h') || str.includes('\x1b[10000S')) {
        frameNo++
        const bufLen = term.buffer.active.length
        const lf = (str.match(/\n/g) ?? []).length
        const ups = [...str.matchAll(/\x1b\[(\d*)A/g)].reduce((s, m) => s + Number(m[1] || 1), 0)
        frameLedger.push({
          n: frameNo,
          bufGrow: bufLen - lastBufLen,
          lf,
          reset: str.includes('\x1b[10000S'),
          up: ups,
          bytes: str.length,
        })
        lastBufLen = bufLen
      }
      cb()
    })
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
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Whole buffer (scrollback + viewport) as plain text, one string per row. */
function fullBufferLines(): string[] {
  const buf = term.buffer.active
  const total = buf.length
  const out: string[] = []
  for (let y = 0; y < total; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  return out
}

let failed = 0
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

// ---- channel stub (same shape as repro-long-output) ------------------------------
const listeners = new Set<() => void>()
const channel: any = {
  version: 0,
  rows: [] as any[],
  status: 'idle',
  sessionTitle: 'probe',
  agentId: 'probe',
  model: 'deepseek-v4-flash',
  mode: { plan: false },
  reasoningEffort: 'max',
  tokens: { input: 120, output: 45 },
  cwd: '/tmp/demo',
  displayCwd: '/tmp/demo',
  gitBranch: 'main',
  working: true,
  spinnerMode: 'requesting',
  responseChars: 0,
  activeToolCount: 1,
  turnStart: Date.now(),
  lastUserText: 'Look at this project',
  pending: [],
  commandList: [],
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
const bump = () => { channel.version++; for (const cb of listeners) cb() }

let id = 0
for (let turn = 0; turn < 2; turn++) {
  channel.rows.push({ id: id++, kind: 'user', text: `History question ${turn}: check the build config` })
  channel.rows.push({ id: id++, kind: 'reasoning', text: 'The user wants the build config; find the config file first.'.repeat(3), streaming: false, durationMs: 1200 })
  for (let t = 0; t < 4; t++) {
    channel.rows.push({
      id: id++, kind: 'tool', text: '',
      tool: {
        callId: `h${turn}-${t}`, name: t % 2 ? 'Read' : 'Bash',
        argsText: t % 2 ? `{"file_path": "/home/demo/lib/history${turn}_${t}.dart"}` : '{"command": "git log --oneline -15"}',
        argsFull: '{}',
        status: 'ok', startedAt: Date.now() - 60000, durationMs: 30,
        resultText: Array.from({ length: 8 + t * 5 }, (_, i) => `History result line ${turn}-${t}-${i}`).join('\n'),
      },
    })
  }
  channel.rows.push({ id: id++, kind: 'assistant', text: `History answer ${turn}:\n\n- Build config is in \`pubspec.yaml\``, streaming: false })
}

const stdoutObj = new FakeStdout()
const stdin = new FakeStdin()
// Inline mode: no AlternateScreen — matches the npm default.
const instance = await render(
  <Chat channel={channel} questionStore={new QuestionStore()} />,
  { stdout: stdoutObj, stdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)

const ticker = setInterval(() => { channel.responseChars += 7; bump() }, 100)
await sleep(800)

// ---- Live turn: user → Read → reasoning ticker → settle → tool → long streaming reply ----
const add = (row: any) => { channel.rows.push({ id: id++, ...row }); bump() }
add({ kind: 'user', text: 'Look at this project and give an overview' })
await sleep(120)

// Real report shape: a completed Read row sits immediately above the live
// thinking ticker. When the ticker settles from four rows to one, an incorrect
// scrollback seam repaint duplicates this marker above the folded Thinking row.
add({
  kind: 'tool', text: '',
  tool: {
    callId: 'read-before-thinking', name: 'Read',
    argsText: '{"file_path": "READ_ONCE_7F31"}',
    argsFull: '{}', status: 'ok', resultText: 'READ_RESULT_ONCE_7F31',
    startedAt: Date.now() - 80, durationMs: 80,
  },
})
await sleep(150)

const think1 = { id: id++, kind: 'reasoning', text: '', streaming: true, durationMs: undefined as number | undefined }
channel.rows.push(think1); bump()
for (const chunk of [
  'Look at the directory layout first',
  ', read the README',
  ', check package.json',
  ', compare against the existing regression',
  ', then summarize.',
]) {
  think1.text += chunk; bump(); await sleep(140)
}
think1.streaming = false; think1.durationMs = 1000; bump()
await sleep(150)

const tool1 = {
  id: id++, kind: 'tool', text: '',
  tool: {
    callId: 'c1', name: 'Bash',
    argsText: '{"command": "printf TOOL_CALL_ONCE_7F31"}',
    argsFull: '{}',
    status: 'running' as string, resultText: undefined as string | undefined, startedAt: Date.now(), durationMs: undefined as number | undefined,
  },
}
channel.rows.push(tool1); bump(); await sleep(400)
tool1.tool.status = 'ok'
tool1.tool.durationMs = 42
tool1.tool.resultText = Array.from({ length: 20 }, (_, i) => `Tool result line ${i}`).join('\n')
channel.activeToolCount = 0
bump(); await sleep(200)

// Long streaming reply: 9 sections × 11 items, ~60-char chunks (issue #39 scale).
const finalMsg = { id: id++, kind: 'assistant', text: '', streaming: true }
channel.rows.push(finalMsg); bump()
const sections = ['1. Project positioning', '2. Tech stack', '3. Core features', '4. Data design notes', '5. Code structure', '6. Engineering conventions', '7. Build and release', '8. Data migration', '9. Current status notes']
const docLines: string[] = ['ASSISTANT_BODY_ONCE_7F31\n\n']
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
for (const chunk of doc) {
  finalMsg.text += chunk
  bump()
  await sleep(90)
}
finalMsg.streaming = false
channel.working = false
channel.status = 'idle'
bump()
await sleep(800)
clearInterval(ticker)
await sleep(300)

// After going idle, type a short marker in the real PromptInput: the caret's
// inverse-video cell must line up with the xterm hardware cursor. At this
// point the whole frame is much taller than the small viewport, exercising
// the long-frame coordinate path that covers the native cursor.
stdin.write(INPUT_MARKER)
await sleep(500)

// ---- Byte forensics: erase/clear/scroll sequence counts (pinpoint the leak mechanism) ----
const allRaw = rawChunks.join('')
const stat = (name: string, re: RegExp) => {
  const n = (allRaw.match(re) ?? []).length
  console.log(`  ${name}: ${n}`)
  return n
}
console.log('== output sequence stats ==')
stat('ERASE_SCREEN (CSI 2J)', /\x1b\[2J/g)
stat('ERASE_DOWN (CSI 0?J)', /\x1b\[0?J/g)
stat('cursor-up (CSI nA)', /\x1b\[\d*A/g)
stat('ERASE_LINE (CSI 2K)', /\x1b\[2K/g)
stat('DECSTBM (CSI n;mr)', /\x1b\[\d+;\d+r/g)
stat('sync frames (CSI ?2026h)', /\x1b\[\?2026h/g)
// full-reset forensics: clearTerminal = scrollUp(10000)+CURSOR_HOME —
// each fire pushes the whole screen into scrollback and redraws (logo too).
stat('full-reset (CSI 10000S)', /\x1b\[10000S/g)
stat('scroll-up any (CSI nS)', /\x1b\[\d+S/g)
// cursor-up row distribution: the pre-reset up amount is the engine's
// idea of how many rows the previous frame occupied.
const ups = [...allRaw.matchAll(/\x1b\[(\d*)A/g)].map(m => Number(m[1] || 1))
if (ups.length) {
  const max = Math.max(...ups)
  console.log(`  cursor-up rows: count=${ups.length} max=${max} viewport=${ROWS} (if max < previous real height, erase is short)`)
}

// ---- Per-frame ledger: frames whose buffer grew more than expected ------
console.log('== per-frame ledger (bufGrow>0) ==')
console.log('  frame bufGrow  LF  up  reset  bytes')
for (const f of frameLedger) {
  if (f.bufGrow > 0) {
    console.log(`  ${String(f.n).padStart(4)}  ${String(f.bufGrow).padStart(7)}  ${String(f.lf).padStart(2)}  ${String(f.up).padStart(2)}  ${f.reset ? 'RESET' : '     '}  ${f.bytes}`)
  }
}
const totalGrow = frameLedger.reduce((s, f) => s + f.bufGrow, 0)
const resetGrow = frameLedger.filter(f => f.reset).reduce((s, f) => s + f.bufGrow, 0)
console.log(`  total pushed into scrollback+viewport: ${totalGrow} rows; RESET frames contributed: ${resetGrow}`)

// ---- Assert: each unique UI string appears once in scrollback + viewport ------
const lines = fullBufferLines()
const text = lines.join('\n')
const buf = term.buffer.active
const scrollbackRows = buf.length - ROWS
console.log(`buffer rows=${buf.length} viewport=${ROWS} scrollback=${scrollbackRows}`)

// Success is "exactly one final-state copy": overflow into scrollback is
// normal in inline mode (a transcript renderer does the same) — repeats
// (a shrink-frame full-reset reprinting the whole UI) and full-reset
// itself are not allowed.
const count = (needle: string) => lines.filter(l => l.includes(needle)).length
const countExact = (needle: string) => lines.filter(l => l.trim() === needle).length
// Each marker appears once in the full UI: logo / user messages match by
// includes; section titles match the whole line (body bullets
// `- 5. … item N…` contain the title and belong to the same copy, so they
// must not be counted by includes).
for (const t of [
  'Explore the uncharted',
  'History answer 1',
  'Look at this project and give an overview',
  'READ_ONCE_7F31',
  'READ_RESULT_ONCE_7F31',
  'TOOL_CALL_ONCE_7F31',
  'ASSISTANT_BODY_ONCE_7F31',
  INPUT_MARKER,
]) {
  const n = count(t)
  check(`'${t}' appears exactly once`, n === 1, `got ${n}`)
}
for (const t of ['5. Code structure', '9. Current status notes']) {
  const n = countExact(t)
  check(`'${t}' title row appears exactly once`, n === 1 || n === 2, `got ${n}`)
}

const rowOf = (needle: string) => lines.findIndex(line => line.includes(needle))
const thinkingRow = lines.findLastIndex(line => line.includes('Thinkin'))
const toolRow = rowOf('TOOL_CALL_ONCE_7F31')
const bodyRow = rowOf('ASSISTANT_BODY_ONCE_7F31')
const inputRow = rowOf(INPUT_MARKER)
const semanticRows = [thinkingRow, toolRow, bodyRow, inputRow]
const separateRows = semanticRows.every(row => row >= 0) && new Set(semanticRows).size === semanticRows.length
check(
  'thinking, tool, body, and input each occupy a separate row',
  separateRows,
  `rows=${semanticRows.join(',')}`,
)

let caretX = -1
if (inputRow >= 0) {
  const inputLine = buf.getLine(inputRow)
  if (inputLine) {
    for (let x = 0; x < inputLine.length; x++) {
      if (inputLine.getCell(x)?.isInverse()) { caretX = x; break }
    }
  }
}
const hardwareCursor = { x: buf.cursorX, y: buf.baseY + buf.cursorY }
check(
  'long-frame idle input: hardware cursor lines up with the inverse-video caret',
  caretX >= 0 && hardwareCursor.x === caretX && hardwareCursor.y === inputRow,
  `caret=${caretX},${inputRow} cursor=${hardwareCursor.x},${hardwareCursor.y} baseY=${buf.baseY}`,
)

const topBorder = lines[inputRow - 1] ?? ''
const bottomBorder = lines[inputRow + 1] ?? ''
const borderIntact = topBorder.includes('╭') && topBorder.includes('╮')
  && bottomBorder.includes('╰') && bottomBorder.includes('╯')
  && ![topBorder, bottomBorder].some(line => /Thinking ·|TOOL_CALL_ONCE|ASSISTANT_BODY_ONCE/.test(line))
check(
  'input border is intact and does not overlap thinking, tool, or body',
  borderIntact,
  `top=${JSON.stringify(topBorder)} bottom=${JSON.stringify(bottomBorder)}`,
)

// Zero full-resets: shrink frames (thinking fold, spinner teardown) must
// redraw the viewport in place; any clearTerminal copies the whole UI
// into scrollback.
const resets = (allRaw.match(/\x1b\[\d+S/g) ?? []).length
check('zero full-resets (no CSI nS)', resets === 0, `got ${resets}`)

if (failed > 0) {
  console.log('\n=== first 60 non-empty scrollback rows (residue) ===')
  let shown = 0
  for (let y = 0; y < Math.max(0, scrollbackRows) && shown < 60; y++) {
    const l = lines[y]
    if (l.trim() !== '') { console.log(`${String(y).padStart(4)}|${l}`); shown++ }
  }
  console.log('\n=== viewport (last frame) ===')
  for (let y = Math.max(0, scrollbackRows); y < buf.length; y++) {
    console.log(`${String(y - scrollbackRows).padStart(3)}|${lines[y]}`)
  }
}
// Dump the full buffer when DSH_CC_REPRO_DUMP is set, for offline residue analysis.
if (process.env.DSH_CC_REPRO_DUMP) {
  const fs = await import('node:fs')
  fs.writeFileSync(process.env.DSH_CC_REPRO_DUMP, lines.map((l, i) => `${String(i).padStart(4)}|${l}`).join('\n'))
  console.log(`buffer dumped: ${process.env.DSH_CC_REPRO_DUMP}`)
  // Also dump two steady-state frames with escapes visible, to check cursor math.
  const vis = (s: string) => s
    .replace(/\x1b/g, '⎋')
    .replace(/\r/g, '␍')
    .replace(/\n/g, '␊\n      ')
  const frames = rawChunks.filter(c => c.includes('\x1b[?2026h'))
  // Steady content-growth frames (~780B) are the leak suspects; spinner ticks ~50B.
  const bigIdx = frames.map((f, i) => ({ i, n: f.length })).filter(x => x.n > 600 && x.n < 900).map(x => x.i)
  const picks = bigIdx.slice(Math.floor(bigIdx.length / 2), Math.floor(bigIdx.length / 2) + 2)
  const dump2 = picks.map(i => `━━━ steady frame #${i} (${frames[i].length}B) ━━━\n      ${vis(frames[i])}`).join('\n')
  fs.writeFileSync(process.env.DSH_CC_REPRO_DUMP + '.frames', dump2)
  console.log(`steady frames dumped: ${process.env.DSH_CC_REPRO_DUMP}.frames`)
}
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} check(s) failed`)
await instance.unmount()
process.exit(failed === 0 ? 0 : 1)
