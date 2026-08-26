/**
 * AskUserQuestionPanel `hideCustomInput` behavior regression (introduced by
 * the /provider wizard). Covers the untested branches confirmed in review:
 *   1. Pure multiple-choice + hide: the "Custom answer" input row does not
 *      render, and the hint shows no input prompt; Tab and printable keys
 *      are ignored, Enter only submits selected (no custom).
 *   2. Text-only question with no options + hide: hide is ignored, the
 *      input row stays, and the text submits normally (otherwise the
 *      question would be a dead end).
 *   3. Multi-select without hide (the wizard's model-selection question
 *      shape): the input row stays, and checkbox selection + custom text
 *      both take effect together (issue #9's default behavior does not regress).
 * Run: node --import tsx/esm scripts/verify-askpanel-hide-custom-input.tsx
 */
process.env.FORCE_COLOR = '3'

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render }, { AskUserQuestionPanel }, { settle, settled, sleep, viewportLines }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/questions/AskUserQuestionPanel.js'),
  import('./lib/term-test.mjs'),
])

const COLS = 90
const ROWS = 30
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
}
class FakeStdin extends PassThrough {
  isTTY = true
  setRawMode() { return this }
  ref() { return this }
  unref() { return this }
}
const stdout = new FakeStdout()
const stdin = new FakeStdin()
function screen(): string {
  return viewportLines(term, ROWS).join('\n')
}

let answer: unknown
let cancelled = false
const app = await render(
  React.createElement(AskUserQuestionPanel, {
    position: 1, total: 1, answered: 0,
    onAnswer: (selection: unknown) => { answer = selection },
    onCancel: () => { cancelled = true },
    question: { question: 'placeholder', options: [{ label: 'x' }] },
  }),
  { stdout, stdin, stderr: new FakeStdout(), debug: true, exitOnCtrlC: false },
)
await settle(() => screen().includes('占位'))

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failures++
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Remount the panel with a fresh question (key forces clean state). `ready`
 * is polled until the new panel's distinctive content is parsed (the old
 * fixed 200ms could sample a half-parsed screen on slow runners).
 */
let mountSeq = 0
async function mount(question: Record<string, unknown>, ready: () => boolean): Promise<void> {
  answer = undefined
  cancelled = false
  app.rerender(React.createElement(AskUserQuestionPanel, {
    key: `q${++mountSeq}`,
    position: 1, total: 1, answered: 0,
    onAnswer: (selection: unknown) => { answer = selection },
    onCancel: () => { cancelled = true },
    question,
  }))
  await settle(ready)
}

// ── 1. Pure multiple-choice + hideCustomInput ─────────────────────────
await mount({
  question: 'Which model provider do you want to add?',
  options: [{ label: 'Built-in provider' }, { label: 'Custom API endpoint' }],
  hideCustomInput: true,
}, () => screen().includes('内置 provider') && !screen().includes('自定义回答'))
check('1 hide: 无「自定义回答」输入行', await settled(() => !screen().includes('自定义回答')))
check('1 hide: hint 无输入提示', await settled(() => !screen().includes('输入回答') && !screen().includes('输入文字附带回答')))
check('1 hide: 选项照常渲染', await settled(() => screen().includes('内置 provider') && screen().includes('自定义 API 端点')))

// Tab/可打印字符「应被忽略」是状态不得改变的稳定性探针：轮询已成立条件会
// 立即返回等于没测，键间保留固定窗口。
stdin.write('\x1b[B') // ↓ → 第二项
await sleep(100)
stdin.write('\t')    // Tab should be ignored (no input row to jump to)
await sleep(100)
stdin.write('x')     // printable characters should be ignored
await sleep(100)
stdin.write('\r')    // Enter 提交焦点项
check('1 hide: Enter 只提交 selected，无 custom',
  await settled(() => eq(answer, { selected: ['自定义 API 端点'] })), JSON.stringify(answer))

// ── 2. Text-only question with no options + hideCustomInput (hide must be ignored)
await mount({
  question: 'Enter your API key',
  hideCustomInput: true,
  // patchConsole 会把前面 check 消息（含「自定义回答」字样）渲染进终端，
  // 只盯它会立即返回——用新题独有的问题文本当挂载完成信号。
}, () => screen().includes('输入 API key'))
check('2 text-only: hide 被忽略，输入行仍在', await settled(() => screen().includes('自定义回答')))
stdin.write('sk-secret')
await settle(() => screen().includes('sk-secret'))
stdin.write('\r')
check('2 text-only: 文本照常提交',
  await settled(() => eq(answer, { selected: [], custom: 'sk-secret' })), JSON.stringify(answer))

// ── 3. Multi-select without hide (the model-selection question shape): default behavior does not regress
await mount({
  question: 'Select the models to enable',
  options: [{ label: 'deepseek-chat' }, { label: 'deepseek-reasoner' }],
  multiSelect: true,
  // 上一屏已含「自定义回答」，settle 只盯它会立即返回——加新题独有的选项
  // 文本当挂载完成信号。
}, () => screen().includes('deepseek-chat') && screen().includes('自定义回答'))
check('3 multi: 输入行保留', await settled(() => screen().includes('自定义回答')))
stdin.write(' ')      // 勾选第一项
// 键间固定 pacing：空格勾选没有独有的可观测文本（提交结果由下方 settled
// 断言兜底），保留小窗口保证勾选先于后续输入被处理。
await sleep(100)
stdin.write('extra-model') // 输入行补充
await settle(() => screen().includes('extra-model'))
stdin.write('\r')
check('3 multi: 勾选 + 自定义补充同时生效',
  await settled(() => eq(answer, { selected: ['deepseek-chat'], custom: 'extra-model' })), JSON.stringify(answer))

app.unmount()
console.log(failures === 0 ? '\nAll hide-custom-input checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
