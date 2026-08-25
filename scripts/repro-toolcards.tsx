/**
 * Tool-card presentation scenarios: the channel captures dsh-tools
 * presentCall/presentResult views and AssistantToolUseMessage renders them
 * as CC-style indented bodies (`  ⎿  ` gutter) — diff hunks in red/green,
 * terminal output, envelope-stripped read content — instead of the raw
 * tool-message dump. Exercises the pure component with fabricated ToolRows
 * (no channel needed: views are plain data on the row).
 */
process.env.FORCE_COLOR = '3'

const [{ Writable }, React, { Terminal: XTerm }, { render }, { AssistantToolUseMessage }, { settle }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/messages/AssistantToolUseMessage.js'),
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
const stdout = new FakeStdout()
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** The real terminal screen, line by line (colors stripped). */
function lines(): string[] {
  const buf = term.buffer.active
  const out: string[] = []
  for (let y = 0; y < ROWS; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  return out
}
function screen(): string {
  return lines().join('\n')
}
/** Foreground rgb (0xRRGGBB) of the cell at (x, y), or 0 when unset. */
function fgAt(x: number, y: number): number {
  const cell = term.buffer.active.getLine(y)?.getCell(x)
  if (!cell) return 0
  return cell.getFgColor() & 0xffffff
}
/** Locate the screen row containing `needle`; -1 when absent. */
function rowOf(needle: string): number {
  const rows = lines()
  for (let y = 0; y < rows.length; y++) {
    if (rows[y]!.includes(needle)) return y
  }
  return -1
}

let failures = 0
const results: string[] = []
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

const base = {
  callId: 'c1',
  argsText: '{"file_path":"/tmp/a.ts"}',
  status: 'ok' as const,
  startedAt: 0,
  durationMs: 12,
}

function card(key: string, tool: Record<string, unknown>, verbose = false): React.ReactElement {
  return React.createElement(AssistantToolUseMessage, {
    key,
    tool: { ...base, ...tool },
    addMargin: false,
    verbose,
  })
}

const editTool = {
  name: 'edit',
  callView: {
    card: 'diff',
    title: 'Edit /tmp/a.ts',
    diffs: [{ path: '/tmp/a.ts', oldText: 'const a = 1', newText: 'const a = 2' }],
  },
  resultView: {
    card: 'diff',
    title: 'Edit /tmp/a.ts',
    diffs: [{ path: '/tmp/a.ts', oldText: 'const a = 1', newText: 'const a = 2' }],
  },
  resultFull: 'ok',
}

const app = await render(card('edit', editTool), { stdout, debug: true, exitOnCtrlC: false })
await settle(() => rowOf('- const a = 1') >= 0 && rowOf('+ const a = 2') >= 0)

/**
 * Swap the rendered card; key forces a clean remount per scenario. `ready`
 * is polled until the new card's distinctive content is parsed (the old
 * fixed 250ms could sample a half-parsed screen on slow runners).
 */
async function show(key: string, tool: Record<string, unknown>, ready: () => boolean, verbose = false): Promise<void> {
  app.rerender(card(key, tool, verbose))
  await settle(ready)
}

// 1. Settled Edit: diff body, red `- ` / green `+ ` lines under the ⎿ gutter.
{
  const s = screen()
  check('edit card title is "Edit /tmp/a.ts" (not JSON args)', s.includes('Edit /tmp/a.ts') && !s.includes('{"file_path"'))
  const delRow = rowOf('- const a = 1')
  const addRow = rowOf('+ const a = 2')
  check('deleted line carries the ⎿ gutter', delRow >= 0 && lines()[delRow]!.startsWith(' ⎿ - const a = 1'))
  check('added line continues the gutter indent', addRow >= 0 && lines()[addRow]!.startsWith('   + const a = 2'))
  check('deleted line is in the red family', delRow >= 0 && fgAt(7, delRow) === 0xb26671)
  check('added line is in the green family', addRow >= 0 && fgAt(7, addRow) === 0x57956b)
}

// 2. Write of a new file (oldText null) has only + lines.
await show('write', {
  name: 'write',
  callView: {
    card: 'diff',
    title: 'Write /tmp/new.ts',
    diffs: [{ path: '/tmp/new.ts', oldText: null, newText: 'hello\nworld' }],
  },
}, () => screen().includes('+ hello') && screen().includes('+ world'))
{
  const s = screen()
  check('new-file title is "Write /tmp/new.ts"', s.includes('Write /tmp/new.ts'))
  check('new file has only added lines', s.includes('+ hello') && s.includes('+ world') && !s.includes('- hello'))
}

// 3. Bash terminal card: command as title, output indented.
await show('bash', {
  name: 'bash',
  argsText: '{"command":"ls -la"}',
  callView: { card: 'terminal', title: 'ls -la' },
  resultView: { card: 'terminal', output: 'total 8\nfile1\nfile2', exitCode: 0 },
  resultFull: 'total 8\nfile1\nfile2',
}, () => screen().includes('Bash(ls -la)') && rowOf('total 8') >= 0)
{
  const s = screen()
  check('terminal card title is "Bash(ls -la)"', s.includes('Bash(ls -la)'))
  const outRow = rowOf('total 8')
  check('terminal output carries the ⎿ gutter', outRow >= 0 && lines()[outRow]!.startsWith(' ⎿ total 8'))
}

// 4. Bash non-zero exit: appends an Exit code row.
await show('bash-err', {
  name: 'bash',
  callView: { card: 'terminal', title: 'false' },
  resultView: { card: 'terminal', output: '', exitCode: 1 },
  resultFull: '',
}, () => rowOf('Exit code 1') >= 0)
check('非零退出显示 Exit code 行', rowOf('Exit code 1') >= 0)

// 5. Read card: body strips the <path>/<content> envelope.
await show('read', {
  name: 'read',
  callView: { card: 'generic', title: 'Read /tmp/x.ts' },
  resultView: {
    card: 'read',
    path: '/tmp/x.ts',
    content: [{ type: 'text', text: 'line one\nline two' }],
  },
  resultFull: '<path>/tmp/x.ts</path>\n<content>\nline one\nline two\n</content>',
}, () => rowOf('line one') >= 0)
{
  const s = screen()
  check('Read body has no envelope tags', s.includes('line one') && !s.includes('<content>') && !s.includes('<path>'))
  const row = rowOf('line one')
  check('Read body carries the ⎿ gutter', row >= 0 && lines()[row]!.startsWith(' ⎿ line one'))
}

// 6. Tool without a presenter: fall back to Name(args) + raw result (still indented).
await show('fallback', {
  name: 'read',
  resultFull: 'raw output here',
}, () => rowOf('raw output here') >= 0)
{
  const s = screen()
  check('without a view, title falls back to Name(args)', s.includes('Read({"file_path":"/tmp/a.ts"})'))
  const row = rowOf('raw output here')
  check('without a view, the result is still indented', row >= 0 && lines()[row]!.startsWith(' ⎿ raw output here'))
}

// 7. Fold cap: body over 3 lines folds + hint; Ctrl+O expands.
await show('cap', {
  name: 'bash',
  callView: { card: 'terminal', title: 'seq 6' },
  resultView: { card: 'terminal', output: '1\n2\n3\n4\n5\n6', exitCode: 0 },
  resultFull: '1\n2\n3\n4\n5\n6',
}, () => screen().includes('… +3 lines (ctrl+o to expand)'))
{
  const s = screen()
  check('text body folds to 3 lines + hint', s.includes('… +3 lines (ctrl+o to expand)') && rowOf('4') === -1)
}
await show('cap-open', {
  name: 'bash',
  callView: { card: 'terminal', title: 'seq 6' },
  resultView: { card: 'terminal', output: '1\n2\n3\n4\n5\n6', exitCode: 0 },
  resultFull: '1\n2\n3\n4\n5\n6',
}, () => rowOf('6') >= 0 && !screen().includes('ctrl+o to expand'), true)
check('verbose 不折叠', rowOf('6') >= 0 && !screen().includes('ctrl+o to expand'))

// 8. Error card: errorText in red, indented.
await show('error', {
  name: 'read',
  status: 'error',
  errorText: 'Error: ENOENT',
}, () => rowOf('Error: ENOENT') >= 0)
{
  const row = rowOf('Error: ENOENT')
  check('error row carries the ⎿ gutter', row >= 0 && lines()[row]!.startsWith(' ⎿ Error: ENOENT'))
  check('error row is colored', row >= 0 && fgAt(7, row) !== 0)
}

// 9. Running Edit: the pending diff is shown while in flight.
await show('running-diff', {
  name: 'edit',
  status: 'running',
  callView: {
    card: 'diff',
    title: 'Edit /tmp/a.ts',
    diffs: [{ path: '/tmp/a.ts', oldText: 'old', newText: 'new' }],
  },
}, () => rowOf('- old') >= 0 && rowOf('+ new') >= 0)
check('运行中展示待定 diff', rowOf('- old') >= 0 && rowOf('+ new') >= 0)

// 10. 状态点：分类定色、失败红 ✗。
await show('dot-bash', { name: 'bash', argsText: '{"command":"ls"}' },
  () => rowOf('Bash') >= 0 && (lines()[rowOf('Bash')] ?? '').includes('•'))
{
  const row = rowOf('Bash')
  check('bash dot is sage green', row >= 0 && lines()[row]!.includes('•') && fgAt(lines()[row]!.indexOf('•'), row) === 0x7fae99)
}
await show('dot-read', { name: 'read' },
  () => rowOf('Read') >= 0 && (lines()[rowOf('Read')] ?? '').includes('•'))
{
  const row = rowOf('Read')
  check('read dot is teal blue', row >= 0 && fgAt(lines()[row]!.indexOf('•'), row) === 0x82b8c7)
}
await show('dot-edit', { name: 'edit' },
  () => rowOf('Edit') >= 0 && (lines()[rowOf('Edit')] ?? '').includes('•'))
{
  const row = rowOf('Edit')
  check('edit dot is misty purple', row >= 0 && fgAt(lines()[row]!.indexOf('•'), row) === 0xb3a0d4)
}
await show('dot-error', { name: 'bash', status: 'error', errorText: 'boom' },
  () => rowOf('Bash') >= 0 && (lines()[rowOf('Bash')] ?? '').includes('✗'))
{
  const row = rowOf('Bash')
  check('failure dot turns into a red ✗', row >= 0 && lines()[row]!.includes('✗') && fgAt(lines()[row]!.indexOf('✗'), row) === 0xda8a93)
}

// 12. Multi-hunk edit (settled contextual diff): adjacent hunks in one file separated by ⋯.
await show('multi-hunk', {
  name: 'edit',
  callView: {
    card: 'diff',
    title: 'Edit /tmp/a.ts',
    diffs: [{ path: '/tmp/a.ts', oldText: 'x', newText: 'y' }],
  },
  resultView: {
    card: 'diff',
    title: 'Edit /tmp/a.ts',
    diffs: [
      { path: '/tmp/a.ts', oldText: 'l1', newText: 'l1c' },
      { path: '/tmp/a.ts', oldText: 'l9', newText: 'l9c' },
    ],
  },
}, () => rowOf('⋯') >= 0 && rowOf('- l1') >= 0 && rowOf('+ l9c') >= 0)
check('多 hunk 用 ⋯ 分隔', rowOf('⋯') >= 0 && rowOf('- l1') >= 0 && rowOf('+ l9c') >= 0)

// 13. Grep search card: matches grouped by file.
await show('grep', {
  name: 'grep',
  callView: { card: 'generic', title: 'Grep TODO in src' },
  resultView: {
    card: 'search',
    shape: 'matches',
    files: [{ path: 'src/a.ts', matches: [{ lineNumber: 12, line: '// TODO fix' }] }],
    truncated: true,
    total: 7,
  },
  resultFull: 'src/a.ts:12: // TODO fix',
}, () => rowOf('12: // TODO fix') >= 0 && rowOf('(7 total)') >= 0)
{
  const s = screen()
  check('search card title falls back to the call title', s.includes('Grep TODO in src'))
  check('search card groups by file + truncation count', rowOf('src/a.ts') >= 0 && rowOf('12: // TODO fix') >= 0 && rowOf('(7 total)') >= 0)
}

// 14. Glob search card: paths shape.
await show('glob', {
  name: 'glob',
  callView: { card: 'generic', title: 'Glob **/*.ts' },
  resultView: {
    card: 'search',
    shape: 'paths',
    paths: ['src/a.ts', 'src/b.ts'],
    truncated: false,
    total: 2,
  },
  resultFull: 'src/a.ts\nsrc/b.ts',
}, () => rowOf('src/b.ts') >= 0)
check('Glob paths 逐行列出', rowOf('src/a.ts') >= 0 && rowOf('src/b.ts') >= 0)

app.unmount()
await sleep(100)
console.log(results.join('\n'))
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
