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
  import('../src/questions.js'),
])

const COLS = 200
const ROWS = 50
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 50, allowProposedApi: true })

const rawChunks: string[] = []
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { rawChunks.push(String(chunk)); term.write(String(chunk), cb) }
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

const stdin = new FakeStdin()
const instance = await render(
  <AlternateScreen>
    <Chat channel={channel} questionStore={new QuestionStore()} />
  </AlternateScreen>,
  { stdout: new FakeStdout(), stdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)

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
const doc = [
  'Finished looking at the project; here is an overview:\n',
  '\n## Project overview\n\n',
  'Jotsy (Jot) — a fully local, privacy-first Android journal app (open source, early version).\n\n',
  '| Area | Choice |\n| --- | --- |\n',
  '| Framework | Flutter / Dart SDK ^3.7.0 |\n',
  '| State | flutter_riverpod ^3.2.1 |\n',
  '| Database | Drift (SQLite), schema v7, split by query/write/migration/tag ops |\n',
  '| Layout | (matches the AGENTS.md layering rules) |\n',
  '| Editor | flutter_quill + extensions (mixed text and images) |\n\n',
  '- `lib/app/` — app assembly, theme system, WebDAV sync, archive\n',
  '- `lib/core/` — database/ and services/ (settings, location, weather, backup, cover/media storage)\n',
  '- `lib/ui/` — split by feature: diaries, home, calendar, explore, settings, widgets\n',
  '\n## Recent activity\n\n',
  '- Latest commits: diary-card tag display (tag limit), CI release-flow improvements\n',
]
for (const chunk of doc) {
  finalMsg.text += chunk
  bump()
  await sleep(160)
}
finalMsg.streaming = false
channel.working = false
bump()
await sleep(1000)
clearInterval(ticker)
await sleep(300)

const allRaw = rawChunks.join('')
const scrollRegions = allRaw.match(/\x1b\[\d+;\d+r/g) ?? []
const scrollOps = allRaw.match(/\x1b\[\d+[ST]/g) ?? []
const resets = allRaw.match(/\x1b\[r/g) ?? []
console.log('DECSTBM regions:', scrollRegions.length, 'SU/SD ops:', scrollOps.length, 'region resets:', resets.length)
console.log('sample regions:', scrollRegions.slice(0, 8).map(x => JSON.stringify(x)).join(' '))
await import('node:fs').then(fs => fs.writeFileSync('/tmp/tui-stream.bin', Buffer.from(allRaw, 'utf8')))
console.log('=== screen after streaming settles ===')
console.log(screenText())
await instance.unmount()
process.exit(0)
