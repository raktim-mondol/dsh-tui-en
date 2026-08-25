/**
 * AskUserQuestionPanel inline-input scenario (issue #9): the option list's
 * last row IS the input — typing on a focused option writes there without
 * any mode switch (the list stays put), attaches the label, and Enter
 * carries both selected + custom. Focusing the input row directly gives a
 * pure custom answer. Drives the real useInput path with fake stdin;
 * output is captured raw and ANSI-stripped (no xterm dependency).
 */
process.env.FORCE_COLOR = '3'

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render }, { AskUserQuestionPanel }, { settle, viewportLines }] = await Promise.all([
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
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** The real terminal screen, line by line. */
function screen(): string {
  return viewportLines(term, ROWS).join('\n')
}

let answer: unknown
const panelProps = {
  position: 1,
  total: 1,
  answered: 0,
  onAnswer: (selection: unknown) => { answer = selection },
  onCancel: () => {},
}
const app = await render(
  React.createElement(AskUserQuestionPanel, {
    ...panelProps,
    key: 'q1',
    question: {
      question: 'Do you have an API key?',
      options: [{ label: 'I have one' }, { label: "I don't" }],
    },
  }),
  { stdout, stdin, stderr: new FakeStdout(), debug: true, exitOnCtrlC: false },
)
await settle(() => screen().includes('自定义回答') && screen().includes('输入文字附带回答'))

let failures = 0
const results: string[] = []
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

// 1. Initial render: the input row is visible INSIDE the option list.
const s1 = screen()
check('option list shows the Custom answer input row', s1.includes('Custom answer'))
check('hint says you can type an attached answer', s1.includes('Type text to attach an answer'))

// 2. Type on the focused "I have one" option: text lands in the input row, the
//    option list stays (no jump), and the label is attached.
stdin.write('sk-test123')
await settle(() => screen().includes('sk-test123') && screen().includes('（附加：我有）'))
const s2 = screen()
check('typed text appears on the input row', s2.includes('sk-test123'))
check('view does not jump (option list still visible)', s2.includes("I don't"))
check('input row shows attached label I have one', s2.includes('(attached: I have one)'))

// 3. Enter right there → the answer carries BOTH the label and the text.
stdin.write('\r')
await settle(() => answer !== undefined)
const a1 = answer as { selected?: string[]; custom?: string } | undefined
check('submit carries both selected + custom', a1?.selected?.join() === 'I have one' && a1?.custom === 'sk-test123')

// 4. Pure custom: focus the input row itself (↓↓) and type → no label.
answer = undefined
app.rerender(
  React.createElement(AskUserQuestionPanel, {
    ...panelProps,
    key: 'q2',
    question: { question: 'Anything else to add?', options: [{ label: 'Yes' }, { label: 'No' }] },
  }),
)
await settle(() => screen().includes('还有别的要说吗？'))
stdin.write('[B') // ↓
stdin.write('[B') // ↓ → input row
await sleep(200)
stdin.write('随便说说')
await settle(() => screen().includes('随便说说'))
const s4 = screen()
check('inline edit on the input row (view still does not jump)', s4.includes('just rambling') && s4.includes('No'))
stdin.write('\r')
await settle(() => answer !== undefined)
const a2 = answer as { selected?: string[]; custom?: string } | undefined
check('input-row submit is pure custom (no label)', a2?.selected?.length === 0 && a2?.custom === 'just rambling')

// 5. Multi-select: Space checks an option, typing appends, Enter on the
//    option row carries checked labels + text.
answer = undefined
app.rerender(
  React.createElement(AskUserQuestionPanel, {
    ...panelProps,
    key: 'q3',
    question: {
      question: 'Which flavors do you want?',
      multiSelect: true,
      options: [{ label: 'Sweet' }, { label: 'Spicy' }],
    },
  }),
)
await settle(() => screen().includes('要哪些口味？'))
stdin.write(' ') // check 甜
await sleep(150)
stdin.write('少放糖')
await settle(() => screen().includes('少放糖'))
stdin.write('\r')
await settle(() => answer !== undefined)
const a3 = answer as { selected?: string[]; custom?: string } | undefined
check('multi-select: checked label + text submitted together', a3?.selected?.join() === 'Sweet' && a3?.custom === 'less sugar')

app.unmount()
await sleep(100)
console.log(results.join('\n'))
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
