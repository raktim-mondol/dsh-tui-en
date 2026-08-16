/**
 * Faithful fullscreen streaming repro v2:
 * - pre-seeded "resumed" history (~2.5 viewports) with cold height cache
 * - working spinner ticking during the whole stream (independent dirty frames)
 * - status metrics ticking (~10/s channel bumps without content change)
 * - reasoning rows streaming expanded then folding (height shrink mid-stream)
 * - tool cards running->ok with long multi-line results
 * - final assistant message with markdown table streamed chunk-wise
 * Dumps the emulated screen after each phase; look for two fragments sharing
 * one row (stale-Y collisions) or dropped/duplicated lines.
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'WezTerm'  // force DEC-2026 path (SYNC_OUTPUT_SUPPORTED=true) so the DECSTBM scroll-hint optimization fires

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render, AlternateScreen }, { Chat }, { QuestionStore }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
])

const COLS = 100
const ROWS = 55
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 50, allowProposedApi: true })

const rawChunks: string[] = []
const frameLog: string[] = []
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) {
    const str = String(chunk)
    rawChunks.push(str)
    term.write(str, () => {
      if (!str.includes('\x1b[?2026l')) return cb()
      const ink: any = (globalThis as any).__inkInst
      let sb: any = null
      const find = (n: any) => {
        if (sb) return
        if ((n.yogaNode as any)?.yoga?.style?.overflow === 2) { sb = n; return }
        for (const c of n.childNodes ?? []) find(c)
      }
      if (ink?.rootNode) find(ink.rootNode)
      if (sb) {
        const content = sb.childNodes?.[0]
        const kids = (content?.childNodes ?? []).length
        const hasLogo = str.includes('▀▀') || str.includes('Explore the uncharted')
        const hasDoc = /[5-9]\. /.test(str)
        frameLog.push(`${hasLogo ? 'L' : hasDoc ? 'D' : '.'} scrollTop=${sb.scrollTop} scrollH=${sb.scrollHeight} kids=${kids}`)
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
function screenText(): string {
  const buf = term.buffer.active
  const out: string[] = []
  for (let y = 0; y < ROWS; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  return out.map((l, i) => `${String(i).padStart(2)}|${l}`).join('\n')
}

function scrollState(): string {
  const ink: any = (globalThis as any).__inkInst
  if (!ink?.rootNode) return 'no ink'
  let sb: any = null
  const find = (n: any) => {
    if (sb) return
    if ((n.yogaNode as any)?.yoga?.style?.overflow === 2) { sb = n; return }
    for (const c of n.childNodes ?? []) find(c)
  }
  find(ink.rootNode)
  if (!sb) return 'no scrollbox'
  const content = sb.childNodes?.[0]
  const kids = (content?.childNodes ?? []).map((c: any) => {
    const y = (c.yogaNode as any)?.yoga
    return `${c.nodeName}@${y?.getComputedTop?.()}+${y?.getComputedHeight?.()}`
  })
  return `scrollTop=${sb.scrollTop} pending=${sb.pendingScrollDelta} sticky=${sb.stickyScroll} clamp=[${sb.scrollClampMin},${sb.scrollClampMax}] scrollH=${sb.scrollHeight} freshH=${(content?.yogaNode as any)?.yoga?.getComputedHeight?.()} kids=[${kids.join(' ')}]`
}

const listeners = new Set<() => void>()
const channel: any = {
  version: 0,
  rows: [] as any[],
  status: 'idle',
  sessionTitle: 'probe',
  agentId: 'probe',
  model: 'deepseek-v4-flash',
  reasoningEffort: 'max',
  tokens: { input: 120, output: 45 },
  cwd: '/tmp/demo',
  gitBranch: 'main',
  working: true,
  spinnerMode: 'requesting',
  responseChars: 0,
  activeToolCount: 1,
  mode: { id: 'default', plan: false },
  turnStart: Date.now(),
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
const bump = () => { channel.version++; for (const cb of listeners) cb() }

let id = 0
// --- pre-seed resumed history: 2 full turns (~2.5 viewports) ---------------
for (let turn = 0; turn < 2; turn++) {
  channel.rows.push({ id: id++, kind: 'user', text: `History question ${turn}: check the build config` })
  channel.rows.push({ id: id++, kind: 'reasoning', text: 'The user wants the build config; find the config file first.'.repeat(3), streaming: false, durationMs: 1200 })
  for (let t = 0; t < 4; t++) {
    channel.rows.push({
      id: id++, kind: 'tool', text: '',
      tool: {
        callId: `h${turn}-${t}`, name: t % 2 ? 'Read' : 'Bash',
        argsText: t % 2 ? `{"file_path": "/home/sisct/Code/projects/FlutterProjects/jotsy/lib/history${turn}_${t}.dart"}` : `{"command": "git log --oneline -15 && echo \\"---STATUS---\\" && git status --short && git branch --show-current", "description": "Show recent commits and working tree status"}`,
        argsFull: '{}',
        status: 'ok', startedAt: Date.now() - 60000, durationMs: 30,
        resultText: Array.from({ length: 8 + t * 5 }, (_, i) => `eb33e0${i} ci: separate runtime properties History result line ${turn}-${t}-${i} (cikeseven, 2026-07-12)`).join('\n'),
      },
    })
  }
  channel.rows.push({ id: id++, kind: 'assistant', text: `History answer ${turn}:\n\n- Build config is in \`pubspec.yaml\`\n- CI is in \`.github/workflows/\`\n\n| Item | Value |\n| --- | --- |\n| SDK | ^3.7.0 |\n| riverpod | ^3.2.1 |`, streaming: false })
}

const stdoutObj = new FakeStdout()
const stdin = new FakeStdin()
const instance = await render(
  <AlternateScreen>
    <Chat channel={channel} questionStore={new QuestionStore()} />
  </AlternateScreen>,
  { stdout: stdoutObj, stdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)

;(globalThis as any).__inkInst = (await import('../src/ink/instances.js')).default.get(stdoutObj as any)
// metrics ticking ~10/s for the whole run (status line tps etc.)
const ticker = setInterval(() => {
  channel.responseChars += 7
  bump()
}, 100)

await sleep(800)

// --- live turn ---------------------------------------------------------------
const add = (row: any) => { channel.rows.push({ id: id++, ...row }); bump() }
add({ kind: 'user', text: 'Look at this project and give an overview' })
await sleep(120)

const think1 = { id: id++, kind: 'reasoning', text: '', streaming: true, durationMs: undefined }
channel.rows.push(think1); bump()
for (const chunk of ['Look at the directory layout first', ', read README and pubspec', ', then summarize.']) {
  think1.text += chunk; bump(); await sleep(140)
}
think1.streaming = false; think1.durationMs = 1000; bump()
await sleep(150)

const tool1 = {
  id: id++, kind: 'tool', text: '',
  tool: {
    callId: 'c1', name: 'Bash',
    argsText: '{"command": "git log --oneline -15 && echo \\"---STATUS---\\" && git status --short && git branch --show-current", "description": "Show recent commits and working tree status"}',
    argsFull: '{}',
    status: 'running', resultText: undefined, startedAt: Date.now(), durationMs: undefined,
  },
}
channel.rows.push(tool1); bump(); await sleep(500)
tool1.tool.status = 'ok'
tool1.tool.durationMs = 42
tool1.tool.resultText = 'eb33e02 ci: separate runtime properties\neb33e03 ci: improve release secret diagnostics\n' + Array.from({ length: 24 }, (_, i) => `M  lib/file${i}.dart (cikeseven, 2026-07-12)`).join('\n')
channel.activeToolCount = 0
bump(); await sleep(200)

for (let t = 2; t <= 4; t++) {
  add({
    kind: 'tool', text: '',
    tool: {
      callId: `c${t}`, name: 'Read',
      argsText: `{"file_path": "/home/sisct/Code/projects/FlutterProjects/jotsy/lib/file${t}.dart"}`,
      argsFull: '{}',
      status: 'ok', startedAt: Date.now(), durationMs: 12,
      resultText: `<path>/home/sisct/Code/projects/FlutterProjects/jotsy/lib/file${t}.dart</path>\n<type>file</type>\n<content>\n` + Array.from({ length: 10 + t * 4 }, (_, i) => `// line ${i} of file ${t}`).join('\n'),
    },
  })
  await sleep(140)
}

const think2 = { id: id++, kind: 'reasoning', text: 'Structure is clear; write an overview with a table.', streaming: true, durationMs: undefined }
channel.rows.push(think2); bump(); await sleep(500)
think2.streaming = false; think2.durationMs = 7000; bump(); await sleep(150)

const finalMsg = { id: id++, kind: 'assistant', text: '', streaming: true }
channel.rows.push(finalMsg); bump()
const docLines: string[] = []
docLines.push('# Jotsy project notes\n\n```text\n')
const sections = ['1. Project positioning', '2. Tech stack', '3. Core features', '4. Data design notes', '5. Code structure', '6. Engineering conventions (AGENTS.md summary)', '7. Build and release', '8. Data migration and backup', '9. Current status notes']
for (const sec of sections) {
  docLines.push(sec + '\n')
  for (let i = 0; i < 11; i++) {
    docLines.push(`- ${sec} item ${i + 1}: lib/app/ assembly, theme system, WebDAV sync, archive encrypted zip; content stored as Delta JSON\n`)
  }
  docLines.push('\n')
}
docLines.push('```\n')
const doc: string[] = []
let acc = ''
for (const l of docLines) {
  acc += l
  if (acc.length > 60) { doc.push(acc); acc = '' }
}
if (acc) doc.push(acc)
const midFrames: Array<{ i: number; text: string }> = []
let chunkIdx = 0
for (const chunk of doc) {
  finalMsg.text += chunk
  bump()
  await sleep(160)
  chunkIdx++
  if (chunkIdx % 8 === 4) midFrames.push({ i: chunkIdx, text: scrollState() + '\n' + screenText() })
}
finalMsg.streaming = false
channel.working = false
bump()
await sleep(1000)
clearInterval(ticker)
await sleep(300)

// --- layout dump: walk the ink DOM and print yoga computed rects ----------
const { default: instances } = await import('../src/ink/instances.js')
const ink: any = instances.get(stdoutObj as any) ?? null
function walk(node: any, depth: number, out: string[]) {
  const y = node.yogaNode
  const name = node.nodeName + (node.attributes?.scrollbarState ? '[scroll]' : '')
  const st = (y as any)?.yoga?.style
  out.push(`${'  '.repeat(depth)}${name} y=${y?.getComputedTop?.() ?? '?'} h=${y?.getComputedHeight?.() ?? '?'} basis=${(y as any)?.yoga?._flexBasis?.toFixed?.(1) ?? '?'} grow=${st?.flexGrow ?? '?'} shrink=${st?.flexShrink ?? '?'} minH=${st?.minHeight ?? '?'} maxH=${st?.maxHeight ?? '?'} ovf=${st?.overflow ?? '?'}`)
  for (const c of node.childNodes ?? []) walk(c, depth + 1, out)
}
if (ink?.rootNode) {
  const lines: string[] = []
  walk(ink.rootNode, 0, lines)
  console.log('=== layout dump (depth<=4) ===')
  console.log(lines.filter((l, i) => (l.match(/^\s*/)?.[0].length ?? 0) / 2 <= 4).join('\n'))
} else {
  console.log('no ink instance found via instances map')
}

const allRaw = rawChunks.join('')
const scrollRegions = allRaw.match(/\x1b\[\d+;\d+r/g) ?? []
const scrollOps = allRaw.match(/\x1b\[\d+[ST]/g) ?? []
const resets = allRaw.match(/\x1b\[r/g) ?? []
console.log('DECSTBM regions:', scrollRegions.length, 'SU/SD ops:', scrollOps.length, 'region resets:', resets.length)
console.log('sample regions:', scrollRegions.slice(0, 8).map(x => JSON.stringify(x)).join(' '))
await import('node:fs').then(fs => fs.writeFileSync('/tmp/tui-stream.bin', Buffer.from(allRaw, 'utf8')))
console.log('=== screen after streaming settles ===')
console.log(screenText())
console.log('=== mid-stream frames with >=5 consecutive blank rows in viewport ===')
for (const f of midFrames) {
  const rows = f.text.split('\n').slice(1).map(l => l.slice(4))  // strip "NN| " prefix
  let run = 0, maxRun = 0
  for (let y = 2; y < 48; y++) {
    if ((rows[y] ?? '').trim() === '') { run++; maxRun = Math.max(maxRun, run) }
    else run = 0
  }
  if (maxRun >= 5) {
    console.log(`--- frame after chunk ${f.i} (max blank run ${maxRun}) ---`)
    console.log(f.text)
  }
}
// Did mid-stream output ever paint doc text? Track offset where each section first appears.
const idx5 = allRaw.indexOf('5. Code structure')
const idx9 = allRaw.indexOf('9. Current status notes')
const lastThird = allRaw.slice(Math.floor(allRaw.length * 2 / 3))
console.log(`paint check: total=${allRaw.length}B 5. first@${idx5} 9. first@${idx9} 5.in-last-third=${lastThird.includes('5. Code structure')}`)
const at = allRaw.indexOf('5. Code structure')
console.log('--- raw slice around first mid-stream paint of 5. ---')
console.log(JSON.stringify(allRaw.slice(Math.max(0, at - 600), at + 300)))
const frames = allRaw.split('\x1b[?2026h').slice(1)
let logoFrames = 0, docFrames = 0, both = 0
const seq: string[] = []
for (const f of frames) {
  const hasLogo = f.includes('▀▀') || f.includes('Explore the uncharted')
  const hasDoc = /[5-9]\. /.test(f)
  if (hasLogo && hasDoc) both++
  else if (hasLogo) logoFrames++
  else if (hasDoc) docFrames++
  seq.push(hasLogo ? (hasDoc ? 'B' : 'L') : (hasDoc ? 'D' : '.'))
}
console.log(`frames=${frames.length} logo=${logoFrames} doc=${docFrames} both=${both}`)
console.log('seq(1 char/frame, L=logo D=doc B=both):')
console.log(seq.join(''))
console.log('--- per-frame scroll state (last 60) ---')
console.log(frameLog.slice(-60).join('\n'))
const ml: string[] = (globalThis as any).__mlog ?? []
console.log('--- MessageList window trace (last 40) ---')
console.log(ml.slice(-40).join('\n'))
console.log('=== mid-stream scan done ===')
await instance.unmount()
process.exit(0)
