/**
 * External editor TTY handoff regression (three bugs found in a real-machine
 * smoke test, issue #123):
 *
 * 1. The transcript goes blank after quitting the editor and only redraws
 *    once a message is sent — a vim-family editor's rmcup already bounced us
 *    back to the main screen, exitAlternateScreen's 2J lands on the main
 *    screen and erases the content, while the inline branch only calls
 *    repaint() without setting prevFrameContaminated — the blit fast path
 *    copies from an empty frontFrame → the diff produces no output → blank.
 * 2. The input box gets cleared down to a lone 'i' — leftover/late bytes
 *    from the handoff window get parsed as input: a stray ESC triggers
 *    "single-tap clear", the rest of the bytes land as text.
 * 3. Garbled text (e.g. [48;93;223;1953;2453) — same cause, a fragment of a
 *    terminal response gets inserted into the input box.
 *
 * This test reproduces the bug end to end with xterm headless + a fake
 * editor (a node child process):
 * - Writes '\x1b\x1b' to stdin during the editor session (buffered; without
 *   drain/suppression on resume, a double-Esc would clear the input and
 *   open the rewind picker)
 * - Does an xterm writeSync of rmcup (\x1b[?1049l) during the session,
 *   simulating nvim exiting and bouncing the terminal back to the main
 *   screen, so our 2J lands there too (the on-the-ground condition for bug 1)
 * - Intercepts the 1049l inside FakeStdout (the start of the resume flow)
 *   and injects "late" garbled terminal-response bytes + 'i' via
 *   setImmediate (landing inside the 120ms suppression window,
 *   deterministically covering bugs 2/3)
 *
 * Run: node --import tsx/esm scripts/repro-external-editor.tsx
 */
process.env.FORCE_COLOR = '3'

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { writeFileSync, mkdtempSync, rmSync }, { tmpdir }, { join }, { render }, { Chat }, { QuestionStore }, termTest] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('node:fs'),
  import('node:os'),
  import('node:path'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('./lib/term-test.mjs'),
])

const COLS = 100
const ROWS = 40
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 50, allowProposedApi: true })

// The moment the resume flow's 1049l is seen, immediately inject the "late
// terminal response" — suppressInputFor is already armed within the same
// synchronous block by this point, so the garbled bytes are guaranteed to land inside the window.
let lateGarbageInjected = false
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) {
    const s = String(chunk)
    if (!lateGarbageInjected && s.includes('\x1b[?1049l')) {
      lateGarbageInjected = true
      setImmediate(() => stdinObj.write('\x1b[48;93;223;1953;2453u'))
      setImmediate(() => stdinObj.write('i'))
    }
    term.write(s, cb)
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
const stdinObj = new FakeStdin()
// 等待/读屏走公共辅助（issue #532）：settle 轮询到预期状态再断言——固定
// sleep 在慢 runner 上会断言到旧屏幕；inline 模式有 scrollback 时视口从
// baseY 起，getLine(0..ROWS) 直扫会混入已滚出的行。
const { sleep, settle, writeParsed } = termTest
const screenHas = (s: string): boolean => termTest.screenHas(term, s)

const listeners = new Set<() => void>()
let rowId = 0
const channel: any = {
  version: 0,
  rows: [],
  status: 'idle',
  sessionTitle: 'probe',
  agentId: 'probe',
  model: 'deepseek-v4-flash',
  mode: { plan: false },
  reasoningEffort: 'max',
  tokens: { input: 1, output: 1 },
  cwd: '/tmp/demo',
  displayCwd: '/tmp/demo',
  gitBranch: 'main',
  working: false,
  spinnerMode: 'requesting',
  responseChars: 0,
  activeToolCount: 0,
  turnStart: Date.now(),
  lastUserText: '',
  pending: [],
  commandList: [],
  notifications: [],
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
  submit: () => {}, cancel: () => {}, clear: () => {},
  steer: () => {}, interruptAndDeliver: () => 0, removePending: () => true,
  cycleMode: () => Promise.resolve(), listFiles: () => Promise.resolve([]),
  notify(msg: string) { channel.notifications.push(msg); bump() },
  listModels: () => Promise.resolve([]), listSessions: () => [], setResumeTarget: () => {},
  loadOlder: () => {}, mcpStatus: () => [],
}
const bump = () => { channel.version++; for (const cb of listeners) cb() }

// Fake editor: sleeps 600ms (covering the whole handoff injection window) then appends ' EDITED' to the draft.
const scratch = mkdtempSync(join(tmpdir(), 'dsh-tui-repro-editor-'))
const helper = join(scratch, 'fake-editor.cjs')
writeFileSync(helper, `
const fs = require('node:fs')
const file = process.argv[2]
setTimeout(() => { fs.appendFileSync(file, ' EDITED') }, 600)
`)
const savedEditor = process.env.EDITOR
delete process.env.VISUAL
process.env.EDITOR = `"${process.execPath}" "${helper}"`

const instance = await render(
  <Chat channel={channel} questionStore={new QuestionStore()} onExit={() => {}} />,
  { stdout: new FakeStdout(), stdin: stdinObj, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)
await sleep(600)

let failed = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed++
}

// Setup: put one history message in the transcript (bug 1's assertion
// target — it's the one that goes blank), and a draft in the input box.
channel.rows.push({ id: rowId++, kind: 'user', text: 'transcript-anchor-history-message' })
bump()
await settle(() => screenHas('transcript-anchor'))
check('预备: transcript 历史消息可见', screenHas('transcript-anchor'))

stdinObj.write('什么是cordis')
await settle(() => screenHas('什么是cordis'))
check('预备: 草稿已入输入框', screenHas('什么是cordis'))

// Ctrl+G → fake editor (writes to disk and exits after 600ms)
stdinObj.write('\x07')
await sleep(250)
// Leftover bytes during the handoff session: without drain/suppression, a
// double-Esc after resume = clear input, then Esc on empty input = open the rewind picker.
stdinObj.write('\x1b\x1b')
await sleep(100)
// 模拟 nvim 的 rmcup：终端被弹回主屏，随后我们的 2J 将落在主屏上。
// write 回调在 xterm 解析完毕后触发，保证与后续 2J 的先后顺序。
await writeParsed(term, '\x1b[?1049l')

// Wait for the fill-back to complete (editor's 600ms disk write + round trip)
let roundTripped = false
for (let i = 0; i < 100; i++) {
  await sleep(50)
  if (screenHas('what is cordis EDITED')) { roundTripped = true; break }
}
check('往返: 编辑结果回填输入框', roundTripped)
// 让晚到乱码（FakeStdout 注入）与任何延迟副作用落定。
// 稳定性探针（不得改变）：下面的 bug1-3 断言的是"东西仍在/没被触发"，
// 对已成立条件轮询会立即返回等于没测——保留固定窗口。
await sleep(600)

check('bug1: transcript history message still visible (full redraw)', screenHas('transcript-anchor'))
check('bug2: input box content intact (not cleared by ESC)', screenHas('what is cordis EDITED'))
check('bug2: rewind picker not opened by a leftover double-Esc', !screenHas('Pick a message to rewind'))
check('bug3: no terminal-response fragment leaked into the UI', !screenHas('48;93') && !screenHas('2453'))

// Liveness: normal input must work again once the suppression window has passed
stdinObj.write('X')
await settle(() => screenHas('什么是cordis EDITEDX'))
check('活性: 抑制窗口结束后输入正常', screenHas('什么是cordis EDITEDX'))

if (savedEditor === undefined) delete process.env.EDITOR
else process.env.EDITOR = savedEditor
rmSync(scratch, { recursive: true, force: true })
await instance.unmount()
process.exit(failed)
