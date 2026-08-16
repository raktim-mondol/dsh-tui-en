#!/usr/bin/env node
/**
 * verify-launcher.mjs — bin/dsh-tui.js one-shot launcher regression (issue #108).
 *
 * Puts a dsh stub on PATH that records argv token-by-token (plus an empty
 * pnpm stub) and covers:
 *   - args forwarded as-is to `dsh --profile dsh-tui` (spaces stay one token)
 *   - a broken profile (dir exists, package.json unreadable) re-bootstraps
 *     and pins the version to this package
 *   - a version mismatch prints a hint but still launches
 *   - user-facing messages are English: DSH_TUI_LANG=zh also prints English
 *     (Chinese has been removed)
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

// --- Test env: temp DSH_HOME + argv-recording dsh stub -----------------------------
const tmp = mkdtempSync(join(tmpdir(), 'verify-launcher-'))
const home = join(tmp, 'home')
const stubDir = join(tmp, 'stub-bin')
const stubLog = join(tmp, 'stub.log')
const isWin = process.platform === 'win32'
mkdirSync(stubDir, { recursive: true })
// Encode each argv token in <angle> brackets so a split is obvious; always exit 0.
writeFileSync(join(stubDir, 'dsh'), '#!/bin/sh\nfor a in "$@"; do printf \'<%s>\' "$a"; done >> "$DSH_STUB_LOG"\nprintf \'\\n\' >> "$DSH_STUB_LOG"\nexit 0\n')
writeFileSync(join(stubDir, 'pnpm'), '#!/bin/sh\nexit 0\n')
chmodSync(join(stubDir, 'dsh'), 0o755)
chmodSync(join(stubDir, 'pnpm'), 0o755)
// Windows: the launcher uses shell:true / cmd, which only sees .cmd/.bat —
// a bare sh script is invisible, so we need a .cmd stub. Log format matches
// the sh stub byte-for-byte (angle encoding + newline) so both share the
// same assertions. cmd must be pure ASCII + CRLF; node comes from runBin PATH.
if (isWin) {
  writeFileSync(
    join(stubDir, 'dsh.cmd'),
    '@echo off\r\nnode -e "const fs=require(\'fs\');fs.appendFileSync(process.env.DSH_STUB_LOG,process.argv.slice(1).map(a=>\'<\'+a+\'>\').join(\'\')+\'\\n\')" -- %*\r\n@exit /b 0\r\n',
    'ascii',
  )
  writeFileSync(join(stubDir, 'pnpm.cmd'), '@echo off\r\n@exit /b 0\r\n', 'ascii')
}
// cmd.exe needs node on PATH (stub dependency) and System32 (shell);
// PATH separators differ by platform.
const sep = isWin ? ';' : ':'
const winBasics = ['C:\\Windows\\System32', 'C:\\Windows']
const stubPath = [stubDir, ...(isWin ? [dirname(process.execPath), ...winBasics] : ['/usr/bin', '/bin'])].join(sep)
// No-dsh env: must not include the node dir — when node and dsh share a
// directory (D:\\node) the real dsh would leak in. The bin is spawned by
// absolute path, so PATH only needs cmd.exe (System32).
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
      // launcher spawn(shell:true) trips DEP0190 on Windows and would
      // dirty the "silent launch" stderr checks — disable in tests.
      NODE_OPTIONS: '--no-deprecation',
      ...extraEnv,
    },
    encoding: 'utf8',
  })
}

// --- 1. Broken profile re-bootstraps, version pinned to this package -------------
setProfileVersion(undefined) // dir exists, package.json unreadable
resetStubLog()
let r = runBin([])
check('bootstrap: broken profile triggers reinstall', stubCalls().some(c => c.includes('<plugin>') && c.includes('<add>')))
check('bootstrap: pinned to the launcher version', stubCalls().some(c => c.includes(`<@deepseek-harness-tui/dsh-tui@${ownVersion}>`)))
check('bootstrap: launches after reinstall', stubCalls().at(-1) === '<--profile><dsh-tui>')
check('bootstrap: exits 0', r.status === 0)

// --- 2. Matching versions: args forwarded as-is, no hint --------------------------
setProfileVersion(ownVersion)
resetStubLog()
r = runBin(['foo', 'a b'])
check('passthrough: args forwarded after --profile', stubCalls().at(-1) === '<--profile><dsh-tui><foo><a b>')
check('passthrough: silent when aligned', r.stderr.trim() === '')

// --- 3. Version mismatch: print a hint but still launch ---------------------------
setProfileVersion('0.0.0')
resetStubLog()
r = runBin([])
check('mismatch: hint names both versions', r.stderr.includes('v0.0.0') && r.stderr.includes(`v${ownVersion}`))
check('mismatch: still launches', stubCalls().at(-1) === '<--profile><dsh-tui>' && r.status === 0)

// --- 4. Missing-dsh error is English (default and /lang zh both English)
const envNoDsh = { PATH: noDshPath }
r = runBin([], { ...envNoDsh, DSH_TUI_LANG: 'en' })
check('i18n: DSH_TUI_LANG=en prints English', r.stderr.includes('dsh CLI not found'))
r = runBin([], { ...envNoDsh, DSH_TUI_LANG: 'zh' })
check('i18n: DSH_TUI_LANG=zh also prints English', r.stderr.includes('dsh CLI not found'))
r = runBin([], envNoDsh)
check('i18n: default (unset) prints English', r.stderr.includes('dsh CLI not found'))

// --- 5. shellQuote unit (escape rules for the win32 shell:true path) ---------
check('shellQuote: plain tokens pass through', shellQuote(['plugin', '--profile', 'dsh-tui']).join(' ') === 'plugin --profile dsh-tui')
check('shellQuote: spaces get quoted', shellQuote(['a b']).join(' ') === '"a b"')
check('shellQuote: embedded quotes are doubled', shellQuote(['a"b c']).join(' ') === '"a""b c"')

rmSync(tmp, { recursive: true, force: true })
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
