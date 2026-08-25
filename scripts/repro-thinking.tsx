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
 * - 恰有 1 行以 spinner 状态 "· thinking)" 收尾（不能用裸词 'thinking'：
 *   随机启动 tip 有 4/100 条文案含该词，撞上即误报）
 * - 无 'tthinking' 叠字
 * - 无孤立残影 't'（任意列，两侧为空白或行尾）
 *
 * Run: node --import tsx/esm scripts/repro-thinking.tsx
 * Optional: COLS/ROWS env vars set the terminal size. Non-zero on fail.
 */
process.env.FORCE_COLOR = '3'

const [{ PassThrough, Writable }, React, { render }, { Chat }, { QuestionStore }, { Terminal: XTerm }, fs, { writeParsed, viewportLines }] =
  await Promise.all([
    import('node:stream'),
    import('react'),
    import('../src/ui.js'),
    import('../src/screens/Chat.js'),
    import('../src/dsh-adapter/questions.js'),
    import('@xterm/headless'),
    import('node:fs'),
    import('./lib/term-test.mjs'),
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
  displayCwd: '/tmp/repro',
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

// ── xterm-headless 回放 ──
// write 是异步分块解析的：必须等回调而不是固定 sleep，否则慢机器上
// 断言读到解析了一半的屏幕。
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 500, allowProposedApi: true })
await writeParsed(term, byteStream)

// 扫可见视口（baseY 起的 ROWS 行）。裸 getLine(0..ROWS) 在有 scrollback 时
// 读的是缓冲区开头：混入已滚出的旧行、漏掉视口底部 baseY 行——残影恰恰
// 最容易出现在底部 spinner 附近。
const lines = viewportLines(term, ROWS)

// ── Ghost detection ──
const problems: string[] = []
let spinnerRows = 0
lines.forEach((line, y) => {
  // spinner 状态行以 "… · thinking)" 收尾；裸词 'thinking' 不能当指纹——
  // 启动 tip 是 Math.random 抽的，100 条里 4 条文案含 'thinking'
  // （如“工具卡/thinking/摘要点击展开”），抽中即误报（约 4%/次的假 flaky）。
  if (/·\s*thinking\)/.test(line)) spinnerRows++
  if (/tthinking/.test(line)) problems.push(`row ${y}: 叠字残影 "tthinking" → ${JSON.stringify(line)}`)
  // 孤立 't'：两侧为空白/行首行尾（灌入文本与全部 tip 文案均不含孤立
  // ASCII 't'，出现即残影）
  const m = line.match(/(?:^|\s)t(?=\s|$)/)
  if (m) problems.push(`row ${y}: isolated 't' ghost → ${JSON.stringify(line)}`)
})
if (spinnerRows !== 1) {
  problems.push(`spinner 状态行（"· thinking)" 结尾）数为 ${spinnerRows}（期望 1）`)
}

if (problems.length > 0) {
  const dump = '/tmp/repro-thinking-frames.bin'
  fs.writeFileSync(dump, byteStream)
  console.error(`FAIL: thinking spinner 残影回归（帧字节已存 ${dump}）`)
  console.error(`=== xterm-headless replay: ${COLS}x${ROWS} (viewport baseY=${term.buffer.active.baseY}) ===`)
  lines.forEach((line, y) => console.error(`${String(y).padStart(3)}|${line}`))
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}

console.log(`PASS: thinking spinner 无残影（${COLS}x${ROWS}，spinner 状态行恰 1 行）`)
process.exit(0)
