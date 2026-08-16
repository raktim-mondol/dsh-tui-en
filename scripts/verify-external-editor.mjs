/**
 * External editor regression (issue #123): Ctrl+X's $VISUAL/$EDITOR
 * resolution and the temp-file round trip. Covers:
 *
 * - splitEditorCommand: whitespace splitting + single/double quotes
 *   (`code --wait`, a path with spaces)
 * - resolveEditorCommand: VISUAL takes priority over EDITOR, a blank value
 *   is skipped, POSIX falls back to vi, Windows with no editor → undefined
 * - resolveWindowsShim: PATH/PATHEXT resolution (code → code.cmd goes
 *   through cmd.exe, code.exe spawns directly), an explicit extension
 *   passes through unchanged
 * - cross-spawn quoting protocol: cmdEscapeCommand/cmdEscapeArgument's
 *   qntm.org/cmd escaping rules, node_modules/.bin shim double-escaping,
 *   buildCmdExeSpawn's comspec + /d /s /c + windowsVerbatimArguments
 * - editInExternalEditor end to end (a node fake-editor process):
 *   append write → edited; unchanged → unchanged; non-zero exit (:cq) →
 *   unchanged; editor missing → failed; trailing-newline boundaries (a
 *   draft's own \n must not be misjudged, the editor's terminating newline
 *   is stripped, a Shift+Enter blank line is kept); the three CRLF
 *   boundaries (internal/single trailing/multiple trailing) with a
 *   no-op save must never count as an edit
 * - exception safety (the never-throws contract): EDITOR='""' → a
 *   synchronous spawn failure → failed, with no temp-dir leak; an
 *   unwritable TMPDIR → failed; EDITOR=/bin/rm deleting the draft →
 *   unchanged; a fake Ink instance where enter throws → failed with exit
 *   still called; exit throwing → outcome returns normally, not overwritten
 *
 * No TTY in CI: the fake Ink instance is registered directly into the
 * instances map to cover the handoff path; the real editor is always a
 * node-run script file, with the path inside the EDITOR string double-quoted
 * (Windows' default Node install path contains spaces and must not split there).
 *
 * Run with plain node against the compiled lib: `node scripts/verify-external-editor.mjs`
 */
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildCmdExeSpawn,
  editInExternalEditor,
  resolveEditorCommand,
  resolveWindowsShim,
  splitEditorCommand,
} from '../lib/types/utils/externalEditor.js'
import { cmdEscapeArgument, cmdEscapeCommand } from '../lib/types/utils/shellQuote.js'
import instances from '../lib/types/ink/instances.js'

let failed = 0
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Count of dsh-tui-prompt-* directories under tmp — used for leak assertions. */
const promptDirCount = () =>
  readdirSync(tmpdir()).filter(name => name.startsWith('dsh-tui-prompt-')).length

// ── splitEditorCommand ────────────────────────────────────────────────
check('split: whitespace split with an argument', eq(splitEditorCommand('code --wait'), ['code', '--wait']))
check('split: double quotes wrap a path with spaces', eq(splitEditorCommand('"/opt/my editor/nvim" -f'), ['/opt/my editor/nvim', '-f']))
check('split: single-quoted argument', eq(splitEditorCommand("nano '--restricted'"), ['nano', '--restricted']))
check('split: empty string → empty array', eq(splitEditorCommand('   '), []))
check('split: empty quotes → empty-string argument', eq(splitEditorCommand('""'), ['']))

// ── resolveEditorCommand ─────────────────────────────────────────────
check('resolve: VISUAL takes priority', eq(resolveEditorCommand({ VISUAL: 'vim', EDITOR: 'nano' }), ['vim']))
check('resolve: a blank VISUAL is skipped in favor of EDITOR', eq(resolveEditorCommand({ VISUAL: '  ', EDITOR: 'nano' }), ['nano']))
check('resolve: a whole string with arguments is parsed', eq(resolveEditorCommand({ EDITOR: 'code --wait' }), ['code', '--wait']))
check('resolve: Windows with no editor → undefined', resolveEditorCommand({}, 'win32') === undefined)
if (process.platform !== 'win32') {
  check('resolve: POSIX falls back to vi', eq(resolveEditorCommand({}), ['vi']))
}

// ── cross-spawn quoting protocol (pure functions) ───────────────────────
check(
  'cmd-escape: a command path with spaces → caret-escaped',
  cmdEscapeCommand('C:\\VS Code\\bin\\code.cmd') === 'C:\\VS^ Code\\bin\\code.cmd',
  cmdEscapeCommand('C:\\VS Code\\bin\\code.cmd'),
)
check('cmd-escape: an argument with no metacharacters → quoted+caret', cmdEscapeArgument('--wait') === '^"--wait^"', cmdEscapeArgument('--wait'))
check(
  'cmd-escape: embedded quotes → backslash-escaped then quoted as a whole',
  cmdEscapeArgument('say "hi"') === '^"say^ \\^"hi\\^"^"',
  cmdEscapeArgument('say "hi"'),
)
check(
  'cmd-escape: trailing backslashes are doubled',
  cmdEscapeArgument('C:\\') === '^"C:\\\\^"',
  cmdEscapeArgument('C:\\'),
)
check(
  'cmd-escape: node_modules/.bin shim double-escaping',
  cmdEscapeArgument('--wait', true) === '^^^"--wait^^^"',
  cmdEscapeArgument('--wait', true),
)
{
  const spawnDesc = buildCmdExeSpawn('C:\\VS Code\\bin\\code.cmd', ['--wait', 'C:\\T m p\\f.md'], {})
  check(
    'cmd-spawn: default comspec + /d /s /c + one outer quoting pass + verbatim',
    spawnDesc.file === 'cmd.exe' &&
      eq(spawnDesc.args, ['/d', '/s', '/c', '"C:\\VS^ Code\\bin\\code.cmd ^"--wait^" ^"C:\\T^ m^ p\\f.md^""']) &&
      spawnDesc.verbatim === true,
    JSON.stringify(spawnDesc),
  )
}
{
  const shimDesc = buildCmdExeSpawn('proj\\node_modules\\.bin\\tsc.cmd', ['--watch'], { comspec: 'C:\\Windows\\System32\\cmd.exe' })
  check(
    'cmd-spawn: .bin shim argument double-escaping + comspec respected',
    shimDesc.file === 'C:\\Windows\\System32\\cmd.exe' &&
      eq(shimDesc.args, ['/d', '/s', '/c', '"proj\\node_modules\\.bin\\tsc.cmd ^^^"--watch^^^""']),
    JSON.stringify(shimDesc),
  )
}
{
  // cross-spawn's path.normalize step: an explicit forward-slash Windows
  // path must be normalized before escaping, or cmd can ENOENT.
  const fwd = buildCmdExeSpawn('C:/Program Files/Microsoft VS Code/bin/code.cmd', ['--wait'], {})
  check(
    'cmd-spawn: a forward-slash path is win32.normalize-d before escaping',
    eq(fwd.args, ['/d', '/s', '/c', '"C:\\Program^ Files\\Microsoft^ VS^ Code\\bin\\code.cmd ^"--wait^""']),
    JSON.stringify(fwd),
  )
}
{
  // An empty-string ComSpec must also fall back to cmd.exe (cross-spawn uses || not ??).
  const emptyComspec = buildCmdExeSpawn('x.cmd', [], { comspec: '' })
  check(
    'cmd-spawn: an empty ComSpec falls back to cmd.exe',
    emptyComspec.file === 'cmd.exe' && eq(emptyComspec.args, ['/d', '/s', '/c', '"x.cmd"']),
    JSON.stringify(emptyComspec),
  )
}

// ── resolveWindowsShim (a simulated PATH directory with code.cmd / code.exe)
const scratch = mkdtempSync(join(tmpdir(), 'dsh-tui-verify-editor-'))
const shimDir = join(scratch, 'shim-bin')
mkdirSync(shimDir)
writeFileSync(join(shimDir, 'code.cmd'), '@echo off\r\n')
writeFileSync(join(shimDir, 'gvim.exe'), 'MZ')
const shimEnv = { PATH: shimDir, PATHEXT: '.EXE;.CMD' }
{
  const cmd = resolveWindowsShim('code', shimEnv)
  check('shim: code → code.cmd goes through cmd.exe', cmd.viaCmd && /code\.cmd$/i.test(cmd.command), JSON.stringify(cmd))
}
{
  const exe = resolveWindowsShim('gvim', shimEnv)
  check('shim: gvim → gvim.exe spawns directly', !exe.viaCmd && /gvim\.exe$/i.test(exe.command), JSON.stringify(exe))
}
{
  const explicit = resolveWindowsShim('nvim.cmd', shimEnv)
  check('shim: an explicit .cmd extension passes through unchanged', explicit.viaCmd && explicit.command === 'nvim.cmd')
}
{
  const missing = resolveWindowsShim('not-on-path', shimEnv)
  check('shim: unresolvable falls back to the bare command', !missing.viaCmd && missing.command === 'not-on-path')
}

// ── editInExternalEditor end to end (fake editor) ─────────────────────
// Fake editor: node runs a script file, appending/leaving alone/adding a
// terminating newline/exiting non-zero on the target file per mode. Uses a
// file rather than an inline -e script to avoid quote nesting interfering
// with splitEditorCommand.
const helper = join(scratch, 'fake-editor.cjs')
writeFileSync(helper, `
const fs = require('node:fs')
const [mode, file] = process.argv.slice(2)
if (mode === 'append') fs.appendFileSync(file, '\\nedited\\n')
if (mode === 'replace') fs.writeFileSync(file, 'replaced content\\n')
if (mode === 'ensure-newline') {
  const text = fs.readFileSync(file, 'utf8')
  if (!text.endsWith('\\n')) fs.appendFileSync(file, '\\n')
}
if (mode === 'fail') process.exit(3)
`)

const savedEnv = {
  VISUAL: process.env.VISUAL,
  EDITOR: process.env.EDITOR,
  TMPDIR: process.env.TMPDIR,
}
function useEditor(spec) {
  delete process.env.VISUAL
  process.env.EDITOR = spec
}
function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

// Paths are always quoted: an install path with spaces (Windows' default
// Node directory) must not get split apart.
const base = `"${process.execPath}" "${helper}"`

useEditor(`${base} append`)
const appended = await editInExternalEditor('hello')
check(
  'round trip: append write → edited, the editor\'s terminating newline is stripped',
  appended.kind === 'edited' && appended.text === 'hello\nedited',
  JSON.stringify(appended),
)

useEditor(`${base} replace`)
const replaced = await editInExternalEditor('')
check(
  'round trip: an empty draft is wholly replaced → edited',
  replaced.kind === 'edited' && replaced.text === 'replaced content',
  JSON.stringify(replaced),
)

useEditor(`${base} noop`)
const untouched = await editInExternalEditor('keep me')
check('round trip: unchanged → unchanged', untouched.kind === 'unchanged', JSON.stringify(untouched))

useEditor(`${base} noop`)
const trailingKept = await editInExternalEditor('keep\n')
check(
  'round trip: a draft with its own trailing newline + a no-op save → unchanged (must not be misjudged as edited-with-a-lost-newline)',
  trailingKept.kind === 'unchanged',
  JSON.stringify(trailingKept),
)

useEditor(`${base} ensure-newline`)
const ensuredNewline = await editInExternalEditor('hello')
check(
  'round trip: the editor only adds a terminating newline → unchanged (does not count as an edit)',
  ensuredNewline.kind === 'unchanged',
  JSON.stringify(ensuredNewline),
)

useEditor(`${base} append`)
const multilineTail = await editInExternalEditor('tail\n\n')
check(
  'round trip: a draft\'s own trailing blank line (Shift+Enter) survives after editing',
  multilineTail.kind === 'edited' && multilineTail.text.startsWith('tail\n\n'),
  JSON.stringify(multilineTail),
)

// CRLF boundaries: newline-convention differences never count as an edit (both sides compared after normalizing).
useEditor(`${base} noop`)
const crlfInner = await editInExternalEditor('a\r\nb')
check('CRLF: an internal \\r\\n with a no-op save → unchanged', crlfInner.kind === 'unchanged', JSON.stringify(crlfInner))

useEditor(`${base} noop`)
const crlfTail = await editInExternalEditor('keep\r\n')
check('CRLF: a single trailing \\r\\n with a no-op save → unchanged', crlfTail.kind === 'unchanged', JSON.stringify(crlfTail))

useEditor(`${base} noop`)
const crlfMulti = await editInExternalEditor('x\r\n\r\n')
check('CRLF: multiple trailing \\r\\n with a no-op save → unchanged', crlfMulti.kind === 'unchanged', JSON.stringify(crlfMulti))

useEditor(`${base} append`)
const crlfEdited = await editInExternalEditor('keep\r\n')
check(
  'CRLF: a draft with \\r\\n that is genuinely edited → edited (result normalized to LF)',
  crlfEdited.kind === 'edited' && crlfEdited.text === 'keep\n\nedited\n',
  JSON.stringify(crlfEdited),
)

useEditor(`${base} fail`)
const aborted = await editInExternalEditor('keep me')
check('round trip: a non-zero exit (:cq) → unchanged, original draft kept', aborted.kind === 'unchanged', JSON.stringify(aborted))

useEditor('/nonexistent-editor-dsh-tui-xyz')
const broken = await editInExternalEditor('draft')
check(
  'round trip: a missing editor → failed, reporting the command name',
  broken.kind === 'failed' && broken.message.includes('nonexistent-editor-dsh-tui-xyz'),
  JSON.stringify(broken),
)

// Regression repro: EDITOR='""' → an empty-command spawn fails
// synchronously → failed, with no temp-dir leak (the dir handle is
// hoisted + cleaned up in a finally as a backstop).
useEditor('""')
const dirsBeforeEmpty = promptDirCount()
const emptyCmd = await editInExternalEditor('draft')
check('exception: EDITOR=empty quotes → failed, does not throw', emptyCmd.kind === 'failed', JSON.stringify(emptyCmd))
check(
  'exception: no temp-dir leak after an empty-command failure',
  promptDirCount() === dirsBeforeEmpty,
  `before=${dirsBeforeEmpty} after=${promptDirCount()}`,
)

if (process.platform !== 'win32') {
  // Regression repro: EDITOR=/bin/rm deletes the draft file and exits
  // successfully; readFile's ENOENT used to end the process as an
  // unhandled rejection — must now map to unchanged.
  useEditor('/bin/rm')
  const removed = await editInExternalEditor('draft')
  check(
    'exception: EDITOR=/bin/rm (file deleted) → unchanged, does not throw',
    removed.kind === 'unchanged',
    JSON.stringify(removed),
  )

  // A mkdtemp failure must map to a failed result, not an unhandled rejection.
  process.env.TMPDIR = '/nonexistent-tmpdir-dsh-tui-xyz'
  useEditor(`${base} noop`)
  const fsFailed = await editInExternalEditor('draft')
  check(
    'exception: an unwritable temp directory → failed (does not throw, does not kill the process)',
    fsFailed.kind === 'failed' && fsFailed.message.includes('nonexistent-tmpdir'),
    JSON.stringify(fsFailed),
  )
  process.env.TMPDIR = savedEnv.TMPDIR ?? tmpdir()
  if (savedEnv.TMPDIR === undefined) delete process.env.TMPDIR
}

// ── terminal handoff contract (fake Ink instance) ─────────────────────────
// enter throws: outcome=failed, exit is still attempted (a partially-failed
// enter may have already suspended stdin), temp dir is cleaned up. exit
// throws: outcome is not overwritten, the promise does not reject.
{
  const calls = []
  instances.set(process.stdout, {
    enterAlternateScreen() { calls.push('enter'); throw new Error('enter exploded') },
    exitAlternateScreen() { calls.push('exit') },
  })
  const dirsBefore = promptDirCount()
  let outcome
  try {
    useEditor(`${base} noop`)
    outcome = await editInExternalEditor('draft')
  } catch (error) {
    outcome = { kind: 'rejected', message: String(error) }
  } finally {
    instances.delete(process.stdout)
  }
  check(
    'terminal: enter throws → failed, and exit is still called',
    outcome.kind === 'failed' && eq(calls, ['enter', 'exit']),
    JSON.stringify({ outcome, calls }),
  )
  check('terminal: no temp-dir leak after enter throws', promptDirCount() === dirsBefore)
}
{
  const calls = []
  instances.set(process.stdout, {
    enterAlternateScreen() { calls.push('enter') },
    exitAlternateScreen() { calls.push('exit'); throw new Error('restore failed') },
  })
  const dirsBefore = promptDirCount()
  let outcome
  try {
    useEditor(`${base} noop`)
    outcome = await editInExternalEditor('draft')
  } catch (error) {
    outcome = { kind: 'rejected', message: String(error) }
  } finally {
    instances.delete(process.stdout)
  }
  check(
    'terminal: exit throws → outcome is not overwritten, does not reject',
    outcome.kind === 'unchanged' && eq(calls, ['enter', 'exit']),
    JSON.stringify({ outcome, calls }),
  )
  check('terminal: no temp-dir leak after exit throws', promptDirCount() === dirsBefore)
}

restoreEnv()
rmSync(scratch, { recursive: true, force: true })

console.log(failed === 0 ? 'OK' : `FAILED: ${failed} check(s)`)
process.exit(failed === 0 ? 0 : 1)
