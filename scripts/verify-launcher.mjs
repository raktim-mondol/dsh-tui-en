#!/usr/bin/env node
/**
 * verify-launcher.mjs — bin/dsh-tui.js one-shot launcher regression (issue #108).
 *
 * Puts a dsh stub on PATH that records argv token-by-token (plus an empty
 * pnpm stub) and covers:
 *   - args forwarded as-is to `dsh --profile dsh-tui` (spaces stay one token)
 *   - a broken profile (dir exists, package.json unreadable) re-bootstraps
 *     and pins the version to this package
 *   - the ERR_PNPM_ADDING_TO_ROOT signature on stdout (issue #239 / PR #241
 *     regression): once recognized, exactly one retry with -w; a failure
 *     without the signature is not blindly retried
 *   - no-op fake success (add reports success but the marker file is
 *     missing): fail loud with the recovery path of deleting and rebuilding
 *     the profile, instead of starting up and crashing opaquely later
 *   - a version mismatch prints a hint; forward skew (profile newer) does
 *     not block startup (the TUI degrades gracefully since 0.7.2), reverse
 *     skew (profile older, issue #183) refuses to launch and prints the
 *     alignment command — the dsh CLI would apply the launcher's bundle
 *     patch to the profile's older package, and startup would crash opaquely
 *   - a non-zero exit from the profile subprocess preserves the exit code
 *     and the direct-run diagnostic command
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
const PROFILE = 'dsh-tui'
const PACKAGE = '@deepseek-harness-tui/dsh-tui'
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
// a glance; DSH_STUB_EXIT only fails the actual profile subprocess, the
// `dsh --version` preflight always succeeds. plugin add is controllable:
// DSH_STUB_ADD_FAILS=N fails the first N add attempts — DSH_STUB_ADD_SIG
// writes the signature to stdout, DSH_STUB_ADD_EXIT_CODE sets the exit code
// (the signature goes to stdout to match real pnpm/dsh forwarding behavior;
// the PR #241 regression was exactly this — treating the signature as
// stderr — so the stdout path must be asserted). The success path simulates
// a real install by creating the marker file (DSH_STUB_PKG_VERSION);
// DSH_STUB_ADD_NOCREATE=1 simulates a no-op fake success (pnpm's
// already-up-to-date behavior on a broken profile: reports success,
// installs nothing).
writeFileSync(join(stubDir, 'dsh'), '#!/bin/sh\nfor a in "$@"; do printf \'<%s>\' "$a"; done >> "$DSH_STUB_LOG"\nprintf \'\\n\' >> "$DSH_STUB_LOG"\nif [ "$1" = "plugin" ]; then\n  c="$DSH_STUB_LOG.count"\n  n=$(cat "$c" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$c"\n  if [ "$n" -le "${DSH_STUB_ADD_FAILS:-0}" ]; then\n    [ -n "$DSH_STUB_ADD_SIG" ] && printf \'%s\\n\' "$DSH_STUB_ADD_SIG"\n    exit "${DSH_STUB_ADD_EXIT_CODE:-1}"\n  fi\n  if [ -z "$DSH_STUB_ADD_NOCREATE" ]; then\n    d="$DSH_HOME/profiles/dsh-tui/node_modules/@deepseek-harness-tui/dsh-tui"\n    mkdir -p "$d" && printf \'{"version":"%s"}\' "${DSH_STUB_PKG_VERSION:-0.0.0-stub}" > "$d/package.json"\n  fi\n  exit 0\nfi\nif [ "$1" = "--profile" ]; then exit "${DSH_STUB_EXIT:-0}"; fi\nexit 0\n')
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
    '@echo off\r\nnode -e "const fs=require(\'fs\');const a=process.argv.slice(1);fs.appendFileSync(process.env.DSH_STUB_LOG,a.map(v=>\'<\'+v+\'>\').join(\'\')+\'\\n\');if(a[0]===\'plugin\'){const c=process.env.DSH_STUB_LOG+\'.count\';let n=0;try{n=Number(fs.readFileSync(c,\'utf8\'))||0}catch(e){}n++;fs.writeFileSync(c,String(n));if(n<=Number(process.env.DSH_STUB_ADD_FAILS||0)){if(process.env.DSH_STUB_ADD_SIG)console.log(process.env.DSH_STUB_ADD_SIG);process.exit(Number(process.env.DSH_STUB_ADD_EXIT_CODE||1));}if(!process.env.DSH_STUB_ADD_NOCREATE){const d=process.env.DSH_HOME+\'/profiles/dsh-tui/node_modules/@deepseek-harness-tui/dsh-tui\';fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+\'/package.json\',JSON.stringify({version:process.env.DSH_STUB_PKG_VERSION||\'0.0.0-stub\'}));}process.exit(0);}process.exit(a[0]===\'--profile\'?Number(process.env.DSH_STUB_EXIT||0):0)" -- %*\r\n@exit /b %errorlevel%\r\n',
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
  rmSync(`${stubLog}.count`, { force: true })
}
function stubCalls() {
  return readFileSync(stubLog, 'utf8').trim().split('\n').filter(Boolean)
}

function runBin(args, extraEnv = {}, { delegating = false } = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    env: {
      PATH: stubPath,
      HOME: tmp,
      DSH_HOME: home,
      DSH_STUB_LOG: stubLog,
      // The marker file the stub install creates defaults its version to
      // match the launcher — otherwise the post-bootstrap version compare
      // would pollute the "silent startup" assertions with a skew hint.
      DSH_STUB_PKG_VERSION: ownVersion,
      // The launcher's spawn(shell:true) trips Node's DEP0190 deprecation
      // warning on Windows, which would pollute stderr for the "silent
      // startup" assertions — suppressed for the test environment.
      NODE_OPTIONS: '--no-deprecation',
      // 0.8.7 dual-mode launcher: force the full logic by default (the full
      // path this regression suite covers); the delegating-role cases opt
      // out as needed (see section 4).
      ...(delegating ? {} : { DSH_TUI_NO_DELEGATE: '1' }),
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

// --- 1.5 ERR_PNPM_ADDING_TO_ROOT signature on stdout (issue #239 / PR #241
// regression): the signature is forwarded via dsh's stdout (pnpm writes its
// error report to stdout); #241 only checked stderr, so detection never
// fired and a fresh bootstrap always failed — detection must cover the
// captured stdout, and the install must succeed after the retry.
setProfileVersion(undefined)
resetStubLog()
r = runBin([], {
  DSH_STUB_ADD_FAILS: '1',
  DSH_STUB_ADD_SIG: 'ERR_PNPM_ADDING_TO_ROOT Running this command will add the dependency to the workspace root',
  DSH_TUI_LANG: 'en',
})
const addCalls = () => stubCalls().filter(c => c.includes('<plugin>') && c.includes('<add>'))
const launchCalls = () => stubCalls().filter(c => c.startsWith('<--profile>'))
check('root-refusal: retries exactly once with -w', addCalls().length === 2 && addCalls()[1].includes('<-w>'))
check('root-refusal: retry notice printed', r.stdout.includes('retrying with -w'))
check('root-refusal: captured refusal replayed to the user', r.stderr.includes('ERR_PNPM_ADDING_TO_ROOT'))
check('root-refusal: launches after the retry', stubCalls().at(-1) === '<--profile><dsh-tui>' && r.status === 0)

// --- 1.6 A failure without the signature: no blind -w retry, handled as a
// plain install failure -------------------------------------------------------
setProfileVersion(undefined)
resetStubLog()
r = runBin([], { DSH_STUB_ADD_FAILS: '9', DSH_STUB_ADD_EXIT_CODE: '3', DSH_TUI_LANG: 'en' })
check('other failure: no -w retry without the signature', addCalls().length === 1 && !addCalls()[0].includes('<-w>'))
check('other failure: manual hint kept', r.stderr.includes('Retry manually'))
check('other failure: exit code preserved', r.status === 3)

// --- 1.7 No-op fake success (re-checked after bootstrap): add reports
// success but the marker file is still missing — pnpm treats a profile with
// a broken package as already up to date, so a retry always "succeeds" while
// startup is guaranteed to crash (cannot resolve profile bundle), and the
// plugin install in the crash hint is equally a no-op. Fail loud with the
// recovery path of deleting and rebuilding the profile, instead of
// continuing to start up.
setProfileVersion(undefined)
resetStubLog()
r = runBin([], { DSH_STUB_ADD_NOCREATE: '1', DSH_TUI_LANG: 'en' })
check('no-op install: fails loud instead of launching', r.status === 1 && launchCalls().length === 0)
check('no-op install: names the unreadable package', r.stderr.includes('still unreadable'))
check('no-op install: gives the rm -rf recovery', r.stderr.includes('rm -rf'))
r = runBin([], { DSH_STUB_ADD_NOCREATE: '1', DSH_TUI_LANG: 'zh' })
check('no-op install: DSH_TUI_LANG=zh still prints English (compat, ignored)', r.stderr.includes('still unreadable'))

// --- 2. Version match: args forwarded as-is, no hint printed ----------------
setProfileVersion(ownVersion)
resetStubLog()
r = runBin(['foo', 'a b'])
check('passthrough: args forwarded after --profile', stubCalls().at(-1) === '<--profile><dsh-tui><foo><a b>')
check('passthrough: silent when aligned', r.stderr.trim() === '')

// --- 2.5 Non-zero profile exit: preserves the exit code and a directly
// reproducible command (must be tested at matched versions — a skew hint or
// refusal would interfere with the exit-code/stderr assertions) -------------
resetStubLog()
r = runBin([], { DSH_STUB_EXIT: '42', DSH_TUI_LANG: 'en' })
check('nonzero exit: launcher preserves the child status', r.status === 42)
check('nonzero exit: stderr names the status', r.stderr.includes('profile exited with code 42'))
check('nonzero exit: stderr gives the direct command', r.stderr.includes('dsh --profile dsh-tui'))
r = runBin([], { DSH_STUB_EXIT: '42', DSH_TUI_LANG: 'zh' })
check('nonzero exit: DSH_TUI_LANG=zh message still names the status in English', r.stderr.includes('profile exited with code 42'))

// --- 3. Forward skew (profile newer): must point at "update the global
// launcher" — since 0.8.3 the fix direction is split by version direction:
// when the profile is newer than the launcher, telling the user to run
// /update just loops on "Already up to date" — the exact global-upgrade
// command must be given instead.
const [ownMajor, ownMinor] = ownVersion.split('-')[0].split('.').map(Number)
const newerProfile = `${ownMajor}.${ownMinor + 1}.0`
setProfileVersion(newerProfile)
resetStubLog()
r = runBin([])
check('forward skew: hint names both versions', r.stderr.includes(`v${newerProfile}`) && r.stderr.includes(`v${ownVersion}`))
check(
  'forward skew: tells user to align the global launcher',
  r.stderr.includes(`npm install -g --legacy-peer-deps ${PACKAGE}@${newerProfile}`),
)
check(
  'forward skew: never tells user to update the profile again',
  !r.stderr.includes('/update') && !r.stderr.includes(`plugin --profile ${PROFILE}`),
)
check('forward skew: still launches', stubCalls().at(-1) === '<--profile><dsh-tui>' && r.status === 0)

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

// --- 3.6 Same-minor reverse patch skew (0.8.2 launcher / 0.8.1 profile) ---
// Non-fatal: allowed to launch, but should tell the user to align the
// profile to the launcher (built with a prerelease semver to get "same
// core, older" — for a stable release x.y.z, x.y.z-0 is always older with
// the same major/minor).
const olderSameMinorProfile = `${ownVersion}-0`
setProfileVersion(olderSameMinorProfile)
resetStubLog()
r = runBin([])
check(
  'patch skew: older profile still launches',
  stubCalls().at(-1) === '<--profile><dsh-tui>' && r.status === 0,
)
check(
  'patch skew: tells user to align the profile to the launcher',
  r.stderr.includes(`dsh plugin --profile ${PROFILE} add ${PACKAGE}@${ownVersion}`),
)
check(
  'patch skew: does not tell user to update the global launcher',
  !r.stderr.includes('npm install -g'),
)

// --- 3.7 Launcher→runtime contract: the subprocess must receive
// DSH_TUI_LAUNCHER_VERSION so /update can diagnose whether the global
// launcher lags behind the just-installed profile. A static source
// assertion for now; a stronger e2e (stub records the subprocess env) can
// follow later.
const launcherSource = readFileSync(bin, 'utf8')
check(
  'launcher env: child receives DSH_TUI_LAUNCHER_VERSION',
  launcherSource.includes('process.env.DSH_TUI_LAUNCHER_VERSION = ownVersion'),
)

// --- 4. Delegating role (0.8.7 dual-mode launcher): global copy → the copy
// inside the profile -----------------------------------------------------
// Real bin + fake DSH_HOME: the repo directory and the fake profile aren't
// the same physical directory → takes the thin-shim role. Pre-place the real
// bin inside the fake profile (simulating a completed install), and verify:
//   - once delegated, the copy inside the profile runs the full logic
//     (argv forwarded as-is across the two hops)
//   - when the marker file is missing (broken profile), the thin shim
//     bootstraps first, then delegates
//   - when the profile has the marker file but no bin, fail loud with a
//     reinstall hint
const placeProfileBin = () => {
  const dir = join(home, PKG_DIR, 'bin')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'dsh-tui.js'), readFileSync(bin, 'utf8'))
}

setProfileVersion(ownVersion)
placeProfileBin()
resetStubLog()
r = runBin(['foo', 'a b'], {}, { delegating: true })
check('shim: delegates argv through to the profile copy', stubCalls().at(-1) === '<--profile><dsh-tui><foo><a b>')
check('shim: silent + exit 0 when aligned', r.status === 0 && r.stderr.trim() === '')

setProfileVersion(undefined)
placeProfileBin() // the add stub only creates package.json — the bin is a pre-placed "already installed" artifact
resetStubLog()
r = runBin([], {}, { delegating: true })
check(
  'shim: bootstraps a broken profile before delegating',
  stubCalls().some(c => c.includes('<plugin>') && c.includes('<add>'))
    && stubCalls().at(-1) === '<--profile><dsh-tui>'
    && r.status === 0,
)

// Marker file present, bin missing: the delegation target is unreadable —
// give a global reinstall hint instead of crashing opaquely.
setProfileVersion(ownVersion)
rmSync(join(home, PKG_DIR, 'bin'), { recursive: true, force: true })
resetStubLog()
r = runBin([], { DSH_TUI_LANG: 'en' }, { delegating: true })
check('shim: no bin fails loud with the reinstall hint', r.status === 1 && r.stderr.includes(`Reinstall the global launcher`))
check('shim: reinstall hint names the npm command', r.stderr.includes(`npm install -g --legacy-peer-deps ${PACKAGE}`))


// --- 5. Messages are English-only: the error when dsh is missing (same
// contract as the TUI: DSH_TUI_LANG=zh is accepted for compat but ignored,
// English is always printed) -------------------------------------------
const envNoDsh = { PATH: noDshPath }
r = runBin([], { ...envNoDsh, DSH_TUI_LANG: 'en' })
check('i18n: DSH_TUI_LANG=en prints English', r.stderr.includes('dsh CLI not found'))
r = runBin([], { ...envNoDsh, DSH_TUI_LANG: 'zh' })
check('i18n: DSH_TUI_LANG=zh still prints English (compat, ignored)', r.stderr.includes('dsh CLI not found'))
r = runBin([], envNoDsh)
check('i18n: default (unset) prints English', r.stderr.includes('dsh CLI not found'))

// --- 6. shellQuote unit (the escape rules for the win32 shell:true path) -----
check('shellQuote: plain tokens pass through', shellQuote(['plugin', '--profile', 'dsh-tui']).join(' ') === 'plugin --profile dsh-tui')
check('shellQuote: spaces get quoted', shellQuote(['a b']).join(' ') === '"a b"')
check('shellQuote: embedded quotes are doubled', shellQuote(['a"b c']).join(' ') === '"a""b c"')

rmSync(tmp, { recursive: true, force: true })
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
