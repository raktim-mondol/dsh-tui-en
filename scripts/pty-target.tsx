/** Target process for the conpty probe: real stdout renders Chat + ask (exact payload). */
process.env.FORCE_COLOR = '3'
const [{ default: React }, { render }, { Chat }, { QuestionStore }] = await Promise.all([
  import('react'), import('../src/ui.js'), import('../src/screens/Chat.js'), import('../src/questions.js'),
])
const rows: unknown[] = []
for (let i = 0; i < 60; i++) {
  rows.push({ id: i * 2, kind: 'user', text: `Turn ${i + 1}: help me handle this issue` })
  rows.push({ id: i * 2 + 1, kind: 'assistant', text: `OK, turn ${i + 1} is done.`, time: Date.now() })
}
const channel = {
  version: 0, rows, status: 'idle', sessionTitle: 'probe', agentId: 'probe',
  model: 'deepseek-v4-flash', tokens: { input: 120, output: 45 },
  cwd: 'C:/code/demo-project', gitBranch: 'main', working: true,
  spinnerMode: 'requesting', responseChars: 20, activeToolCount: 0, turnStart: Date.now(),
  lastUserText: 'Ask another question', pending: [], commandList: [], notifications: [],
  activityEnabled: true, activityFrames: [], contextBarEnabled: true,
  workingActivity: { phase: 'asking', line: 'Asking', toolCount: 0, turnElapsedMs: 80000, phaseStartedAt: Date.now() - 80000 },
  subscribe: () => () => {}, submit: () => {}, cancel: () => {}, clear: () => {}, notify: () => {},
  listModels: () => Promise.resolve([]), listSessions: () => [], setResumeTarget: () => {},
} as never
const store = new QuestionStore()
const app = render(React.createElement(Chat, { channel, questionStore: store as never }), { exitOnCtrlC: false, patchConsole: false })
await new Promise(r => setTimeout(r, 1200))
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
await new Promise(r => setTimeout(r, 2500))
try { (app as { unmount?: () => void }).unmount?.() } catch { /* probe teardown must not affect assertions */ }
process.exit(0)
