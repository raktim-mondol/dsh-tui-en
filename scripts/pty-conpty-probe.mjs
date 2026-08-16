/**
 * conpty passthrough probe: pty-target.tsx renders the ask questionnaire
 * inside a real conpty; the re-encoded byte stream is fed to xterm-headless
 * to rebuild the screen and assert the panel is complete.
 * Run: node scripts/pty-conpty-probe.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// node-pty is a native module and is not a repo dependency: DSH_CC_NODE_PTY
// points at a built node-pty dir (the layer with package.json), else require.
const PTY = process.env.DSH_CC_NODE_PTY ?? 'node-pty'
const pty = require(PTY)
const { Terminal } = require('@xterm/headless')

const COLS = 160, ROWS = 50
const child = pty.spawn(process.execPath, ['--import', 'tsx/esm', 'scripts/pty-target.tsx'], {
  cols: COLS, rows: ROWS, cwd: process.cwd(), useConpty: true,
})
let raw = ''
child.onData(d => { raw += d })
const code = await new Promise(r => child.onExit(r))
// conpty re-encoded bytes → xterm rebuilds the screen
const term = new Terminal({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
term.write(raw)
await new Promise(r => setTimeout(r, 500))
const buf = term.buffer.active
const screen = Array.from({ length: ROWS }, (_, y) => buf.getLine(y)?.translateToString(true) ?? '').join('\n')
const REQUIRED = ['Quick question 2', 'Try again', 'Stay in and game/watch shows', 'Go out and wander', 'Study or write code', 'Just rest and do nothing', 'very satisfying', 'clear your head', 'grind mode', 'sleep in naturally', 'Custom answer', '↑/↓ select', 'Esc cancel']
const missing = REQUIRED.filter(t => !screen.includes(t))
console.log('exit:', JSON.stringify(code))
if (missing.length === 0) {
  console.log('conpty passthrough screen complete — ALL PRESENT')
} else {
  console.log('conpty passthrough missing:', missing.join(' / '))
  console.log('--- last 22 screen rows ---')
  screen.split('\n').slice(-22).forEach((line, i) => console.log(String(ROWS - 22 + i).padStart(3) + ' |' + line))
}
process.exit(missing.length === 0 ? 0 : 1)
