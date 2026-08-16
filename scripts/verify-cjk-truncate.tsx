/**
 * CJK truncation regression (issue #41 / PR #45, same bug as the @ file
 * suggestion panel fix):
 *   1. truncateToWidth unit checks — cut on terminal display width, never
 *      split a wide glyph;
 *   2. FileSuggestions on a narrow terminal — CJK file names + descriptions
 *      stay within the column limit after truncation;
 *   3. MessageList compactPreview shares the same helper; the unit checks
 *      cover that path (the function is not exported).
 * Run: node --import tsx/esm scripts/verify-cjk-truncate.tsx
 */
process.env.FORCE_COLOR = '3'

const [{ Writable }, React, { Terminal: XTerm }, { render }, { FileSuggestions }, { stringWidth }, { truncateToWidth }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/FileSuggestions.js'),
  import('../src/ink/stringWidth.js'),
  import('../src/ink/truncateToWidth.js'),
])

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let failures = 0
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    failures++
    console.error(`  ✗ ${msg}`)
  }
}

// --- 1. truncateToWidth unit checks ----------------------------------------

console.log('truncateToWidth unit checks:')

// Pure CJK: each glyph is 2 columns. limit=3 fits only 1 glyph (the old
// slice(0,2) would keep 2 glyphs = 4 columns over budget; slice(0,3) by
// character count would cut a glyph in half).
for (const limit of [0, 1, 2, 3, 4, 5, 7, 8]) {
  const out = truncateToWidth('你好世界', limit)
  assert(
    stringWidth(out) <= limit,
    `'你好世界' truncated to ${limit} cols → '${out}' (width ${stringWidth(out)}) does not overflow`,
  )
}
assert(truncateToWidth('你好世界', 3) === '你', 'limit=3 keeps 1 whole glyph, does not split the second')
assert(truncateToWidth('你好世界', 4) === '你好', 'limit=4 is exactly 2 glyphs')

// Mixed CJK + ASCII
const mixed = truncateToWidth('ab中cd', 4)
assert(mixed === 'ab中' && stringWidth(mixed) === 4, `mixed CJK/ASCII truncated to 4 cols → '${mixed}'`)

// Wide glyph sits on the boundary: 'a中' is width 3; at limit=2 '中' does
// not fit, so only 'a' remains.
assert(truncateToWidth('a中b', 2) === 'a', 'wide glyph on the boundary is not half-inserted')

// Shorter than the limit is returned unchanged
assert(truncateToWidth('file', 10) === 'file', 'short string is returned unchanged')

// --- 2. FileSuggestions on a narrow terminal -------------------------------

console.log('FileSuggestions narrow-terminal render:')

const COLS = 28
const ROWS = 12
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
}

// descriptionWidth = COLS - 24 = 4, so 'directory' (9 cols) must truncate
// to 'dir…' (exactly 4 cols). CJK names take the `20 - stringWidth(name)`
// padding path.
const files = ['中文目录名/', 'src/中文文件.ts', 'README.md']
const app = await render(
  React.createElement(FileSuggestions, { files, selectedIndex: 0, columns: COLS }),
  { stdout: new FakeStdout(), exitOnCtrlC: false, patchConsole: false },
)
await sleep(300)
app.unmount()
await sleep(100)

const buf = term.buffer.active
let sawEllipsis = false
for (let y = 0; y < ROWS; y++) {
  const line = buf.getLine(y)?.translateToString(true) ?? ''
  if (line.trim() === '') continue
  const w = stringWidth(line)
  assert(w <= COLS, `row ${y} width ${w} ≤ terminal width ${COLS}: '${line.trimEnd()}'`)
  if (line.includes('…')) sawEllipsis = true
}
assert(sawEllipsis, 'narrow width truncates the directory description with an ellipsis')

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll assertions passed')
process.exit(0)
