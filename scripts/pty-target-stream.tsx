/**
 * Target process for the incremental conpty stress probe (issue #16/#10):
 * stream a long reply (multi-frame diffs) on real stdout (inline mode, same
 * as the npm default), then pop an ask questionnaire mid-stream while the
 * spinner/metrics keep ticking. After conpty re-encodes the incremental
 * sequence the host rebuilds the screen and asserts the questionnaire is
 * complete. The static one-frame probe (pty-target.tsx) already passed;
 * this script covers incremental-diff fidelity.
 */
process.env.FORCE_COLOR = '3'
const [{ default: React }, { render }, { Chat }, { QuestionStore }] = await Promise.all([
  import('react'), import('../src/ui.js'), import('../src/screens/Chat.js'), import('../src/questions.js'),
])

const listeners = new Set<() => void>()
const rows: any[] = []
let id = 0
for (let i = 0; i < 8; i++) {
  rows.push({ id: id++, kind: 'user', text: `Turn ${i + 1}: help me handle this issue` })
  rows.push({ id: id++, kind: 'assistant', text: `OK, turn ${i + 1} is done. The answer covers config checks, dependency alignment, and build verification.`, streaming: false })
}
const channel: any = {
  version: 0, rows, status: 'idle', sessionTitle: 'probe', agentId: 'probe',
  model: 'deepseek-v4-flash', reasoningEffort: 'max', tokens: { input: 120, output: 45 },
  cwd: 'C:/code/demo-project', gitBranch: 'main', working: true,
  spinnerMode: 'requesting', responseChars: 20, activeToolCount: 0, turnStart: Date.now(),
  lastUserText: 'Ask another question', pending: [], commandList: [], notifications: [],
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
  submit: () => {}, cancel: () => {}, clear: () => {}, notify: () => {},
  listModels: () => Promise.resolve([]), listSessions: () => [], setResumeTarget: () => {},
  loadOlder: () => {}, mcpStatus: () => [],
}
const bump = () => { channel.version++; for (const cb of listeners) cb() }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const store = new QuestionStore()
const app = render(React.createElement(Chat, { channel, questionStore: store as never }), { exitOnCtrlC: false, patchConsole: false })
const ticker = setInterval(() => { channel.responseChars += 7; bump() }, 100)
await sleep(1000)

// Stream a long reply; the questionnaire pops at 2/3, then the body keeps flowing.
const finalMsg = { id: id++, kind: 'assistant', text: '', streaming: true }
rows.push(finalMsg); bump()
const chunks: string[] = []
for (let s = 1; s <= 6; s++) {
  chunks.push(`Section ${s} highlights\n`)
  for (let i = 0; i < 8; i++) chunks.push(`- Section ${s} item ${i + 1}: notes on assembly, theme, sync and encrypted packaging\n`)
}
let asked = false
let i = 0
for (const c of chunks) {
  finalMsg.text += c
  bump()
  i++
  if (!asked && i >= Math.floor(chunks.length * 2 / 3)) {
    asked = true
    void store.ask({
      questions: [{
        header: 'Quick question 2', id: 'weekend_plan',
        question: 'Try again: if tomorrow is the weekend, how would you spend it?',
        options: [
          { label: 'Stay in and game/watch shows', description: 'List the things you want to do and tick them off — very satisfying.' },
          { label: 'Go out and wander', description: 'Go outside, eat something nice, clear your head.' },
          { label: 'Study or write code', description: 'Keep coding / learning new things — grind mode.' },
          { label: 'Just rest and do nothing', description: 'No plans at all — sleep in naturally.' },
        ],
      }],
    } as never)
  }
  await sleep(80)
}
finalMsg.streaming = false
bump()
await sleep(1500)
clearInterval(ticker)
await sleep(500)
try { (app as { unmount?: () => void }).unmount?.() } catch { /* probe teardown must not affect assertions */ }
process.exit(0)
