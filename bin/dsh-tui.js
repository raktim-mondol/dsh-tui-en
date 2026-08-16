#!/usr/bin/env node
/**
 * dsh-tui — a one-shot launcher for the dsh-tui profile.
 *
 * After a global install of @deepseek-harness-tui/dsh-tui you get the
 * `dsh-tui` command, so you don't have to type `dsh --profile dsh-tui`:
 *
 *   1. Probe for the dsh CLI (if missing, prompt to install @deepseek-ai/dsh);
 *   2. Check whether $DSH_HOME/profiles/dsh-tui is already initialized; if
 *      not, bootstrap with
 *      `dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui@<this package version>`
 *      — the version is pinned to this package so a stale pnpm store cache
 *      cannot drift the profile onto an older build;
 *   3. If the profile is initialized but its version does not match this
 *      package, print a one-line hint (run /update inside the TUI, or re-add);
 *   4. Forward every remaining argument to `dsh --profile dsh-tui`.
 *
 * `--resume` is intercepted by this launcher: it reads the TUI-kept
 * ~/.dsh-tui/resume.txt (legacy ~/.dsh-cc/resume.txt as a fallback until
 * old TUI builds age out — see the launcher contract in
 * src/sessionHistory.ts, issue #120) and feeds it back through
 * DSH_TUI_RESUME_SESSION (and the compatible DSH_CC_RESUME_SESSION write).
 * The flag itself is not passed through to dsh.
 *
 * User-facing messages are English. This launcher runs before TUI boot and
 * cannot reuse src/i18n.ts. `DSH_TUI_LANG` / `CC_TUI_LANG` are ignored —
 * both `en` and `zh` print English.
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shellQuote } from '../lib/types/utils/shellQuote.js'
import { detectLegacyEnv, RENAMED_ENV } from '../lib/types/utils/paths.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const ownVersion = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version
const PACKAGE = '@deepseek-harness-tui/dsh-tui'
const PROFILE = 'dsh-tui'

// --- Messages (launcher runs before TUI boot, so it cannot reuse src/i18n.ts)
// English only. DSH_TUI_LANG / CC_TUI_LANG are not consulted.
const MSG = {
  noDsh: '[dsh-tui] dsh CLI not found. Install the official client first:\n  npm install -g @deepseek-ai/dsh',
  noPnpm: '[dsh-tui] The first-time setup needs pnpm (dsh plugin delegates installs to it):\n  npm install -g pnpm   (or via corepack: corepack enable pnpm)',
  bootstrapStart: `[dsh-tui] First run — initializing the ${PROFILE} profile (${PACKAGE}@${ownVersion})…`,
  installFailed: `[dsh-tui] Plugin install failed. Retry manually later:\n  dsh plugin --profile ${PROFILE} add ${PACKAGE}@${ownVersion}`,
  versionMismatch: (installed, own) =>
    `[dsh-tui] note: the profile is running v${installed} but this launcher is v${own}.\n` +
    `  To update the profile: run /update inside the TUI, or:\n` +
    `  dsh plugin --profile ${PROFILE} add ${PACKAGE}@latest`,
  launchFailed: err => `[dsh-tui] Failed to launch: ${err.message}`,
  legacyEnv: (oldName, newName) => `[dsh-tui] note: env ${oldName} was renamed to ${newName}; the old name no longer takes effect.`,
}
const msg = key => MSG[key]

// The React development build piles every render's performance.measure()
// into an unbounded buffer and OOMs long sessions — match the repo-root
// dsh-tui.cmd and force production.
process.env.NODE_ENV ??= 'production'

const isWin = process.platform === 'win32'
// On Windows the .cmd shim must be launched through a shell (a Node
// ≥18.20.2 security restriction); other platforms spawn the suffix-less
// dsh directly. cmd.exe concatenates arguments with spaces and Node does
// not escape them — every argument on the shell path must go through
// shellQuote first (same as the /update restart path in src/update.ts),
// otherwise arguments that contain spaces or quotes get split.
const shellOpt = isWin ? { shell: true } : {}
const q = args => (isWin ? shellQuote(args) : args)

// --- 1. dsh CLI probe --------------------------------------------------------
const probe = spawnSync('dsh', q(['--version']), { stdio: 'pipe', ...shellOpt })
if (probe.error || probe.status !== 0) {
  console.error(msg('noDsh'))
  process.exit(1)
}

// --- 2. Profile bootstrap and version check ----------------------------------
const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', PROFILE)
// Treat a readable installed package.json as the source of truth (not
// just the directory existing): a leftover directory from a mid-install
// failure must trigger a reinstall instead of launching a broken profile.
let installedVersion
try {
  installedVersion = JSON.parse(
    readFileSync(join(profileDir, 'node_modules', '@deepseek-harness-tui', 'dsh-tui', 'package.json'), 'utf8'),
  ).version
} catch {
  installedVersion = undefined
}
if (installedVersion === undefined) {
  const pnpmProbe = spawnSync('pnpm', q(['--version']), { stdio: 'pipe', ...shellOpt })
  if (pnpmProbe.error || pnpmProbe.status !== 0) {
    console.error(msg('noPnpm'))
    process.exit(1)
  }
  console.log(msg('bootstrapStart'))
  const add = spawnSync('dsh', q(['plugin', '--profile', PROFILE, 'add', `${PACKAGE}@${ownVersion}`]), { stdio: 'inherit', ...shellOpt })
  if (add.status !== 0) {
    console.error(msg('installFailed'))
    process.exit(add.status ?? 1)
  }
} else if (installedVersion !== ownVersion) {
  console.error(MSG.versionMismatch(installedVersion, ownVersion))
}

// --- 3. --resume interception ------------------------------------------------
// Rename transition (issue #120): the global bin and the TUI package
// inside the profile may be on different versions, so env is dual-written
// (both old and new names). File reads prefer the new path and fall back
// to the old one.
const args = []
for (const a of process.argv.slice(2)) {
  if (a === '--resume') {
    let sessionId = ''
    for (const dir of ['.dsh-tui', '.dsh-cc']) {
      try {
        sessionId = readFileSync(join(homedir(), dir, 'resume.txt'), 'utf8').trim()
        if (sessionId) break
      } catch {
        // No historical session to resume — ignore silently and cold-start.
      }
    }
    if (sessionId) {
      process.env.DSH_TUI_RESUME_SESSION = sessionId
      process.env.DSH_CC_RESUME_SESSION = sessionId
    }
  } else {
    args.push(a)
  }
}

// --- 3.5 Legacy env-var warnings (must print before the TUI renders;
// fullscreen stderr writes would break the UI)
for (const oldName of detectLegacyEnv()) {
  console.error(MSG.legacyEnv(oldName, RENAMED_ENV[oldName]))
}

// --- 4. Launch ---------------------------------------------------------------
const child = spawn('dsh', q(['--profile', PROFILE, ...args]), {
  stdio: 'inherit',
  env: process.env,
  ...shellOpt,
})
child.on('error', err => {
  console.error(MSG.launchFailed(err))
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 0)
  }
})
