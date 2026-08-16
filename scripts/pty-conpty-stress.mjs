/**
 * Incremental conpty passthrough stress probe (issue #16/#10):
 * pty-target-stream.tsx streams many frames and pops a questionnaire mid-way
 * inside a real conpty; the re-encoded bytes go to xterm-headless to rebuild
 * the screen and assert the panel is complete with no missing rows.
 * Complements pty-conpty-probe.mjs (one static frame) for incremental diffs.
 * Run: node scripts/pty-conpty-stress.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const PTY = process.env.DSH_CC_NODE_PTY ?? 'node-pty'
const pty = require(PTY)
const { Terminal } = require('@xterm/headless')

const COLS = 160, ROWS = 50
const child = pty.spawn(process.execPath, ['--import', 'tsx/esm', 'scripts/pty-target-stream.tsx'], {
  cols: COLS, rows: ROWS, cwd: process.cwd(), useConpty: true,
})
let raw = ''
child.onData(d => { raw += d })
const code = await new Promise(r => child.onExit(r))
const term = new Terminal({ cols: COLS, rows: ROWS, scrollback: 2000, allowProposedApi: true })
term.write(raw)
await new Promise(r => setTimeout(r, 800))
const buf = term.buffer.active
const total = buf.length
const lines = Array.from({ length: total }, (_, y) => buf.getLine(y)?.translateToString(true) ?? '')
const viewport = lines.slice(Math.max(0, total - ROWS))
const screen = viewport.join('\n')

let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

// Questionnaire panel completeness (same set as the static probe).
const REQUIRED = ['Quick question 2', 'Try again', 'Stay in and game/watch shows', 'Go out and wander', 'Study or write code', 'Just rest and do nothing', 'very satisfying', 'clear your head', 'grind mode', 'sleep in naturally', 'Custom answer', '↑/↓ select', 'Esc cancel']
const missing = REQUIRED.filter(t => !screen.includes(t))
check('questionnaire panel complete after incremental passthrough', missing.length === 0, missing.length ? `missing: ${missing.join(' | ')}` : '')

// No duplicate questionnaire items in the viewport (ghosts double a label).
for (const t of ['Quick question 2', 'Stay in and game/watch shows', 'sleep in naturally']) {
  const n = viewport.filter(l => l.includes(t)).length
  check(`'${t}' appears at most once in the viewport`, n <= 1, `got ${n}`)
}

console.log('exit:', JSON.stringify(code), ' buffer rows:', total, ' scrollback:', total - ROWS)
if (failed > 0) {
  console.log('=== viewport ===')
  viewport.forEach((l, y) => console.log(`${String(y).padStart(3)}|${l}`))
}
console.log(failed === 0 ? 'ALL PASS' : `${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
