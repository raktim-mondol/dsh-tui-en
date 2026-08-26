/**
 * Split-diff scenarios (side-by-side two-pane view):
 * 1. 120 cols: an Edit card renders two aligned panes separated by │ — no
 *    unified `- `/`+ ` rows; change pairs share one screen row; removed
 *    rows leave the right pane blank
 * 2. changed rows carry the dimmed row backgrounds; changed words use the
 *    bright word palette
 * 3. 70 cols (below SPLIT_DIFF_MIN_COLS): the card falls back to the
 *    unified view
 * 4. a new-file Write (oldText null) fills only the right pane
 *
 * Exits non-zero on the first failed assertion (CI convention).
 */
process.env.FORCE_COLOR = '3'
// This script asserts English UI copy; pin the language before any
// module import resolves the startup lang (env > persisted > locale).
process.env.DSH_TUI_LANG = 'en'

const [{ Writable }, React, { Terminal: XTerm }, { render }, { AssistantToolUseMessage }, { getCliHighlightPromise }, { parseAnsiRuns, chalkFromToken, highlightLines }, { sleep }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/messages/AssistantToolUseMessage.js'),
  import('../src/cc/cliHighlight.js'),
  import('../src/components/SplitDiffView.js'),
  import('./lib/term-test.mjs'),
])

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${ok || extra === '' ? '' : `  (${extra})`}`)
  if (!ok) failures++
}

const editTool = {
  callId: 'c1',
  name: 'edit',
  argsText: '{"file_path":"/tmp/utils.py"}',
  status: 'ok',
  startedAt: 0,
  durationMs: 12,
  callView: {
    card: 'diff',
    title: 'Edit /tmp/utils.py',
    diffs: [{
      path: '/tmp/utils.py',
      oldText: 'def shout(text):\n    return text.upper()\n# tail',
      newText: 'def shout(text, mark="!"):\n    return text.upper() + mark\n# tail',
    }],
  },
}

/** Boot one headless terminal at the given width and render the card. */
async function renderAt(cols, tool, diffLayout = 'auto', toolBackground = 'none') {
  const rows = 30
  const term = new XTerm({ cols, rows, scrollback: 0, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = cols
    rows = rows
    isTTY = true
    _write(chunk, _e, cb) { term.write(String(chunk), cb) }
  }
  const app = await render(
    React.createElement(AssistantToolUseMessage, { tool, addMargin: false, verbose: false, diffLayout, toolBackground }),
    { stdout: new FakeStdout(), debug: true, exitOnCtrlC: false },
  )
  // cli-highlight loads lazily on first use; give it room to land so the
  // syntax-color assertions see the settled frame.（懒加载后的补色重绘无
  // 调用方无关的可观测条件，保留固定窗口。）
  await sleep(900)
  const buf = term.buffer.active
  const lines = []
  for (let y = 0; y < rows; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
  const bgAt = (x, y) => (buf.getLine(y)?.getCell(x)?.getBgColor() ?? 0) & 0xffffff
  const fgAt = (x, y) => (buf.getLine(y)?.getCell(x)?.getFgColor() ?? 0) & 0xffffff
  app.unmount()
  return { lines, bgAt, fgAt, screen: () => lines.join('\n') }
}

// ---- 1&2. Wide terminal: two panes, aligned rows, word highlight
{
  const { lines, screen, bgAt, fgAt } = await renderAt(120, editTool)
  const s = screen()
  check('wide terminal shows no unified - /+ rows', !lines.some(line => line.startsWith(' ⎿ - ') || line.startsWith(' ⎿ + ')))
  const pairRow = lines.findIndex(line => line.includes('def shout(text):') && line.includes('def shout(text, mark="!"):'))
  check('a changed pair renders side by side on one row', pairRow >= 0)
  check('the two panes are separated by │', pairRow >= 0 && lines[pairRow]!.includes('│'))
  const ctxRow = lines.findIndex(line => line.includes('# tail'))
  check('a context row has content in both panes', ctxRow >= 0 && lines[ctxRow]!.split('│').length === 2)
  if (pairRow >= 0) {
    const dividerX = lines[pairRow]!.indexOf('│')
    check('left pane (old) changed row has a dark-red background', bgAt(6, pairRow) === 0x362b2c, `bg=${bgAt(6, pairRow).toString(16)}`)
    check('right pane (new) changed row has a dark-green background', bgAt(dividerX + 2, pairRow) === 0x2b352c, `bg=${bgAt(dividerX + 2, pairRow).toString(16)}`)
    const markX = lines[pairRow]!.indexOf('mark="!"')
    check('right-pane changed phrase uses the bright green word color', markX > 0 && fgAt(markX, pairRow) === 0x57956b, `fg=${fgAt(Math.max(markX, 0), pairRow).toString(16)}`)
    const defX = lines[pairRow]!.indexOf('def')
    check('keyword uses the syntax color (syntaxKeyword)', defX > 0 && fgAt(defX, pairRow) === 0x78a0d6, `fg=${fgAt(Math.max(defX, 0), pairRow).toString(16)}`)
  }
  if (ctxRow >= 0) {
    check('default none tier: context row has no card background', bgAt(6, ctxRow) === 0xffffff, `bg=${bgAt(6, ctxRow).toString(16)}`)
  }
}

// ---- 1b. toolBackground tiers: subtle/strong give context rows a light/dark card background
{
  const { lines, bgAt } = await renderAt(120, editTool, 'auto', 'subtle')
  const row = lines.findIndex(line => line.includes('# tail'))
  if (row >= 0) {
    check('subtle tier: context row has the light card background', bgAt(6, row) === 0x1c2330, `bg=${bgAt(6, row).toString(16)}`)
  }
}
{
  const { lines, bgAt } = await renderAt(120, editTool, 'auto', 'strong')
  const row = lines.findIndex(line => line.includes('# tail'))
  if (row >= 0) {
    check('strong tier: context row has the dark card background', bgAt(6, row) === 0x242b3a, `bg=${bgAt(6, row).toString(16)}`)
  }
}

// ---- 3. Narrow terminal: unified fallback
{
  const { lines, screen, bgAt } = await renderAt(70, editTool)
  const s = screen()
  check('narrow terminal falls back to a unified - row', s.includes('- def shout(text):'))
  check('narrow terminal falls back to a unified + row', s.includes('+ def shout(text, mark="!"):'))
  check('narrow terminal shows no │ separator', !s.includes('│'))
  const bodyRow = lines.findIndex(line => line.includes('# tail'))
  if (bodyRow >= 0) {
    check('default none tier: unified card body has no background (text)', bgAt(lines[bodyRow]!.indexOf('# tail'), bodyRow) === 0xffffff,
      `bg=${bgAt(lines[bodyRow]!.indexOf('# tail'), bodyRow).toString(16)}`)
    check('default none tier: unified card body has no background (row end)', bgAt(69, bodyRow) === 0xffffff,
      `bg=${bgAt(69, bodyRow).toString(16)}`)
  }
}

// ---- 4. New file: only the right pane fills
{
  const writeTool = {
    ...editTool,
    callId: 'c2',
    name: 'write',
    callView: {
      card: 'diff',
      title: 'Write /tmp/new.py',
      diffs: [{ path: '/tmp/new.py', oldText: null, newText: 'hello\nworld' }],
    },
  }
  const { lines } = await renderAt(120, writeTool)
  const helloRow = lines.findIndex(line => line.includes('hello'))
  check('a new file\'s rows land in the right pane', helloRow >= 0 && lines[helloRow]!.includes('│') && lines[helloRow]!.indexOf('hello') > lines[helloRow]!.indexOf('│'))
  check('a new file leaves the left pane blank', helloRow >= 0 && lines[helloRow]!.slice(5, lines[helloRow]!.indexOf('│')).trim() !== 'hello')
}

// ---- 5. diffLayout preference overrides the width heuristic
{
  const { screen } = await renderAt(120, editTool, 'unified')
  check('the unified preference stays unified even at 120 cols', screen().includes('- def shout(text):'))
}
{
  const { screen } = await renderAt(90, editTool, 'split')
  check('the split preference forces two panes even at 90 cols', screen().includes('│'))
}

// ---- 6. issue #250 regression assertions
{
  // P1-1: 256-color SGR (tmux / FORCE_COLOR=2) must parse, not drop.
  const runs256 = parseAnsiRuns('\x1b[38;5;147mdef\x1b[39m')
  check('256-color SGR parses into an ansi256 run', runs256.some(run => run.color === 'ansi256(147)' && run.text === 'def'))

  // P2-5: every documented color form produces a styling function.
  for (const token of ['#abc', '#AABBCCDD', 'rgb( 1, 2, 3 )', 'ansi256(123)']) {
    const styled = chalkFromToken(token)('x')
    check(`color format ${token} produces SGR`, styled.includes('\x1b[') && styled !== 'x', JSON.stringify(styled))
  }

  // P2-4: unequal replacement block pairs via ci-LCS, not index zip.
  const lcsTool = {
    ...editTool,
    callId: 'c3',
    callView: {
      card: 'diff',
      title: 'Edit /tmp/m.py',
      diffs: [{ path: '/tmp/m.py', oldText: 'foo\nbar', newText: 'insert\nFOO\nbar' }],
    },
  }
  const { lines: lcsLines } = await renderAt(120, lcsTool)
  const insertRow = lcsLines.findIndex(line => line.includes('insert'))
  const pairRow = lcsLines.findIndex(line => line.includes('foo') && line.includes('FOO'))
  check('unequal-length blocks: insert is its own added row', insertRow >= 0 && !lcsLines[insertRow]!.includes('foo'))
  check('unequal-length blocks: foo ↔ FOO are paired', pairRow >= 0 && pairRow > insertRow)

  // P2-7: multi-line string keeps the lexer state on later lines.
  const mlTool = {
    ...editTool,
    callId: 'c4',
    callView: {
      card: 'diff',
      title: 'Edit /tmp/s.py',
      diffs: [{ path: '/tmp/s.py', oldText: null, newText: 'x = """hello\nworld\nend"""' }],
    },
  }
  const { lines: mlLines, fgAt: mlFg } = await renderAt(120, mlTool)
  const worldRow = mlLines.findIndex(line => line.includes('world'))
  const worldX = worldRow >= 0 ? mlLines[worldRow]!.indexOf('world') : -1
  check('later lines of a multi-line string keep the string color', worldX > 0 && mlFg(worldX, worldRow) === 0x79ad91, `fg=${worldX > 0 ? mlFg(worldX, worldRow).toString(16) : 'n/a'}`)

  // Shared helper regressions: JSON args, multiline TS state, and safe unknown fallback.
  const hl = await getCliHighlightPromise()
  const jsonRuns = highlightLines('{"file_path":"src/a.ts","line":2}', 'json', hl, {
    string: chalkFromToken('#82B89D'), number: chalkFromToken('#D19A66'),
  }, 'json-dark')
  check('JSON args produce string/number tokens', jsonRuns?.flat().some(run => run.color === 'rgb(130,184,157)') === true && jsonRuns.flat().some(run => run.color === 'rgb(209,154,102)') === true)
  const tsRuns = highlightLines('const value = `first\nsecond`', 'ts', hl, { string: chalkFromToken('#82B89D') }, 'ts-dark')
  check('TypeScript multi-line string keeps the lexer state', tsRuns?.[1]?.some(run => run.color === 'rgb(130,184,157)') === true)
  check('unknown language falls back safely', highlightLines('plain output', 'future-agent-language', hl, {}, 'unknown') === undefined)

  // P1-2: the syntax cache keys on the theme signature — a palette change
  // must not serve stale colors.
  const chDark = { keyword: chalkFromToken('#8FA8E8') }
  const chLight = { keyword: chalkFromToken('#4A63A8') }
  const darkRuns = highlightLines('def f():', 'py', hl, chDark, 'sig-dark')
  const lightRuns = highlightLines('def f():', 'py', hl, chLight, 'sig-light')
  const darkColor = darkRuns?.[0]?.find(run => run.text === 'def')?.color
  const lightColor = lightRuns?.[0]?.find(run => run.text === 'def')?.color
  check('different theme signatures do not cross-contaminate the cache', darkColor !== undefined && lightColor !== undefined && darkColor !== lightColor,
    `dark=${darkColor} light=${lightColor}`)
}

console.log(failures === 0 ? 'repro-diff-split: all assertions passed' : `repro-diff-split: ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
