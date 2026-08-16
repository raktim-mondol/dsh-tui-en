/**
 * Long-list picker focus-windowing regression: under a height-limited
 * floater (OverlayAbove maxHeight + overflow hidden), rendering a list in
 * full crops the focus row off-screen; and if windowing slices by **item
 * count** alone, a list item with a description (always 2 rows: body +
 * description) still crops the focus row out — a 30-row terminal with 30
 * models each carrying a description leaves focus at index 0 completely
 * invisible, and the user may blind-press Enter (especially dangerous in
 * the rewind scenario).
 *
 * Coverage:
 *  - listWindow pure-function boundary table + property sweep (focus always
 *    inside the window, window never exceeds the row budget);
 *  - ListItem's single-line contract asserted directly: top-level string /
 *    JSX-interpolated array / nested Fragment embedded newlines all
 *    flatten, description single-lines too, actual on-screen row count
 *    matches the declared row height;
 *  - ModelPicker: 30 models **with a description**, focus on-screen at the
 *    first/middle position;
 *  - HistorySearchDialog: 30 history entries (always 2 rows + container
 *    gap=1), focus on-screen at first/middle/last;
 *  - ThemePicker: a custom theme whose displayName has internal newlines
 *    renders on one line (production path);
 *  - RewindPicker: 30 user messages, focus on-screen at first/middle/last
 *    (the first item carries a 'last message' description).
 *
 * "On-screen" is determined by: the focus row's ❯/body text is the
 * suggestion theme color (#ABC2EC), compared cell by cell against the
 * foreground color — a transcript echo row with the same text (grey
 * background) won't be mistaken as on-screen.
 *
 * Run: node --import tsx/esm scripts/repro-picker-windowing.tsx
 * DUMP=1 dumps the screen at every assertion point.
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'WezTerm'
process.env.DSH_TUI_THEME = 'dark'
process.env.DSH_TUI_LANG = 'zh'

// Isolate HOME: modelPrefs/history resolve homedir() at module load, so
// this must switch to a temp directory before importing src; picker
// interaction never touches any real preference file.
const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join: joinPath } = await import('node:path')
process.env.HOME = mkdtempSync(joinPath(tmpdir(), 'dshtui-repro-home-'))

// ctrl+r data source: 30 history commands (each renders 2 rows: command + age description).
const NOW = Date.now()
mkdirSync(joinPath(process.env.HOME, '.dsh-tui'), { recursive: true })
writeFileSync(
  joinPath(process.env.HOME, '.dsh-tui', 'history.jsonl'),
  Array.from({ length: 30 }, (_, i) =>
    JSON.stringify({ text: `histcmd-${String(i).padStart(2, '0')}`, ts: NOW }),
  ).join('\n') + '\n',
  'utf8',
)
// /theme data source: a custom theme whose displayName carries internal
// newlines (customTheme allows displayName to keep internal newlines;
// ThemePicker's label is a Fragment wrapping the displayName — a confirmed
// production path).
mkdirSync(joinPath(process.env.HOME, '.dsh-tui', 'themes'), { recursive: true })
writeFileSync(
  joinPath(process.env.HOME, '.dsh-tui', 'themes', 'nltheme.json'),
  JSON.stringify({ name: 'nltheme', displayName: 'Foo\nBar NL', base: 'dark' }) + '\n',
  'utf8',
)

const [
  { PassThrough, Writable },
  React,
  { Terminal: XTerm },
  { render, Box, Text },
  { Chat },
  { QuestionStore },
  { createChannel },
  { listWindow },
  { ListItem },
] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('../src/dsh-adapter/channel.js'),
  import('../src/components/listWindow.js'),
  import('../src/components/design-system/ListItem.js'),
])

const COLS = 100
const ROWS = 30
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 2000, allowProposedApi: true })
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) {
    term.write(String(chunk), () => cb())
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

// console.error collection: production defaults to patchConsole, so a
// React key warning would land in the error log instead of the terminal;
// this intercepts console.error and asserts **strictly zero** at the end —
// filtering to only React warnings would silently swallow other errors and
// let CI go green regardless (confirmed: injecting
// console.error('synthetic failure') still reported the script as passing).
const consoleErrors: string[] = []
const origConsoleError = console.error
console.error = (...args: unknown[]) => {
  consoleErrors.push(args.map(String).join(' '))
}

let failed = 0
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}
function screenLines(): string[] {
  const buf = term.buffer.active
  const out: string[] = []
  for (let y = buf.baseY; y < buf.baseY + ROWS; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  return out
}
function dump(tag: string) {
  if (process.env.DUMP !== '1') return
  console.log(`--- dump: ${tag}`)
  screenLines().forEach((l, i) => console.log(String(i).padStart(2), l.replace(/\s+$/u, '').slice(0, 90)))
}

/** dark theme's suggestion color (the fg of the focus row's ❯/body). */
const SUGGESTION_RGB = 0xABC2EC
/**
 * Whether the focus row is on-screen: contains `text` and at least one
 * cell's foreground is the suggestion color. A transcript echo row with the
 * same text is not this color, so it won't be mistaken (the rewind
 * assertions depend on this).
 */
function focusLineVisible(text: string): boolean {
  const buf = term.buffer.active
  for (let y = buf.baseY; y < buf.baseY + ROWS; y++) {
    const line = buf.getLine(y)
    if (!line || !line.translateToString(true).includes(text)) continue
    for (let x = 0; x < COLS; x++) {
      const cell = line.getCell(x)
      if (cell && cell.getChars() && (cell.getFgColor() & 0xffffff) === SUGGESTION_RGB) return true
    }
  }
  return false
}

// ---------------------------------------------------------------- listWindow
// Pure-function boundary table: every case's expected value was hand-derived
// following "focus centered, alternately expand both sides, fit as much as
// the budget allows".
const winCases: Array<{
  name: string
  heights: number[]
  focus: number
  maxRows: number
  gap?: number
  want: readonly [number, number]
}> = [
  { name: 'empty list', heights: [], focus: 0, maxRows: 10, want: [0, 0] },
  { name: 'single item', heights: [2], focus: 0, maxRows: 10, want: [0, 1] },
  { name: 'focus clamps when out of range above', heights: [1, 1, 1], focus: 99, maxRows: 3, want: [0, 3] },
  { name: 'focus clamps when out of range below', heights: [1, 1, 1], focus: -1, maxRows: 3, want: [0, 3] },
  { name: 'single-row centering', heights: Array(30).fill(1), focus: 10, maxRows: 5, want: [8, 13] },
  { name: 'start boundary', heights: Array(30).fill(1), focus: 0, maxRows: 5, want: [0, 5] },
  { name: 'end boundary', heights: Array(30).fill(1), focus: 29, maxRows: 5, want: [25, 30] },
  { name: 'even budget biases upward', heights: Array(30).fill(1), focus: 10, maxRows: 4, want: [8, 12] },
  { name: 'budget of 1 shows only the focus item', heights: Array(30).fill(1), focus: 10, maxRows: 1, want: [10, 11] },
  { name: 'budget of 0 still includes the focus item', heights: Array(30).fill(1), focus: 10, maxRows: 0, want: [10, 11] },
  { name: 'two-row items sliced by row count', heights: Array(30).fill(2), focus: 0, maxRows: 17, want: [0, 8] },
  { name: 'two-row items + gap', heights: Array(30).fill(2), focus: 0, maxRows: 12, gap: 1, want: [0, 4] },
  { name: 'mixed row heights (first item 2 rows)', heights: [2, ...Array(29).fill(1)], focus: 0, maxRows: 4, want: [0, 3] },
  { name: 'the focus item alone exceeds the budget', heights: [5, 5, 5], focus: 1, maxRows: 3, want: [1, 2] },
  { name: 'centering with a gap', heights: Array(30).fill(1), focus: 10, maxRows: 5, gap: 1, want: [9, 12] },
]
for (const c of winCases) {
  const got = listWindow(c.heights, c.focus, c.maxRows, c.gap ?? 0)
  check(
    `listWindow ${c.name}`,
    got.start === c.want[0] && got.end === c.want[1],
    `want [${c.want[0]},${c.want[1]}) got [${got.start},${got.end})`,
  )
}
// Property sweep: for any input, focus is always inside the window; the
// window may exceed the budget only when it's the focus item alone.
{
  let sweepOk = true
  let badCase = ''
  const patterns = [Array(30).fill(1), Array(30).fill(2), [2, ...Array(29).fill(1)]]
  for (const heights of patterns) {
    for (const gap of [0, 1]) {
      for (let maxRows = 0; maxRows <= 20; maxRows++) {
        for (let focus = 0; focus < 30; focus++) {
          const { start, end } = listWindow(heights, focus, maxRows, gap)
          let used = 0
          for (let i = start; i < end; i++) used += heights[i] + (i > start ? gap : 0)
          if (!(start <= focus && focus < end) || (end - start > 1 && used > maxRows)) {
            sweepOk = false
            badCase = `len=${heights.length} h0=${heights[0]} gap=${gap} maxRows=${maxRows} focus=${focus} → [${start},${end}) used=${used}`
            break
          }
        }
      }
    }
  }
  check('listWindow property sweep (focus inside window, budget respected)', sweepOk, badCase)
}

// ------------------------------------------- ListItem single-line contract
// Renders the component tree with marker rows directly, asserting the
// actual on-screen row count matches the declared row height: newline
// flattening must reach through top-level strings, JSX-interpolated
// arrays, and nested Fragments; description single-lines the same way.
{
  const term2 = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
  class FakeStdout2 extends Writable {
    columns = COLS
    rows = ROWS
    isTTY = true
    _write(chunk: unknown, _e: BufferEncoding, cb: () => void) {
      term2.write(String(chunk), () => cb())
    }
  }
  const ui2 = await render(
    <Box flexDirection="column">
      <Text>M0</Text>
      <ListItem isFocused>{'Foo\nBar'}</ListItem>
      <Text>M1</Text>
      <ListItem isFocused>{'aa\nbb'} / {'cc'}</ListItem>
      <Text>M2</Text>
      <ListItem isFocused>
        <>
          {'Frag\nMent'}
          {'  '}
          <Text>XX</Text>
        </>
      </ListItem>
      <Text>M3</Text>
      <ListItem isFocused description={'D1\nD2'}>
        Plain
      </ListItem>
      <Text>M4</Text>
    </Box>,
    { stdout: new FakeStdout2(), stdin: new FakeStdin(), stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(300)
  const lines2: string[] = []
  for (let y = term2.buffer.active.baseY; y < term2.buffer.active.baseY + ROWS; y++) {
    lines2.push(term2.buffer.active.getLine(y)?.translateToString(true) ?? '')
  }
  const rowOf2 = (needle: string) => lines2.findIndex(l => l.includes(needle))
  check('contract: top-level string newline flattening (exactly 1 row)',
    rowOf2('M1') === rowOf2('M0') + 2 && (lines2[rowOf2('M0') + 1] ?? '').includes('Foo Bar'),
    lines2.slice(rowOf2('M0'), rowOf2('M1') + 1).map(l => l.trim()).join(' ⏎ '))
  check('contract: interpolated array string fragment flattening (exactly 1 row)',
    rowOf2('M2') === rowOf2('M1') + 2 && (lines2[rowOf2('M1') + 1] ?? '').includes('aa bb / cc'),
    lines2.slice(rowOf2('M1'), rowOf2('M2') + 1).map(l => l.trim()).join(' ⏎ '))
  check('contract: string newline flattening inside a Fragment (exactly 1 row, swatch on the same row)',
    rowOf2('M3') === rowOf2('M2') + 2 &&
      (lines2[rowOf2('M2') + 1] ?? '').includes('Frag Ment') &&
      (lines2[rowOf2('M2') + 1] ?? '').includes('XX'),
    lines2.slice(rowOf2('M2'), rowOf2('M3') + 1).map(l => l.trim()).join(' ⏎ '))
  check('contract: description newline flattening (body+description exactly 2 rows)',
    rowOf2('M4') === rowOf2('M3') + 3 && (lines2[rowOf2('M3') + 2] ?? '').includes('D1 D2'),
    lines2.slice(rowOf2('M3'), rowOf2('M4') + 1).map(l => l.trim()).join(' ⏎ '))
  ui2.unmount()
}

// ----------------------------------------------------------------- app scenarios
// 30 rounds of user messages as filler (the rewind data source; the rewind list is user messages newest→oldest).
const events: Array<Record<string, unknown>> = []
for (let i = 0; i < 30; i++) {
  events.push(
    { seq: i * 3, time: NOW + i * 30, type: 'turn/start', data: { turn: i } },
    {
      seq: i * 3 + 1,
      time: NOW + i * 30 + 5,
      type: 'user/message',
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: `rewind message ${String(i).padStart(2, '0')}` }] },
    },
    { seq: i * 3 + 2, time: NOW + i * 30 + 10, type: 'turn/end', data: { turn: i, reason: { kind: 'completed' } } },
  )
}
const stubAgentCtx = { on: () => () => {} }
function makeAgent(id: string, sessionEvents: readonly unknown[]) {
  return {
    id, status: 'idle',
    session: { id: `s-${id}`, seq: sessionEvents.length, events: sessionEvents, header: {} },
    ctx: stubAgentCtx, followup() {}, steer() {}, inbox: { remove: () => true },
  }
}
// 30 models **with a description**: 2 rows each — a no-description
// scenario no longer covers this production path (confirmed: index 0's
// focus was still cropped off-screen).
const MODELS = Array.from({ length: 30 }, (_, i) => ({
  provider: 'fake-provider',
  id: `model-${String(i).padStart(2, '0')}`,
  name: `Model ${String(i).padStart(2, '0')}`,
  description: `fake model desc ${String(i).padStart(2, '0')}`,
}))
const services: Record<string, unknown> = {
  sessions: { fork(session: { events: readonly unknown[] }) { return { events: session.events } } },
  agents: {
    async create(options: { sessionId: string; seed: readonly unknown[] }) {
      return { agent: makeAgent('fork-1', options.seed), dispose: async () => {} }
    },
  },
  llm: {
    listProviders: () => [{ id: 'fake-provider' }],
    listModels: async () => MODELS,
  },
}
const ctx = {
  on: () => () => {},
  get: (name: string) => services[name],
  logger: { warn() {} },
}
const channel = createChannel(ctx as never, makeAgent('a1', events) as never, {
  model: 'model-00', cwd: '/tmp/demo', provider: 'fake-provider', activity: false,
})

const stdin = new FakeStdin()
const instance = await render(
  <Chat channel={channel as never} questionStore={new QuestionStore()} onExit={() => {}} />,
  { stdout: new FakeStdout(), stdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)
await sleep(1200)

const typeKeys = async (s: string, stepMs = 40) => {
  for (const ch of s) { stdin.write(ch); await sleep(stepMs) }
}

// ------------------------------------------------------------- ModelPicker
{
  const bufBefore = term.buffer.active.length
  await typeKeys('/model')
  await sleep(200)
  stdin.write('\r')
  await sleep(600)
  // Focus starts on the current model model-00 (index 0): even at 2 rows per item it must stay on screen.
  check('/model focus 0 on-screen (with description, 2 rows per item)', focusLineVisible('Model 00'))
  check('/model opening causes zero buffer growth', term.buffer.active.length === bufBefore,
    `${bufBefore} → ${term.buffer.active.length}`)
  dump('model focus 0')
  for (let i = 0; i < 20; i++) { stdin.write('\x1b[B'); await sleep(25) }
  await sleep(400)
  check('/model ↓×20 focus 20 on-screen', focusLineVisible('Model 20'))
  dump('model focus 20')
  stdin.write('\x1b')
  await sleep(400)
}

// ----------------------------------------------------- HistorySearchDialog
{
  const bufBefore = term.buffer.active.length
  stdin.write('\x12') // ctrl+r
  await sleep(500)
  // History newest→oldest: the newest entry is the '/model' really typed in
  // the previous phase (appendHistory persisted it), followed by the
  // pre-seeded histcmd-29…00. Focus 0 = '/model'.
  check('ctrl+r focus 0 on-screen (2-row items + gap)', focusLineVisible('/model'))
  check('ctrl+r opening causes zero buffer growth', term.buffer.active.length === bufBefore,
    `${bufBefore} → ${term.buffer.active.length}`)
  dump('history focus 0')
  stdin.write('\x1b[A') // ↑ wraps from 0 to the last item
  await sleep(300)
  check('ctrl+r ↑ wraps to the last item, focus on-screen', focusLineVisible('histcmd-00'))
  stdin.write('\x1b[B') // ↓ wraps back to 0
  await sleep(200)
  for (let i = 0; i < 15; i++) { stdin.write('\x1b[B'); await sleep(25) }
  await sleep(300)
  // Index 15 = histcmd-15 (index 0 is '/model', index 1 is histcmd-29).
  check('ctrl+r ↓×15 focus 15 on-screen', focusLineVisible('histcmd-15'))
  dump('history focus 15')
  stdin.write('\x1b')
  await sleep(400)
}

// ------------------------------------------------------------ ThemePicker
// Production path: a custom theme whose displayName has internal newlines,
// label is a Fragment wrapping displayName + a color swatch. After
// flattening, the row occupies exactly one line with the name and swatch
// on it. Placed after the history phase: typing '/theme' adds a history
// entry, which doesn't affect the earlier assertions.
{
  await typeKeys('/theme')
  await sleep(200)
  stdin.write('\r')
  await sleep(600)
  const lines = screenLines()
  const nameRow = lines.findIndex(l => l.includes('Foo Bar NL'))
  check('/theme newline displayName renders on one line with the swatch',
    nameRow !== -1 && (lines[nameRow] ?? '').includes('██'),
    nameRow === -1 ? 'Foo Bar NL row not found' : lines[nameRow]!.trim().slice(0, 60))
  check('/theme has no leaked newline row (Bar NL must not become its own row)',
    !lines.some(l => /^\s*Bar NL/u.test(l)))
  dump('theme newline displayName')
  stdin.write('\x1b')
  await sleep(400)
}

// ------------------------------------------------------------ RewindPicker
{
  const bufBefore = term.buffer.active.length
  stdin.write('\x1b') // double-Esc (empty input) opens rewind
  await sleep(100)
  stdin.write('\x1b')
  await sleep(600)
  // Focus 0 = the newest user message; the first item carries a 'last message' description (2 rows).
  check('rewind focus 0 on-screen (first item 2 rows)', focusLineVisible('rewind message 29'))
  check('rewind first item description row on-screen', screenLines().some(l => l.includes('last message')))
  check('rewind opening causes zero buffer growth', term.buffer.active.length === bufBefore,
    `${bufBefore} → ${term.buffer.active.length}`)
  dump('rewind focus 0')
  stdin.write('\x1b[A') // ↑ wraps to the last item = the oldest one
  await sleep(300)
  check('rewind ↑ wraps to the last item, focus on-screen', focusLineVisible('rewind message 00'))
  stdin.write('\x1b[B') // ↓ wraps back to 0
  await sleep(200)
  for (let i = 0; i < 15; i++) { stdin.write('\x1b[B'); await sleep(25) }
  await sleep(300)
  // Index 15 = rewind message 14 (index 0 is the newest, 29).
  check('rewind ↓×15 focus 15 on-screen', focusLineVisible('rewind message 14'))
  dump('rewind focus 15')
  stdin.write('\x1b')
  await sleep(400)
}

instance.unmount()
// Restore first, then assert: errors produced after restoring go through
// native console.error and are directly visible, not swallowed; if any
// phase above throws, the uncaught exception exits non-zero at the top
// level and CI still goes red.
console.error = origConsoleError
check('no console.error anywhere (React key warnings, etc.)', consoleErrors.length === 0,
  consoleErrors[0]?.split('\n')[0]?.slice(0, 120) ?? '')
if (failed > 0) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll passed')
process.exit(0)
