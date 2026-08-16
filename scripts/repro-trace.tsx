/**
 * `/trace` timeline-view regression (issue #80):
 * 1. Pure assembly (src/trace.ts): events → entries, tool/step/turn
 *    pairing and duration, thinking entries, todo summary, filters,
 *    extendTrace incremental append, duration/clock/width truncate.
 * 2. Component render (xterm-headless drives the real TraceView): entry
 *    rows, duration suffix, ❯ on the selected row, window scroll, single-
 *    line truncate, filter label, empty state.
 */
process.env.FORCE_COLOR = '3'

const [{ Writable }, React, { Terminal: XTerm }, { render }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
])
const {
  buildTraceEntries,
  extendTrace,
  filterTraceEntries,
  formatClock,
  formatDuration,
  truncateWidth,
} = await import('../src/trace.js')
const { TraceView, TRACE_WINDOW } = await import('../src/components/TraceView.js')
const { setLang } = await import('../src/i18n.js')

setLang('en')

const COLS = 90
const ROWS = 30
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
}
const stdout = new FakeStdout()
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** The real terminal screen, line by line (colors stripped). */
function lines(): string[] {
  const buf = term.buffer.active
  const out: string[] = []
  for (let y = 0; y < ROWS; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  return out
}
function screen(): string {
  return lines().join('\n')
}
function rowOf(needle: string): number {
  const rows = lines()
  for (let y = 0; y < rows.length; y++) {
    if (rows[y]!.includes(needle)) return y
  }
  return -1
}

let failures = 0
const results: string[] = []
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

// ── Event factory ──────────────────────────────────────────────────────────
type AnyEvent = { type: string; seq: number; time: number; data: Record<string, unknown> }
const T0 = Date.UTC(2026, 0, 15, 8, 0, 0) // fixed instant; clock asserts via formatClock
let seq = 0
const ev = (type: string, time: number, data: Record<string, unknown>): AnyEvent =>
  ({ type, seq: seq++, time, data })

/** One full turn: turn/start → user → step → thinking+text → paired tool → step/end → turn/end. */
function sampleEvents(): AnyEvent[] {
  seq = 0
  return [
    ev('turn/start', T0, { turn: 1 }),
    ev('user/message', T0 + 100, {
      role: 'user',
      content: [{ type: 'text', text: 'Help me fix the login bug' }],
      source: { kind: 'user' },
    }),
    ev('step/start', T0 + 200, { turn: 1, step: 1 }),
    ev('assistant/message', T0 + 1200, {
      turn: 1,
      step: 1,
      message: {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Look at the login module structure first' },
          { type: 'text', text: 'I will inspect the login-related code first' },
        ],
      },
    }),
    ev('tool/call', T0 + 1300, {
      turn: 1,
      step: 1,
      callId: 'c1',
      name: 'bash',
      arguments: '{"command":"ls -la src/"}',
    }),
    ev('tool/result', T0 + 2800, {
      turn: 1,
      step: 1,
      message: {
        role: 'tool',
        source: { callId: 'c1' },
        content: [{ type: 'tool-result', content: [{ type: 'text', text: 'ok' }] }],
      },
    }),
    ev('todo/write', T0 + 2900, {
      todos: [
        { content: 'Locate the login bug', status: 'completed' },
        { content: 'Fix and retest', status: 'in_progress' },
      ],
    }),
    ev('step/end', T0 + 3000, { turn: 1, step: 1 }),
    ev('turn/end', T0 + 3100, { turn: 1, reason: { kind: 'completed' } }),
  ]
}

// ── 1. Pure assembly ──────────────────────────────────────────────────────
const events = sampleEvents()
// oxlint-disable-next-line typescript/no-explicit-any -- fixture: structured shape matches SessionEvent
const entries = buildTraceEntries(events as any)

const kinds = entries.map(entry => entry.kind)
check('entry order: turn → user → step → thinking → assistant → tool → todo',
  kinds.join(',') === 'turn,user,step,thinking,assistant,tool,todo')

const turnEntry = entries.find(entry => entry.kind === 'turn')!
const stepEntry = entries.find(entry => entry.kind === 'step')!
const toolEntry = entries.find(entry => entry.kind === 'tool')!
check('turn pairing duration 3100ms and status ok', turnEntry.durationMs === 3100 && turnEntry.status === 'ok')
check('step pairing duration 2800ms and status ok', stepEntry.durationMs === 2800 && stepEntry.status === 'ok')
check('tool/call↔tool/result pairing by callId is 1500ms',
  toolEntry.durationMs === 1500 && toolEntry.status === 'ok')
check('tool summary = name + flattened args', toolEntry.summary === 'bash {"command":"ls -la src/"}')
check('user summary takes the first text block', entries[1]!.summary === 'Help me fix the login bug')
check('reasoning block → thinking entry', entries[3]!.summary === 'Look at the login module structure first')
check('todo summary = done/total + in-progress item', entries[6]!.summary === '1/2 · Fix and retest')

// Failed tool: error field → error status.
{
  const failEvents = [
    ev('tool/call', T0, { turn: 1, step: 1, callId: 'c9', name: 'read', arguments: '{"file_path":"/x"}' }),
    ev('tool/result', T0 + 40, {
      turn: 1,
      step: 1,
      message: { role: 'tool', source: { callId: 'c9' }, content: [] },
      error: { name: 'FsError', code: 'ENOENT' },
    }),
  ]
  // oxlint-disable-next-line typescript/no-explicit-any -- fixture
  const failed = buildTraceEntries(failEvents as any)
  check('failed tool: error status + 40ms duration',
    failed[0]!.status === 'error' && failed[0]!.durationMs === 40)
}

// Unpaired brackets stay running, with no duration.
{
  const open = buildTraceEntries([
    ev('turn/start', T0, { turn: 2 }),
    ev('tool/call', T0 + 10, { turn: 2, step: 1, callId: 'c2', name: 'bash', arguments: '{}' }),
  // oxlint-disable-next-line typescript/no-explicit-any -- fixture
  ] as any)
  check('unpaired turn/tool stay running with no duration',
    open.every(entry => entry.status === 'running' && entry.durationMs === undefined))
}

// Injected context (plugin source) does not enter the trace.
{
  const injected = buildTraceEntries([
    ev('user/message', T0, {
      role: 'user',
      content: [{ type: 'text', text: '[system] injected context' }],
      source: { kind: 'plugin', plugin: 'compact' },
    }),
  // oxlint-disable-next-line typescript/no-explicit-any -- fixture
  ] as any)
  check('plugin-injected user/message is not in the trace', injected.length === 0)
}

// ── 2. Filters ─────────────────────────────────────────────────────────
check('filter=tool keeps only tools', filterTraceEntries(entries, 'tool').every(e => e.kind === 'tool'))
check('filter=thinking keeps only thinking', filterTraceEntries(entries, 'thinking').length === 1)
check('filter=message keeps user+assistant',
  filterTraceEntries(entries, 'message').map(e => e.kind).join(',') === 'user,assistant')
check('filter=progress keeps turn+step',
  filterTraceEntries(entries, 'progress').map(e => e.kind).join(',') === 'turn,step')
check('filter=all returns the list unchanged', filterTraceEntries(entries, 'all').length === entries.length)

// ── 3. Incremental append (extendTrace) ────────────────────────────────
{
  // oxlint-disable-next-line typescript/no-explicit-any -- fixture
  const base = extendTrace(null, events.slice(0, 6) as any) // up through tool/result
  check('incremental baseline: tool is paired', base.entries.find(e => e.kind === 'tool')!.durationMs === 1500)
  // oxlint-disable-next-line typescript/no-explicit-any -- fixture
  const grown = extendTrace(base, events as any)
  check('incremental append: entry count matches the full build', grown.entries.length === entries.length)
  check('incremental append: reuses the prefix (same entries array)', grown.entries === base.entries)
  // Swap in a completely different event stream → full rebuild.
  // oxlint-disable-next-line typescript/no-explicit-any -- fixture
  const rebuilt = extendTrace(grown, [ev('todo/write', T0, { todos: [] })] as any)
  check('event-stream swap (agent switch) → full rebuild', rebuilt.entries.length === 1 && rebuilt.entries[0]!.summary === '0/0')
}

// ── 4. Formatters ──────────────────────────────────────────────────────
check('formatDuration: 350ms', formatDuration(350) === '350ms')
check('formatDuration: 1.5s', formatDuration(1500) === '1.5s')
check('formatDuration: 2m05s', formatDuration(125_000) === '2m05s')
check('formatClock: HH:MM:SS zero-padded', /^\d{2}:\d{2}:\d{2}$/.test(formatClock(T0)))
check('truncateWidth: short string unchanged', truncateWidth('abc', 10) === 'abc')
check('truncateWidth: English cuts on display width', truncateWidth('abcdefghij', 7) === 'abcdef…')
check('truncateWidth: English truncate adds an ellipsis', truncateWidth('abcdefghij', 5) === 'abcd…')

// ── 5. Component render ────────────────────────────────────────────────
function view(
  list: readonly (typeof entries)[number][],
  cursor: number,
  filter: 'all' | 'tool' | 'thinking' | 'message' | 'progress' = 'all',
): React.ReactElement {
  return React.createElement(TraceView, { entries: list, cursor, filter })
}

const app = await render(view(entries, entries.length - 1), { stdout, debug: true, exitOnCtrlC: false })
await sleep(250)

{
  const s = screen()
  check('title and filter label (en)', s.includes('Trace') && s.includes('filter: all') && s.includes('7 entries'))
  check('entry row: clock + tool summary', s.includes(formatClock(T0 + 1300)) && s.includes('bash {"command":"ls -la src/"}'))
  check('paired duration suffix (1.5s)', s.includes('(1.5s)'))
  check('thinking entry rendered', s.includes('Look at the login module structure first'))
  check('todo entry rendered', s.includes('1/2 · Fix and retest'))
  check('footer key hints', s.includes('filter') && s.includes('close'))
}

// Selected row carries a ❯ pointer (cursor on the last row = todo).
{
  const y = rowOf('1/2 · Fix and retest')
  check('selected row has ❯ pointer', y >= 0 && lines()[y]!.includes('❯'))
  // Contrast with the thinking row (the user-kind icon is itself ❯).
  const yOther = rowOf('Look at the login module structure first')
  check('unselected row has no ❯ pointer', yOther >= 0 && !lines()[yOther]!.includes('❯'))
}

// A running tool shows (…).
{
  const running = buildTraceEntries([
    ev('tool/call', T0, { turn: 1, step: 1, callId: 'c3', name: 'bash', arguments: '{"command":"sleep 5"}' }),
  // oxlint-disable-next-line typescript/no-explicit-any -- fixture
  ] as any)
  app.rerender(view(running, 0))
  await sleep(250)
  check('running tool shows (…)', screen().includes('(…)'))
}

// A long summary truncates to one line (ellipsis within the width budget).
{
  const longSummary = 'xxxxx'.repeat(60)
  const longEntries = [{
    seq: 0,
    time: T0,
    kind: 'assistant' as const,
    summary: longSummary,
  }]
  app.rerender(view(longEntries, 0))
  await sleep(250)
  const y = rowOf('xxxxx')
  check('long summary truncated (ends with …, one line)', y >= 0 && lines()[y]!.includes('…') && !screen().includes(longSummary))
}

// Window scroll: 30 entries, cursor at the end → only the last TRACE_WINDOW on screen.
{
  const many = Array.from({ length: 30 }, (_, i) => ({
    seq: i,
    time: T0 + i * 1000,
    kind: 'user' as const,
    summary: `msg ${String(i).padStart(2, '0')}`,
  }))
  app.rerender(view(many, 29))
  await sleep(250)
  const s = screen()
  check('scroll window: last entry visible', s.includes('msg 29'))
  check('scroll window: entries outside the window are hidden', !s.includes('msg 05') && !s.includes('msg 17'))
  check('scroll window: lower edge of the window is visible', s.includes(`msg ${30 - TRACE_WINDOW}`))
}

// Cursor to the top → first entries visible, bottom scroll hint.
{
  const many = Array.from({ length: 30 }, (_, i) => ({
    seq: i,
    time: T0 + i * 1000,
    kind: 'user' as const,
    summary: `top ${String(i).padStart(2, '0')}`,
  }))
  app.rerender(view(many, 0))
  await sleep(250)
  const s = screen()
  check('cursor at top: first entry visible', s.includes('top 00'))
  check('cursor at top: last entry hidden', !s.includes('top 29'))
}

// Empty state.
{
  app.rerender(view([], 0))
  await sleep(250)
  check('empty-state hint', screen().includes('No trace events yet'))
}

app.unmount()
await sleep(100)
console.log(results.join('\n'))
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
