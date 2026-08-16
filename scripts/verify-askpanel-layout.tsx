/**
 * AskUserQuestionPanel full-app layout regression (the ask questionnaire
 * inside a real Chat layout). Complements repro-askpanel.tsx (panel-only
 * interaction): this script mounts the panel into the real Chat screen and
 * checks every row is on screen under four layout stresses —
 *   1. short-session static render (exact payload: 4 options + descriptions)
 *   2. tall transcript (120 dialogue rows, ScrollBox window shrinks)
 *   3. differential redraw while the activity line keeps ticking
 *   4. terminal resize storm (grow, then jitter-shrink)
 * Run: node --import tsx/esm scripts/verify-askpanel-layout.tsx
 */
process.env.FORCE_COLOR = '3'

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render }, { Chat }, { QuestionStore }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
])

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Payload from a real session log (issue field case): 4 options with descriptions. */
const EXACT_QUESTION = {
  header: 'Quick question 2',
  id: 'weekend_plan',
  question: 'Try again: if tomorrow is the weekend, how would you spend it?',
  options: [
    { label: 'Stay in and game/watch shows', description: 'List the things you want to do and tick them off — very satisfying.' },
    { label: 'Go out and wander', description: 'Go outside, eat something nice, clear your head.' },
    { label: 'Study or write code', description: 'Keep coding / learning new things — grind mode.' },
    { label: 'Just rest and do nothing', description: 'No plans at all — sleep in naturally.' },
  ],
}

/** Rows that must all be on screen when the panel is fully rendered. */
const REQUIRED = [
  'Quick question 2', // header label
  'Try again', // question text
  'Stay in and game/watch shows', 'Go out and wander', 'Study or write code', 'Just rest and do nothing', // 4 labels
  'very satisfying', 'clear your head', 'grind mode', 'sleep in naturally', // 4 descriptions
  'Custom answer', // inline input row
  '↑/↓ select', 'Esc cancel', // footer hint
]

function makeHarness(cols: number, rows: number) {
  const term = new XTerm({ cols, rows, scrollback: 0, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = cols
    rows = rows
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
  const screen = (): string => {
    const buf = term.buffer.active
    return Array.from({ length: rows }, (_, y) => buf.getLine(y)?.translateToString(true) ?? '').join('\n')
  }
  return { term, stdout, FakeStdin, screen }
}

function makeChannel(transcriptRows: unknown[], listeners?: Set<() => void>) {
  return {
    version: 0,
    rows: transcriptRows,
    status: 'idle',
    sessionTitle: 'probe',
    agentId: 'probe',
    model: 'deepseek-v4-flash',
    tokens: { input: 120, output: 45 },
    cwd: 'C:/code/demo-project',
    displayCwd: 'C:/code/demo-project',
    gitBranch: 'main',
    working: true,
    spinnerMode: 'requesting',
    responseChars: 20,
    activeToolCount: 0,
    mode: { id: 'default', plan: false },
    modeIndex: 0,
    cycleMode() {},
    turnStart: Date.now(),
    lastUserText: 'Ask another question',
    pending: [],
    commandList: [],
    notifications: [],
    activityEnabled: true,
    contextBarEnabled: true,
    activityFrames: [],
    workingActivity: {
      phase: 'asking',
      line: 'Asking',
      toolCount: 0,
      turnElapsedMs: 80_000,
      phaseStartedAt: Date.now() - 80_000,
    },
    subscribe: listeners
      ? (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
      : () => () => {},
    submit: () => {},
    cancel: () => {},
    clear: () => {},
    notify: () => {},
    listModels: () => Promise.resolve([]),
    listSessions: () => [],
    setResumeTarget: () => {},
  } as never
}

const tallRows: unknown[] = []
for (let i = 0; i < 60; i++) {
  tallRows.push({ id: i * 2, kind: 'user', text: `Turn ${i + 1}: help me handle this issue` })
  tallRows.push({ id: i * 2 + 1, kind: 'assistant', text: `OK, turn ${i + 1} is done.`, time: Date.now() })
}
const shortRows: unknown[] = [
  { id: 0, kind: 'user', text: 'Ask another question' },
  { id: 1, kind: 'assistant', text: 'Sure, one more.', time: Date.now() },
]

let failures = 0
const check = (name: string, screenText: string) => {
  const missing = REQUIRED.filter(t => !screenText.includes(t))
  if (missing.length === 0) {
    console.log(`PASS  ${name}`)
  } else {
    failures++
    console.log(`FAIL  ${name} — missing: ${missing.join(' / ')}`)
  }
}

/** Scenarios 1+2: static render (short / tall transcript). */
for (const [name, rows] of [['short session', shortRows], ['tall transcript', tallRows]] as const) {
  const { stdout, FakeStdin, screen } = makeHarness(160, 50)
  const store = new QuestionStore()
  const app = await render(
    React.createElement(Chat, { channel: makeChannel(rows as unknown[]), questionStore: store as never }),
    { stdout, stdin: new FakeStdin(), stderr: stdout, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(600)
  void store.ask({ questions: [EXACT_QUESTION] } as never)
  await sleep(600)
  check(`static render (${name})`, screen())
  app.unmount()
  await sleep(100)
}

/** Scenario 3: differential redraw while activity keeps ticking. */
{
  const { stdout, FakeStdin, screen } = makeHarness(160, 45)
  const listeners = new Set<() => void>()
  const channel = makeChannel(tallRows, listeners)
  const store = new QuestionStore()
  const app = await render(
    React.createElement(Chat, { channel, questionStore: store as never }),
    { stdout, stdin: new FakeStdin(), stderr: stdout, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(600)
  void store.ask({ questions: [EXACT_QUESTION] } as never)
  await sleep(400)
  let worst = ''
  let worstMissing = -1
  for (let tick = 0; tick < 20; tick++) {
    ;(channel.workingActivity as { turnElapsedMs: number }).turnElapsedMs += 1000
    channel.responseChars += 1
    channel.version += 1
    for (const l of [...listeners]) l()
    await sleep(120)
    const s = screen()
    const missing = REQUIRED.filter(t => !s.includes(t)).length
    if (missing > worstMissing) {
      worstMissing = missing
      worst = s
    }
  }
  check('activity-tick differential redraw (worst of 20 frames)', worst)
  app.unmount()
  await sleep(100)
}

/** Scenario 4: resize storm (160x50 → 200x60 → jitter down to 130x42). */
{
  const { term, stdout, FakeStdin, screen } = makeHarness(160, 50)
  const store = new QuestionStore()
  const app = await render(
    React.createElement(Chat, { channel: makeChannel(tallRows), questionStore: store as never }),
    { stdout, stdin: new FakeStdin(), stderr: stdout, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(600)
  void store.ask({ questions: [EXACT_QUESTION] } as never)
  await sleep(400)
  for (const [c, r] of [[200, 60], [190, 58], [160, 50], [135, 44], [130, 42]] as const) {
    stdout.columns = c
    stdout.rows = r
    term.resize(c, r)
    stdout.emit('resize')
    await sleep(90)
  }
  await sleep(800)
  check('after resize storm (130x42)', screen())
  app.unmount()
  await sleep(100)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
