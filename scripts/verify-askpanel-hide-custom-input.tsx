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

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render }, { AskUserQuestionPanel }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/questions/AskUserQuestionPanel.js'),
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
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
function screen(): string {
  const buf = term.buffer.active
  const lines: string[] = []
  for (let y = 0; y < ROWS; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
  return lines.join('\n')
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
await sleep(200)

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failures++
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Remount the panel with a fresh question (key forces clean state). */
let mountSeq = 0
async function mount(question: Record<string, unknown>): Promise<void> {
  answer = undefined
  cancelled = false
  app.rerender(React.createElement(AskUserQuestionPanel, {
    key: `q${++mountSeq}`,
    position: 1, total: 1, answered: 0,
    onAnswer: (selection: unknown) => { answer = selection },
    onCancel: () => { cancelled = true },
    question,
  }))
  await sleep(200)
}

// ── 1. Pure multiple-choice + hideCustomInput ─────────────────────────
await mount({
  question: 'Which model provider do you want to add?',
  options: [{ label: 'Built-in provider' }, { label: 'Custom API endpoint' }],
  hideCustomInput: true,
})
check('1 hide: no "Custom answer" input row', !screen().includes('Custom answer'))
check('1 hide: hint has no input prompt', !screen().includes('Type answer') && !screen().includes('Type text to attach an answer'))
check('1 hide: options render normally', screen().includes('Built-in provider') && screen().includes('Custom API endpoint'))

stdin.write('\x1b[B') // ↓ → second item
await sleep(100)
stdin.write('\t')    // Tab should be ignored (no input row to jump to)
await sleep(100)
stdin.write('x')     // printable characters should be ignored
await sleep(100)
stdin.write('\r')    // Enter submits the focused item
await sleep(200)
check('1 hide: Enter only submits selected, no custom',
  eq(answer, { selected: ['Custom API endpoint'] }), JSON.stringify(answer))

// ── 2. Text-only question with no options + hideCustomInput (hide must be ignored)
await mount({
  question: 'Enter your API key',
  hideCustomInput: true,
})
check('2 text-only: hide is ignored, input row stays', screen().includes('Custom answer'))
stdin.write('sk-secret')
await sleep(100)
stdin.write('\r')
await sleep(200)
check('2 text-only: text submits normally',
  eq(answer, { selected: [], custom: 'sk-secret' }), JSON.stringify(answer))

// ── 3. Multi-select without hide (the model-selection question shape): default behavior does not regress
await mount({
  question: 'Select the models to enable',
  options: [{ label: 'deepseek-chat' }, { label: 'deepseek-reasoner' }],
  multiSelect: true,
})
check('3 multi: input row stays', screen().includes('Custom answer'))
stdin.write(' ')      // check the first item
await sleep(100)
stdin.write('extra-model') // supplement via the input row
await sleep(100)
stdin.write('\r')
await sleep(200)
check('3 multi: checkbox selection + custom text both take effect',
  eq(answer, { selected: ['deepseek-chat'], custom: 'extra-model' }), JSON.stringify(answer))

app.unmount()
console.log(failures === 0 ? '\nAll hide-custom-input checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
