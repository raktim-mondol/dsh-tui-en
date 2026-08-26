/**
 * `/model` switch scrollback duplication regression (found on a real
 * machine: every switch deposits one extra splash copy into scrollback,
 * +18 lines each time). Uses the real channel (createChannel) + a minimal
 * fake agent/sessions/agents service, driving the full UI path key by key
 * (type /model → completion floater → picker → fork+replay); xterm-headless
 * with 2000 lines of scrollback rebuilds the terminal's view, asserting
 * unique UI text like the splash/history appears exactly once across
 * scrollback + viewport, with zero buffer growth.
 *
 * Root cause: transient panels (completion/picker) mounted in-flow let the
 * frame height rise and fall; the frame's top rows get scrolled into
 * scrollback and then rewritten a second time by the closing redraw. Fix:
 * transient panels moved to OverlayAbove's zero-height floater.
 *
 * Run: node --import tsx/esm scripts/repro-model-switch-scrollback.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'WezTerm'  // DEC-2026 synchronized-output path
process.env.DSH_TUI_THEME = 'dark'     // skip OSC 11 probing, stay deterministic
process.env.DSH_TUI_LANG = 'en'        // pin the UI language (splash tagline assertion)

// Isolate HOME: switchModel writes the picker's choice into
// ~/.dsh-tui/model.json (modelPrefs.PREFS_DIR resolves via homedir() at
// module load), so without isolation this would write fake-provider into
// the real machine's config — every turn on the next real launch would then
// report "no adapter registered for provider fake-provider". Must run
// before importing src.
// HOME and USERPROFILE must be set as a pair: os.homedir() reads HOME on
// POSIX and USERPROFILE on Windows, so setting only one leaves the other
// platform completely unisolated.
const { mkdtempSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join: joinPath } = await import('node:path')
const reproHome = mkdtempSync(joinPath(tmpdir(), 'dshtui-repro-home-'))
process.env.HOME = reproHome
process.env.USERPROFILE = reproHome

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render }, { Chat }, { QuestionStore }, { createChannel }, { settled, sleep }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('../src/dsh-adapter/channel.js'),
  import('./lib/term-test.mjs'),
])

const COLS = 100
const ROWS = 30
const SCROLLBACK = 2000
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: SCROLLBACK, allowProposedApi: true })

const rawChunks: string[] = []
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) {
    const str = String(chunk)
    rawChunks.push(str)
    term.write(str, () => cb())
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
function fullBufferLines(): string[] {
  const buf = term.buffer.active
  const out: string[] = []
  for (let y = 0; y < buf.length; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  return out
}

let failed = 0
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

/** How many times a unique marker appears across scrollback+viewport (line-by-line substring match). */
function countMarker(marker: string): number {
  return fullBufferLines().filter(l => l.includes(marker)).length
}

// ---- SessionEvent fixtures: 2 rounds of history (user + reasoning + a long assistant reply) ----
let seq = 0
let now = Date.now()
function ev(type: string, data: Record<string, unknown>): Record<string, unknown> {
  return { seq: seq++, time: (now += 5), type, data }
}
function userEvent(text: string) {
  return ev('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text }] })
}
function assistantEvent(text: string, turn: number) {
  return ev('assistant/message', {
    turn, step: 0,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    usage: { inputTokens: 100, outputTokens: 50 },
  })
}
const events: Array<Record<string, unknown>> = []
for (let turn = 0; turn < 2; turn++) {
  events.push(ev('turn/start', { turn }))
  events.push(userEvent(`history question ${turn}: check the build config`))
  const body = Array.from(
    { length: 12 },
    (_, i) => `- history answer point ${turn}-${i}: assembly, theming, sync, and encrypted packaging`,
  ).join('\n')
  events.push(assistantEvent(`history answer ${turn}:\n\n${body}`, turn))
  events.push(ev('turn/end', { turn, reason: { kind: 'completed' } }))
}

// ---- Minimal fake agent / sessions / agents -----------------------------------
const stubAgentCtx = { on: () => () => {} }
function makeAgent(id: string, sessionEvents: readonly unknown[]) {
  return {
    id,
    status: 'idle',
    session: { id: `s-${id}`, seq: sessionEvents.length, events: sessionEvents, header: {} },
    ctx: stubAgentCtx,
    followup() {},
    steer() {},
    inbox: { remove: () => true },
  }
}
let agentCounter = 0
const handlers = new Map<string, unknown>()
const services: Record<string, unknown> = {
  sessions: {
    fork(session: { events: readonly unknown[] }) {
      return { events: session.events }
    },
  },
  agents: {
    async create(options: { sessionId: string; seed: readonly unknown[] }) {
      agentCounter += 1
      const agent = makeAgent(`fork-${agentCounter}`, options.seed)
      return { agent, dispose: async () => {} }
    },
  },
  llm: {
    listProviders: () => [{ id: 'fake-provider' }],
    listModels: async () => [
      { provider: 'fake-provider', id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      { provider: 'fake-provider', id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
  },
}
const ctx = {
  on(event: string, handler: unknown) {
    handlers.set(event, handler)
    return () => handlers.delete(event)
  },
  get(name: string) {
    return services[name]
  },
  logger: { warn() {} },
}

// ---- Real channel + real Chat ---------------------------------------------------
const channel = createChannel(ctx as never, makeAgent('a1', events) as never, {
  model: 'deepseek-v4-flash',
  cwd: '/tmp/demo',
  provider: 'fake-provider',
  activity: false,
})

const stdoutObj = new FakeStdout()
const stdin = new FakeStdin()
const instance = await render(
  <Chat channel={channel as never} questionStore={new QuestionStore()} onExit={() => {}} />,
  { stdout: stdoutObj, stdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)

const SPLASH = 'Explore the uncharted'
const HIST0 = 'history question 0: check the build config'
const HIST1 = 'history answer 1:'
// boot 落定：轮询到 splash 与历史行都上屏再断言（原固定 1200ms 在慢
// runner 上会断言到未画完的缓冲区）——等待与断言共用同一谓词（settled）。
check('boot 后 splash 恰好一份', await settled(() => countMarker(SPLASH) === 1), `实际 ${countMarker(SPLASH)}`)
check('boot 后历史行恰好一份', await settled(() => countMarker(HIST0) === 1 && countMarker(HIST1) === 1),
  `问题=${countMarker(HIST0)} 回答=${countMarker(HIST1)}`)
console.log(`boot: buffer=${term.buffer.active.length} 行 (视口 ${ROWS})`)

// ---- Drive the real UI path: type /model → Enter opens the picker → ↓ → Enter switches
// Matches real key-by-key operation: goes through the completion panel, picker, notify, and fork+replay.
const bufLen = (tag: string) =>
  console.log(`  [${tag}] buffer=${term.buffer.active.length} scrollback=${term.buffer.active.baseY}`)
// 逐键 40ms 与各步 200/600ms 均为按键序列的 ordering pacing：补全浮层/
// picker 的 key-ready 状态无法用纯文本屏幕内容观测（同 repro-settings），
// 保留固定窗口。
const typeKeys = async (keys: string) => {
  for (const ch of keys) {
    stdin.write(ch)
    await sleep(40)
  }
}
bufLen('boot')
await typeKeys('/model')
await sleep(200)
bufLen('typed /model')
stdin.write('\r')            // opens the picker (slash-command dispatch)
await sleep(600)
bufLen('picker open')
stdin.write('\x1b[B')        // ↓ selects the next model
await sleep(200)
stdin.write('\r')            // 确认 → fork + replay
// 稳定性探针保留固定窗口：「恰好一份」断言防的是切换后追加帧的多余沉积，
// 对已成立条件（count===1）轮询立即返回等于没测。
await sleep(1500)
bufLen('switched')

check('切换后模型名生效', await settled(() => channel.model === 'deepseek-v4-pro'), `实际 ${channel.model}`)
check('切换后 splash 恰好一份', countMarker(SPLASH) === 1, `实际 ${countMarker(SPLASH)}`)
check('切换后历史行恰好一份', countMarker(HIST0) === 1 && countMarker(HIST1) === 1,
  `问题=${countMarker(HIST0)} 回答=${countMarker(HIST1)}`)
check('历史问题 1 恰好一份', countMarker('历史问题 1：检查一下构建配置') === 1,
  `实际 ${countMarker('历史问题 1：检查一下构建配置')}`)
check('历史片段 0-8 恰好一份', countMarker('第 0-8 条历史回答要点') === 1,
  `实际 ${countMarker('第 0-8 条历史回答要点')}`)

// ---- Switch once more: confirm deposits don't grow linearly with switch count ---
await typeKeys('/model')
await sleep(200)
stdin.write('\r')
await sleep(600)
stdin.write('\x1b[B')
await sleep(200)
stdin.write('\r')
// 同上：沉积探针保留固定窗口。
await sleep(1500)
check('splash appears exactly once after the second switch', countMarker(SPLASH) === 1, `got ${countMarker(SPLASH)}`)

// ---- Esc only closes, doesn't switch: the floater's overall conditional-mount case
// Key precondition: wait for the splash animation to fully settle (no more new
// frames). Every animation tick marks the ScrollBox dirty and forces a full
// redraw, which masks the "rows covered by a closed floater are left blank"
// defect (without conditional mounting, a clean ScrollBox's blit skips the
// absoluteClear-covered rows — on a real terminal, once the animation stops,
// those rows stay permanently blank). The history tail rows inside the
// covered area get no animation "healing", making them the most sensitive probe.
const waitQuiet = async () => {
  const deadline = Date.now() + 20_000
  let last = rawChunks.length
  while (Date.now() < deadline) {
    await sleep(600)
    if (rawChunks.length === last) return
    last = rawChunks.length
  }
  console.log('  [warn] animation did not settle within 20s, continuing anyway (does not affect the history-row assertions)')
}
await waitQuiet()
const modelBeforeEsc = channel.model
const bufBeforeEsc = term.buffer.active.length
await typeKeys('/model')
await sleep(200)
stdin.write('\r')            // opens the picker
await sleep(600)
stdin.write('\x1b')          // Esc：只关闭，不切换
// 稳定性探针保留固定窗口：Esc 不切换/历史仍在/缓冲区零增长都是「状态不得
// 改变」断言，轮询已成立条件立即返回等于没测。
await sleep(600)
check('Esc does not change the model', channel.model === modelBeforeEsc, `got ${channel.model}`)
check('covered history rows survive after Esc closes',
  countMarker('history answer point 1-8') === 1 && countMarker('history answer point 1-11') === 1,
  `1-8=${countMarker('history answer point 1-8')} 1-11=${countMarker('history answer point 1-11')}`)
check('buffer has zero growth over the Esc open/close cycle', term.buffer.active.length === bufBeforeEsc,
  `${bufBeforeEsc} → ${term.buffer.active.length}`)

console.log(`final: buffer=${term.buffer.active.length} lines (viewport ${ROWS}, scrollback ${term.buffer.active.length - ROWS})`)
const fullResets = rawChunks.join('').match(/\x1b\[10000S/g)?.length ?? 0
check('no full-reset (CSI 10000S) at any point', fullResets === 0, `got ${fullResets}`)

if (process.env.DUMP === '1') {
  const buf = term.buffer.active
  console.log('---- scrollback contents ----')
  for (let y = 0; y < buf.baseY; y++) {
    const l = buf.getLine(y)?.translateToString(true) ?? ''
    if (l.trim()) console.log(String(y).padStart(3), l.slice(0, 90))
  }
}

instance.unmount()
if (failed > 0) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll passed')
process.exit(0)
