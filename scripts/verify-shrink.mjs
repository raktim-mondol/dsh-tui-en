/**
 * Headless verification of the main-screen shrink repaint.
 *
 * Scenario (the user-reported bug): content taller than the viewport, then
 * the content shrinks. In main-screen mode the terminal viewport does NOT
 * follow the content bottom — a stale-offset incremental path would leave
 * old status rows behind and mix old/new characters on the same lines.
 *
 * Fix history: the old path fired a full-reset on shrink frames
 * (CSI 10000 S clear + reprint) — correct, but each fire copied the
 * whole UI into scrollback (the #38/#39/#19 "scroll up and see a
 * duplicated render" pile-up). The current path redraws the viewport
 * in place (cursor parked → up to the top → ED clear → reprint the
 * tail window): zero scroll, zero scrollback deposit.
 * This script therefore upgraded from a byte-shape assert (must emit
 * CSI 10000S) to a semantic one: rebuild the terminal in xterm-headless
 * and check what the user sees after the shrink.
 *
 * Checks:
 *  1. the shrink frame emits NO scroll-up clear (CSI n S) — no scrollback
 *     deposit — and NO ESC[2J/ESC[3J (those snap the Windows Terminal
 *     viewport to the top inside DEC 2026 sync blocks, claude-code #35580);
 *  2. after the shrink the viewport shows the tail of the 40-line content
 *     with the bottom-pinned marker on its last content row;
 *  3. no stale rows: lines 40..59 from the pre-shrink frame are gone from
 *     the viewport;
 *  4. no mixed/duplicated rows: every visible content line appears at most
 *     once, in ascending order.
 * Run: node scripts/verify-shrink.mjs
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'WezTerm' // DEC-2026 path, matches a real terminal

const { Writable, PassThrough } = await import('node:stream')
const React = await import('react')
const m = await import('@xterm/headless'); const XTerm = m.default?.Terminal ?? m.Terminal
const { render, Box, Text } = await import('../lib/types/ui.js')
const { settle } = await import('./lib/term-test.mjs')

const COLS = 100
const ROWS = 28

function makeStreams(term) {
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      const str = String(chunk)
      stdout.frames.push(str)
      term.write(str, cb)
    },
  })
  stdout.columns = COLS
  stdout.rows = ROWS
  stdout.isTTY = true
  stdout.frames = []
  const stderr = new Writable({
    write(_c, _e, cb) {
      cb()
    },
  })
  stderr.isTTY = true
  const stdin = new PassThrough()
  stdin.isTTY = true
  stdin.setRawMode = () => stdin
  stdin.setEncoding = () => stdin
  stdin.ref = () => stdin
  stdin.unref = () => stdin
  return { stdout, stderr, stdin }
}

let failed = 0
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed = 1
}

// Render a tall list + a bottom marker; then shrink the list and verify the
// viewport the user actually sees (xterm-reconstructed).
{
  const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 500, allowProposedApi: true })
  const { stdout, stderr, stdin } = makeStreams(term)
  const App = ({ lineCount }) =>
    React.createElement(
      Box,
      { flexDirection: 'column' },
      Array.from({ length: lineCount }, (_, i) =>
        React.createElement(Text, { key: `l${i}` }, `line ${i} padded content`),
      ),
      React.createElement(Text, null, 'BOTTOM_PINNED_MARKER'),
    )
  const instance = await render(React.createElement(App, { lineCount: 60 }), {
    stdout,
    stderr,
    stdin,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  // 主屏收缩语义按「buffer 尾窗口」读（刻意非视口读取：scrollback 是断言
  // 的一部分）。
  const tailWindow = () => {
    const buf = term.buffer.active
    const start = Math.max(0, buf.length - ROWS)
    const lines = []
    for (let y = start; y < buf.length; y++) {
      lines.push((buf.getLine(y)?.translateToString(true) ?? '').replace(/\s+$/, ''))
    }
    return lines
  }
  // 初始帧落定（marker 已解析）后再取 shrink 字节窗口的边界。
  await settle(() => tailWindow().some(l => l.includes('BOTTOM_PINNED_MARKER')))
  const framesBefore = stdout.frames.length

  // Shrink: 60 -> 40 lines.
  instance.rerender(React.createElement(App, { lineCount: 40 }))
  // 等待与断言共用同一快照 viewport：谓词覆盖下方全部语义断言的条件
  // （含 marker——旧谓词更弱，缺 marker 项），断言在同一快照上求值，无分叉。
  let viewport = []
  await settle(() => {
    viewport = tailWindow()
    const nums = viewport
      .map(l => /^line (\d+) padded content$/.exec(l.trim()))
      .filter(Boolean)
      .map(match => Number(match[1]))
    return !viewport.some(l => /line (4\d|5\d) padded/.test(l)) &&
      nums.length > 0 && nums[nums.length - 1] === 39 &&
      viewport.some(l => l.includes('BOTTOM_PINNED_MARKER'))
  })
  const shrinkBytes = stdout.frames.slice(framesBefore).join('')

  // 1. No scrollback deposit, no WT jump-to-top sequence.
  check(
    'shrink frame emits NO scroll-up clear (CSI n S)',
    !/\x1b\[\d*S/.test(shrinkBytes),
  )
  check(
    'shrink frame emits NO ESC[2J/ESC[3J',
    !/\x1b\[2J|\x1b\[3J/.test(shrinkBytes),
  )

  // 2-4. xterm 重建的视口语义断言（在 settle 捕获的同一快照 viewport 上）。
  const markerRow = viewport.findIndex(l => l.includes('BOTTOM_PINNED_MARKER'))
  check('marker visible in viewport', markerRow >= 0)
  check(
    'marker is the last content row',
    markerRow >= 0 && viewport.slice(markerRow + 1).every(l => l === ''),
    `marker at ${markerRow}/${ROWS}`,
  )
  // After shrink, frame height 41 > viewport 28: the viewport should
  // show the tail window (line 14..39 + marker), and none of
  // line 40..59 (old content) may remain.
  const staleRows = viewport.filter(l => /line (4\d|5\d) padded/.test(l))
  check('no stale rows from the taller frame', staleRows.length === 0, staleRows.slice(0, 3).join(' | '))
  const nums = viewport
    .map(l => /^line (\d+) padded content$/.exec(l.trim()))
    .filter(Boolean)
    .map(m => Number(m[1]))
  const ascendingUnique = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
  check('visible lines are consecutive and unique', ascendingUnique, nums.join(','))
  check(
    'tail window ends at line 39',
    nums.length > 0 && nums[nums.length - 1] === 39,
    `last=${nums[nums.length - 1]}`,
  )

  await instance.unmount()
}

process.exit(failed)
