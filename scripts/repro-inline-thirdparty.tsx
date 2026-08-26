/**
 * Inline-mode third-party output pollution + viewport reanchor self-heal
 * (issues #16/#10/#17): the main-screen diff engine keeps a relative
 * cursor (no per-frame CSI H self-heal without alt-screen), assuming
 * "nobody else touches the cursor". #17 showed a child writing the tty
 * directly (mcp-client stderr into the UI) — after a quiet-period inject,
 * later incremental writes are all shifted (#16 "label row gone /
 * description misaligned").
 *
 * Three assertions:
 *  1. Baseline is clean before inject (no noise);
 *  2. After inject the pollution actually happens (error rows overlay
 *     the UI) — a precondition, not a failure; if it does not happen
 *     the scene was not set up;
 *  3. After an stdin-gap reanchor (reassertTerminalModes →
 *     requestViewportReanchor → in-place viewport redraw) the viewport
 *     matches the clean baseline (self-heal).
 * Run: node --import tsx/esm scripts/repro-inline-thirdparty.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'WezTerm'
process.env.DSH_TUI_THEME = 'dark'

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render }, { Chat }, { QuestionStore }, { sleep, settle, settled, writeParsed }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('./lib/term-test.mjs'),
])

const COLS = 100
const ROWS = 40
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 500, allowProposedApi: true })

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
function viewportLines(): string[] {
  const buf = term.buffer.active
  const start = Math.max(0, buf.length - ROWS)
  const out: string[] = []
  for (let y = start; y < buf.length; y++) out.push((buf.getLine(y)?.translateToString(true) ?? '').replace(/\s+$/, ''))
  return out
}

let failed = 0
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

const listeners = new Set<() => void>()
const channel: any = {
  version: 0, rows: [] as any[], status: 'idle', sessionTitle: 'probe', agentId: 'probe',
  model: 'deepseek-v4-flash',
  mode: { plan: false }, reasoningEffort: 'max', tokens: { input: 120, output: 45 },
  cwd: '/tmp/demo', displayCwd: '/tmp/demo', gitBranch: 'main', working: true, spinnerMode: 'requesting',
  responseChars: 0, activeToolCount: 0, turnStart: Date.now(), lastUserText: 'overview',
  pending: [], commandList: [], notifications: [],
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
  submit: () => {}, cancel: () => {}, clear: () => {}, notify: () => {},
  listModels: () => Promise.resolve([]), listSessions: () => [], setResumeTarget: () => {},
  loadOlder: () => {}, mcpStatus: () => [],
}
const bump = () => { channel.version++; for (const cb of listeners) cb() }

let id = 0
channel.rows.push({ id: id++, kind: 'user', text: 'Give me a project overview' })

const stdoutObj = new FakeStdout()
const instance = await render(
  <Chat channel={channel} questionStore={new QuestionStore()} />,
  { stdout: stdoutObj as any, stdin: new FakeStdin() as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
)
// Wait for the whale intro to settle (blink → spout → tail, then static)
// — golden and the healed snapshot are ~1s apart; an unfinished intro
// would create time-sensitive false diffs.
await sleep(3500)

// 流式短回复并定格（保持帧高 < 视口，隔离"第三方输出"变量）。
// 80ms 为模拟流式的 chunk 节拍（时间线本身是场景），保留固定 pacing。
const msg = { id: id++, kind: 'assistant', text: '', streaming: true }
channel.rows.push(msg); bump()
for (let i = 0; i < 12; i++) {
  msg.text += `- Overview point ${i + 1}: module split and build-flow notes\n`
  bump(); await sleep(80)
}
msg.streaming = false
channel.working = false
bump()
// 定格稳定窗：golden 必须取自不再重绘的稳态帧，「内容可见」不等于「不再
// 重绘」，无可轮询的完成条件——保留固定窗口。
await sleep(600)

// Baseline: clean viewport after settle.
const golden = viewportLines()

// ★ 静止期注入第三方输出（真机 #17 场景：mcp 子进程 stderr 直写 tty，
//   打在空闲时的输入框下方——之后没有大重绘来自愈）。
await writeParsed(term, '\r\n[5764] Error: Non-HTTPS URLs are only allowed for localhost\r\n[35540] Usage: npx tsx proxy.ts <https://server-url>\r\n')

// 之后只有轻微 UI 活动（通知/指标 tick 级别的小 diff）——真实空闲场景。
// 固定窗口是场景语义：断言污染在轻微活动后仍存留（稳定性探针），不可轮询。
channel.responseChars += 7; bump()
await sleep(300)
channel.responseChars += 7; bump()
await sleep(500)

const after = viewportLines()
// Precondition: pollution must actually happen (error rows stay in the
// viewport) — otherwise the scene was not set up and self-heal is moot.
const strayVisible = after.some(l => l.includes('[5764] Error') || l.includes('[35540] Usage'))
check('precondition: injected third-party rows stay in the viewport', strayVisible)

// ★ Trigger self-heal: stdin-gap reanchor (App-layer >5s gap is simple
//   arithmetic; call ink.reassertTerminalModes — same path as a keypress).
const { default: instances } = await import('../src/ink/instances.js')
const ink: any = instances.get(stdoutObj as any)
check('precondition: got the ink instance', !!ink)
ink?.reassertTerminalModes?.()
// 等待与断言共用同一快照 healed：settle 谓词即后续两条 check 的条件，无分叉。
let healed: string[] = []
await settled(() => {
  healed = viewportLines()
  return !healed.some(l => l.includes('[5764] Error') || l.includes('[35540] Usage'))
    && Array.from({ length: 12 }, (_, i) => `Overview point ${i + 1}`).every(t => healed.some(l => l.includes(t)))
})
console.log('=== 自愈后对照（G=干净基准 H=重锚后） ===')
let diffRows = 0
for (let y = 0; y < ROWS; y++) {
  if ((golden[y] ?? '') !== (healed[y] ?? '')) {
    diffRows++
    if (diffRows <= 10) {
      console.log(`row ${String(y).padStart(2)} G|${golden[y]}`)
      console.log(`     H|${healed[y]}`)
    }
  }
}
const strayAfterHeal = healed.some(l => l.includes('[5764] Error') || l.includes('[35540] Usage'))
check('healed: no third-party residue in the viewport', !strayAfterHeal)
check('healed: all 12 points are back in the viewport', Array.from({ length: 12 }, (_, i) => `Overview point ${i + 1}`).every(t => healed.some(l => l.includes(t))))
// Content-sequence compare (blank rows stripped): the 2-row physical
// scroll from the inject is irreversible — those rows are in scrollback —
// so the healed viewport is correct but shifted. Users see the non-empty
// sequence; a shift is invisible. Matching sequences means heal is done.
const seq = (ls: string[]) => ls.filter(l => l.trim() !== '')
const goldenSeq = seq(golden)
const healedSeq = seq(healed)
const seqEqual = goldenSeq.length === healedSeq.length && goldenSeq.every((l, i) => l === healedSeq[i])
if (!seqEqual) {
  console.log('=== sequence diffs ===')
  for (let i = 0; i < Math.max(goldenSeq.length, healedSeq.length); i++) {
    if ((goldenSeq[i] ?? '') !== (healedSeq[i] ?? '')) {
      console.log(`seq ${String(i).padStart(2)} G|${goldenSeq[i]}`)
      console.log(`     H|${healedSeq[i]}`)
    }
  }
}
check('healed: viewport content sequence matches the clean baseline', seqEqual, `G=${goldenSeq.length} rows H=${healedSeq.length} rows (absolute rows may shift)`)

console.log(failed === 0 ? '\nALL PASS (third-party pollution self-healed via stdin-gap reanchor)' : `\n${failed} check(s) failed`)
await instance.unmount()
process.exit(failed === 0 ? 0 : 1)
