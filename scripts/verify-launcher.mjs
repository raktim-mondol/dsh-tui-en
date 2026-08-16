#!/usr/bin/env node
/**
 * verify-launcher.mjs — bin/dsh-tui.js one-shot launcher regression (issue #108).
 *
 * Puts a dsh stub on PATH that records argv token-by-token (plus an empty
 * pnpm stub) and covers:
 *   - args forwarded as-is to `dsh --profile dsh-tui` (spaces stay one token)
 *   - a broken profile (dir exists, package.json unreadable) re-bootstraps
 *     and pins the version to this package
 *   - a version mismatch prints a hint; forward skew (profile newer) does
 *     not block startup (the TUI degrades gracefully since 0.7.2), reverse
 *     skew (profile older, issue #183) refuses to launch and prints the
 *     alignment command — the dsh CLI would apply the launcher's bundle
 *     patch to the profile's older package, and startup would crash opaquely
 *   - user-facing messages are English-only: DSH_TUI_LANG=zh still prints
 *     English (compat, ignored)
 *   - shellQuote unit (the win32 shell:true path never runs on CI Linux, so
 *     the escape rules themselves are covered here)
 *
 * Run: pnpm build && node scripts/verify-launcher.mjs
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shellQuote } from '../lib/types/utils/shellQuote.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(root, 'bin', 'dsh-tui.js')
const ownVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const PKG_DIR = join('profiles', 'dsh-tui', 'node_modules', '@deepseek-harness-tui', 'dsh-tui')

let failures = 0
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`)
  if (!ok) failures++
}

// --- Test environment: a temp DSH_HOME + a dsh stub that records argv --------
const tmp = mkdtempSync(join(tmpdir(), 'verify-launcher-'))
const home = join(tmp, 'home')
const stubDir = join(tmp, 'stub-bin')
const stubLog = join(tmp, 'stub.log')
const isWin = process.platform === 'win32'
mkdirSync(stubDir, { recursive: true })
// argv is <angle>-encoded token by token, so a split argument is obvious at
// a glance; exit code is always 0.
writeFileSync(join(stubDir, 'dsh'), '#!/bin/sh\nfor a in "$@"; do printf \'<%s>\' "$a"; done >> "$DSH_STUB_LOG"\nprintf \'\\n\' >> "$DSH_STUB_LOG"\nexit 0\n')
writeFileSync(join(stubDir, 'pnpm'), '#!/bin/sh\nexit 0\n')
chmodSync(join(stubDir, 'dsh'), 0o755)
chmodSync(join(stubDir, 'pnpm'), 0o755)
// Windows: the launcher goes through shell:true → cmd, which only sees
// .cmd/.bat — an extension-less sh script is invisible, hence the .cmd stub.
// Its log format matches the sh stub byte-for-byte (angle encoding + newline)
// so both platforms share the same assertions. Must be pure ASCII + CRLF;
// node comes from runBin's PATH.
if (isWin) {
  writeFileSync(
    join(stubDir, 'dsh.cmd'),
    '@echo off\r\nnode -e "const fs=require(\'fs\');fs.appendFileSync(process.env.DSH_STUB_LOG,process.argv.slice(1).map(a=>\'<\'+a+\'>\').join(\'\')+\'\\n\')" -- %*\r\n@exit /b 0\r\n',
    'ascii',
  )
  writeFileSync(join(stubDir, 'pnpm.cmd'), '@echo off\r\n@exit /b 0\r\n', 'ascii')
}
// cmd.exe needs node (the stub depends on it) and System32 (the shell
// interpreter) on PATH; the PATH separator differs by platform.
const sep = isWin ? ';' : ':'
const winBasics = ['C:\\Windows\\System32', 'C:\\Windows']
const stubPath = [stubDir, ...(isWin ? [dirname(process.execPath), ...winBasics] : ['/usr/bin', '/bin'])].join(sep)
// The no-dsh environment must never include a node directory — if the local
// machine's node lives alongside dsh (e.g. D:\node), that would drag the
// real dsh in. bin itself is spawned by absolute path, so it needs no node
// on PATH; only cmd.exe (System32) is required.
const noDshPath = (isWin ? winBasics : ['/usr/bin', '/bin']).join(sep)

function setProfileVersion(version) {
  const dir = join(home, PKG_DIR)
  mkdirSync(dir, { recursive: true })
  if (version === undefined) rmSync(join(dir, 'package.json'), { force: true })
  else writeFileSync(join(dir, 'package.json'), JSON.stringify({ version }))
}

function resetStubLog() {
  writeFileSync(stubLog, '')
}
function stubCalls() {
  return readFileSync(stubLog, 'utf8').trim().split('\n').filter(Boolean)
}

function runBin(args, extraEnv = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    env: {
      PATH: stubPath,
      HOME: tmp,
      DSH_HOME: home,
      DSH_STUB_LOG: stubLog,
      // The launcher's spawn(shell:true) trips Node's DEP0190 deprecation
      // warning on Windows, which would pollute stderr for the "silent
      // startup" assertions — suppressed for the test environment.
      NODE_OPTIONS: '--no-deprecation',
      ...extraEnv,
    },
    encoding: 'utf8',
  })
}

// --- 1. A broken profile triggers reinstall, pinned to this package's version
setProfileVersion(undefined) // dir exists, package.json unreadable
resetStubLog()
let r = runBin([])
check('bootstrap: broken profile triggers reinstall', stubCalls().some(c => c.includes('<plugin>') && c.includes('<add>')))
check('bootstrap: pinned to the launcher version', stubCalls().some(c => c.includes(`<@deepseek-harness-tui/dsh-tui@${ownVersion}>`)))
check('bootstrap: launches after reinstall', stubCalls().at(-1) === '<--profile><dsh-tui>')
check('bootstrap: exits 0', r.status === 0)

// --- 2. Version match: args forwarded as-is, no hint printed ----------------
setProfileVersion(ownVersion)
resetStubLog()
r = runBin(['foo', 'a b'])
check('passthrough: args forwarded after --profile', stubCalls().at(-1) === '<--profile><dsh-tui><foo><a b>')
check('passthrough: silent when aligned', r.stderr.trim() === '')

// --- 3. Forward skew (profile newer): prints a hint but does not block startup
const [ownMajor, ownMinor] = ownVersion.split('-')[0].split('.').map(Number)
const newerProfile = `${ownMajor}.${ownMinor + 1}.0`
setProfileVersion(newerProfile)
resetStubLog()
r = runBin([])
check('mismatch: hint names both versions', r.stderr.includes(`v${newerProfile}`) && r.stderr.includes(`v${ownVersion}`))
check('mismatch: still launches', stubCalls().at(-1) === '<--profile><dsh-tui>' && r.status === 0)

// --- 3.5 Reverse skew (profile older, issue #183): refuses to launch and
// prints the alignment command. The dsh CLI's bundle patch comes from the
// launcher's copy, the plugin modules from the profile's copy; when the
// launcher is a newer minor, the patch may reference subpath exports the
// older package doesn't have and startup crashes opaquely — the launcher
// must intercept this before dsh does.
setProfileVersion('0.0.0')
resetStubLog()
r = runBin([])
check('reverse skew: refuses to launch', r.status === 1 && !stubCalls().some(c => c.includes('<--profile>')))
check('reverse skew: names both versions', r.stderr.includes('v0.0.0') && r.stderr.includes(`v${ownVersion}`))
check('reverse skew: prints the align command', r.stderr.includes(`add @deepseek-harness-tui/dsh-tui@${ownVersion}`))
r = runBin([], { DSH_TUI_LANG: 'en' })
check('reverse skew: English message', r.stderr.includes('cannot start'))

// --- 4. Messages are English-only: this launcher's MSG table has no `lang`
// branch left (DSH_TUI_LANG / CC_TUI_LANG are not consulted, matching the
// TUI's own English-lock) — every case below prints the same English text.
const envNoDsh = { PATH: noDshPath }
r = runBin([], { ...envNoDsh, DSH_TUI_LANG: 'en' })
check('i18n: DSH_TUI_LANG=en prints English', r.stderr.includes('dsh CLI not found'))
r = runBin([], { ...envNoDsh, DSH_TUI_LANG: 'zh' })
check('i18n: DSH_TUI_LANG=zh still prints English (compat, ignored)', r.stderr.includes('dsh CLI not found'))
r = runBin([], envNoDsh)
check('i18n: default (unset) prints English', r.stderr.includes('dsh CLI not found'))

// --- 5. shellQuote unit (the escape rules for the win32 shell:true path) -----
check('shellQuote: plain tokens pass through', shellQuote(['plugin', '--profile', 'dsh-tui']).join(' ') === 'plugin --profile dsh-tui')
check('shellQuote: spaces get quoted', shellQuote(['a b']).join(' ') === '"a b"')
check('shellQuote: embedded quotes are doubled', shellQuote(['a"b c']).join(' ') === '"a""b c"')

rmSync(tmp, { recursive: true, force: true })
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
