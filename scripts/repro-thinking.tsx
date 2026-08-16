/**
 * Thinking-spinner ghost regression (one of the issue #72 symptoms).
 *
 * Background: the spinner glyph ✳ (U+2733) is a text-default emoji that
 * the terminal paints 1 cell wide, but stringWidth's JS fallback used to
 * measure every emoji-regex match as 2 cells. Each time the spinner
 * frame hit ✳ the whole row shifted by 1 column, and thinking-text
 * ghosts ("tthinking", a stray t) piled up and never cleared.
 *
 * This script headless-renders full-screen Chat: working=true,
 * spinnerMode='thinking', assistant text streaming (forced growth +
 * stickyScroll). Capture every frame byte, replay in xterm-headless,
 * and assert the viewport is clean:
 *
 * - exactly 1 row contains 'thinking' (the spinner row; streamed text
 *   deliberately avoids that word)
 * - no 'tthinking' overlap
 * - no stray isolated 't' (any column, whitespace or EOL on both sides)
 *
 * Run: node --import tsx/esm scripts/repro-thinking.tsx
 * Optional: COLS/ROWS env vars set the terminal size. Non-zero on fail.
 */
process.env.FORCE_COLOR = '3'

const [{ PassThrough, Writable }, React, { render }, { Chat }, { QuestionStore }, { Terminal: XTerm }, fs] =
  await Promise.all([
    import('node:stream'),
    import('react'),
    import('../src/ui.js'),
    import('../src/screens/Chat.js'),
    import('../src/questions.js'),
    import('@xterm/headless'),
    import('node:fs'),
  ])

const COLS = Number(process.env.COLS ?? 100)
const ROWS = Number(process.env.ROWS ?? 28)

class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  frames: string[] = []
  _write(chunk: unknown, _encoding: BufferEncoding, callback: () => void) {
    this.frames.push(String(chunk))
    callback()
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

// ── Mutable channel: one thinking turn + streaming output ──
const rows: any[] = [
  { id: 0, kind: 'user', text: 'Help me analyze possible causes of this render issue' },
]
let version = 0
const listeners = new Set<() => void>()
const channel = {
  get version() { return version },
  rows,
  status: 'working',
  sessionTitle: 'repro',
  agentId: 'repro',
  model: 'deepseek-v4-flash',
  tokens: { input: 120, output: 45 },
  cwd: '/tmp/repro',
  gitBranch: 'main',
  working: true,
  spinnerMode: 'thinking',
  get responseChars() { return currentText.length },
  activeToolCount: 0,
  mode: { id: 'default', plan: false },
  modeIndex: 0,
  cycleMode() {},
  turnStart: Date.now(),
  lastUserText: 'Help me analyze possible causes of this render issue',
  pending: [],
  commandList: [],
  notifications: [],
  activityEnabled: false, // force WorkingSpinner (not ActivityLine)
  contextBarEnabled: false,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  submit: () => {},
  cancel: () => {},
  clear: () => {},
  notify: () => {},
  listModels: () => Promise.resolve([]),
  listSessions: () => [],
  setResumeTarget: () => {},
} as never

let currentText = ''
let nextId = 1
function pushChunk(chunk: string) {
  currentText += chunk
  // Update the in-flight assistant row
  const last = rows[rows.length - 1]
  if (last && last.kind === 'assistant' && last.streaming) {
    last.text = currentText
  } else {
    rows.push({ id: nextId++, kind: 'assistant', text: currentText, streaming: true })
  }
  version++
  for (const fn of listeners) fn()
}

const stdout = new FakeStdout()
const instance = await render(
  React.createElement(Chat, { channel, questionStore: new QuestionStore(), onExit: () => {} }),
  {
    stdout,
    stdin: new FakeStdin(),
    stderr: new FakeStderr(),
    exitOnCtrlC: false,
    patchConsole: false,
  },
)

// Let the first paint settle
await new Promise(r => setTimeout(r, 500))

// Stream text for ~6s while thinking stays on. The body avoids the word
// 'thinking' and any isolated ASCII 't' so ghost asserts stay unambiguous.
const CHUNKS = [
  'OK, ', 'let me analyze ', 'this issue. ', 'First, ', 'the renderer ', 'uses relative ', 'cursor moves ',
  'to redraw ', 'changed cells. ', 'If the virtual ', 'cursor and real ', 'terminal cursor ', 'fall out of sync, ',
  'writes land ', 'in the wrong ', 'place. ', 'Specifically, ', 'the animation row ', 'redraws every 50ms, ',
  'and shimmer colors ', 'change each frame. ', 'That causes ', 'every cell on that row ',
  'to be rewritten each frame. ', 'If the cursor model ', 'is off by one row, ', 'the rewrite ', 'lands on the next row ',
  'and leaves a ghost. ', 'That is why ', 'several glyphs ', 'pile up. ', 'Analysis done.',
]
for (const chunk of CHUNKS) {
  pushChunk(chunk)
  await new Promise(r => setTimeout(r, 120))
}

// Let the spinner idle a few more frames
await new Promise(r => setTimeout(r, 800))

const byteStream = stdout.frames.join('')
try { instance.unmount() } catch {}

// ── xterm-headless replay ──
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 500, allowProposedApi: true })
term.write(byteStream)
await new Promise(r => setTimeout(r, 1200))

const buf = term.buffer.active
const lines: string[] = []
for (let y = 0; y < ROWS; y++) {
  lines.push(buf.getLine(y)?.translateToString(true) ?? '')
}

// ── Ghost detection ──
const problems: string[] = []
let thinkingRows = 0
lines.forEach((line, y) => {
  if (line.includes('thinking')) thinkingRows++
  if (/tthinking/.test(line)) problems.push(`row ${y}: overlap ghost "tthinking" → ${JSON.stringify(line)}`)
  // Isolated 't': whitespace / SOL / EOL on both sides (streamed text has no lone ASCII t)
  const m = line.match(/(?:^|\s)t(?=\s|$)/)
  if (m) problems.push(`row ${y}: isolated 't' ghost → ${JSON.stringify(line)}`)
})
if (thinkingRows !== 1) {
  problems.push(`rows containing 'thinking': ${thinkingRows} (expected 1, the spinner row)`)
}

if (problems.length > 0) {
  const dump = '/tmp/repro-thinking-frames.bin'
  fs.writeFileSync(dump, byteStream)
  console.error(`FAIL: thinking-spinner ghost regression (frames dumped to ${dump})`)
  console.error(`=== xterm-headless replay: ${COLS}x${ROWS} (viewport baseY=${buf.baseY}) ===`)
  lines.forEach((line, y) => console.error(`${String(y).padStart(3)}|${line}`))
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}

console.log(`PASS: thinking spinner has no ghosts (${COLS}x${ROWS}, exactly 1 'thinking' row)`)
process.exit(0)
