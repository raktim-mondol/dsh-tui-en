/**
 * Slash-command description regression (issue #41). The UI is English-only:
 * `/lang zh` and `/lang en` both show LOCAL_COMMANDS / registry English.
 * CJK display-width truncation is covered by verify-cjk-truncate.tsx.
 *
 *   1. CommandSuggestions and HelpMenu show English descriptions
 *      ("Start a new conversation", "Toggle plan mode").
 *   2. Unknown external commands fall back to the registry text.
 *   3. Narrow terminals truncate long English descriptions by display
 *      width without exceeding the column limit.
 * Run: node --import tsx/esm scripts/verify-i18n-command-descriptions.tsx
 */
process.env.FORCE_COLOR = '3'

const [
  { Writable },
  React,
  { Terminal: XTerm },
  { render },
  { CommandSuggestions },
  { HelpMenu },
  { setLang },
  { LOCAL_COMMANDS },
  { stringWidth },
  { settle, viewportLines },
] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/CommandSuggestions.js'),
  import('../src/components/HelpMenu.js'),
  import('../src/i18n.js'),
  import('../src/commands.js'),
  import('../src/ink/stringWidth.js'),
  import('./lib/term-test.mjs'),
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

function makeTerm(cols: number, rows: number) {
  const term = new XTerm({ cols, rows, scrollback: 0, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = cols
    rows = rows
    isTTY = true
    _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
  }
  return { term, stdout: new FakeStdout() }
}

function screenText(term: InstanceType<typeof XTerm>, rows: number): string {
  return viewportLines(term, rows).join('\n')
}

// Mixed list: built-in commands + known external (plan) + unlisted external.
const commands = [
  ...LOCAL_COMMANDS.filter(c => ['new', 'compact', 'rewind'].includes(c.name)),
  { name: 'plan', description: 'Toggle plan mode', external: true },
  { name: 'unlisted-ext', description: 'Registry fallback text', external: true },
]

function assertEnglishDescriptions(text: string, tag: string) {
  assert(text.includes('Start a new conversation'), `${tag}: built-in /new shows LOCAL_COMMANDS English`)
  assert(text.includes('Compact the conversation history') || text.includes('Compact the conversation'), `${tag}: compact shows LOCAL_COMMANDS English`)
  assert(text.includes('Toggle plan mode'), `${tag}: external /plan shows registry English`)
  assert(text.includes('Registry fallback text'), `${tag}: unlisted external falls back to registry text`)
}

// --- 1. / menu shows English under both /lang values ----------------------

console.log('CommandSuggestions English descriptions:')

{
  const COLS = 80
  const ROWS = 8
  const { term, stdout } = makeTerm(COLS, ROWS)
  const app = await render(
    React.createElement(CommandSuggestions, { commands, selectedIndex: 0, columns: COLS }),
    { stdout, exitOnCtrlC: false, patchConsole: false },
  )
  // 初始渲染的语言取决于环境，命令名与语言无关——以其出现为首帧信号。
  await settle(() => screenText(term, ROWS).includes('new'))

  setLang('zh')
  app.rerender(React.createElement(CommandSuggestions, { commands, selectedIndex: 0, columns: COLS }))
  await settle(() => {
    const t = screenText(term, ROWS)
    return t.includes('新开会话') && t.includes('压缩会话历史') && t.includes('切换计划模式')
      && t.includes('Registry fallback text') && !t.includes('Toggle plan mode')
  })
  let text = screenText(term, ROWS)
  assert(text.includes('新开会话'), 'zh：内置命令显示中文描述（新开会话）')
  assert(text.includes('压缩会话历史'), 'zh：compact 显示中文描述')
  assert(text.includes('切换计划模式'), 'zh：外部命令 plan 走 cmd-desc 中文映射')
  assert(text.includes('Registry fallback text'), 'zh：未收录外部命令回退注册表原文')
  assert(!text.includes('Toggle plan mode'), 'zh：已收录外部命令不再显示英文原文')

  setLang('en')
  app.rerender(React.createElement(CommandSuggestions, { commands, selectedIndex: 0, columns: COLS }))
  await settle(() => {
    const t = screenText(term, ROWS)
    return t.includes('Start a new conversation') && t.includes('Toggle plan mode') && !t.includes('新开会话')
  })
  text = screenText(term, ROWS)
  assert(text.includes('Start a new conversation'), 'en：内置命令回退 LOCAL_COMMANDS 英文原文')
  assert(text.includes('Toggle plan mode'), 'en：外部命令 plan 回退注册表英文原文')
  assert(!text.includes('新开会话'), 'en：不再残留中文描述')

  app.unmount()
  await sleep(100)
}

// --- 2. ? help menu shows English under both /lang values -----------------

console.log('HelpMenu English descriptions:')

{
  const COLS = 110
  const ROWS = 20
  const { term, stdout } = makeTerm(COLS, ROWS)
  const app = await render(
    React.createElement(HelpMenu, { commands }),
    { stdout, exitOnCtrlC: false, patchConsole: false },
  )
  // 同上：以语言无关的命令名出现为首帧信号。
  await settle(() => screenText(term, ROWS).includes('/new'))

  setLang('zh')
  app.rerender(React.createElement(HelpMenu, { commands }))
  await settle(() => {
    const t = screenText(term, ROWS)
    return t.includes('/new — 新开会话') && t.includes('/rewind — 回退会话到历史消息')
  })
  let text = screenText(term, ROWS)
  assert(text.includes('/new — Start a new conversation'), '/lang zh: help menu shows /new English')
  assert(text.includes('/rewind — Rewind'), '/lang zh: help menu shows rewind English')

  setLang('en')
  app.rerender(React.createElement(HelpMenu, { commands }))
  await settle(() => screenText(term, ROWS).includes('/new — Start a new conversation'))
  text = screenText(term, ROWS)
  assert(text.includes('/new — Start a new conversation'), '/lang en: help menu shows English')

  app.unmount()
  await sleep(100)
}

// --- 3. Narrow terminal: long English descriptions truncate by width ------

console.log('Narrow-terminal description truncation:')

{
  const COLS = 36
  const ROWS = 8
  const { term, stdout } = makeTerm(COLS, ROWS)
  setLang('en')
  const app = await render(
    React.createElement(CommandSuggestions, { commands, selectedIndex: 0, columns: COLS }),
    { stdout, exitOnCtrlC: false, patchConsole: false },
  )
  // 断言条件（截断省略号）出现即帧已画到位；unmount 后保留短暂固定等待，
  // 让尚在途的 term.write 回调全部落盘再读缓冲。
  await settle(() => viewportLines(term, ROWS).some(line => line.includes('…')))
  app.unmount()
  await sleep(100)

  const screenLines = viewportLines(term, ROWS)
  let sawEllipsis = false
  for (let y = 0; y < ROWS; y++) {
    const line = screenLines[y] ?? ''
    if (line.trim() === '') continue
    const w = stringWidth(line)
    assert(w <= COLS, `row ${y} width ${w} ≤ terminal width ${COLS}: '${line.trimEnd()}'`)
    if (line.includes('…')) sawEllipsis = true
  }
  assert(sawEllipsis, 'narrow terminal truncates a long English description with an ellipsis')
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll assertions passed')
process.exit(0)
