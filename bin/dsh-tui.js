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
 *      package, handle it by direction (issue #183): profile newer (forward
 *      skew) prints a one-line hint and keeps launching (run /update inside
 *      the TUI, or re-add); profile older (reverse skew) refuses to launch
 *      and prints the alignment command instead — in that direction the dsh
 *      CLI applies the launcher's bundle patch to the profile's older
 *      package, which is guaranteed to crash with a module-resolution error;
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
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
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
  // Reverse skew (issue #183): the dsh CLI reads the bundle patch from the
  // FIRST copy found from its own install anchor — this globally installed
  // launcher — while the plugin modules load from the profile's copy. A
  // launcher minor NEWER than the profile means the patch may reference
  // subpath exports the profile's older package does not have, and boot
  // crashes opaquely (ERR_PACKAGE_PATH_NOT_EXPORTED) before any TUI code
  // runs. Fail loud with the fix instead. (Forward skew degrades to a
  // working local-workspace fallback since 0.7.2 — soft note below.)
  profileOlderThanLauncher: (installed, own) =>
    `[dsh-tui] cannot start: the profile runs v${installed} but this launcher is v${own}.\n` +
    `  The launcher's bundle patch would be applied to the profile's older package,\n` +
    `  which does not export everything the patch references — boot would crash.\n` +
    `  Align the profile with the launcher:\n` +
    `  dsh plugin --profile ${PROFILE} add ${PACKAGE}@${own}\n` +
    `  (or update everything to the latest release: dsh plugin --profile ${PROFILE} add ${PACKAGE}@latest)`,
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
// DEP0190 (issue #148): Node ≥22 deprecates `shell:true` combined with a
// non-empty argument array — the check is syntactic, so passing already
// shell-quoted args still warns, and a future major version may upgrade it
// to a runtime error. Fold the escaped args into the command string instead
// (shell:true + an empty argument array doesn't trigger it); the non-Windows
// path keeps passing the array directly.
const cmd = (command, args) =>
  isWin ? [`${command} ${shellQuote(args).join(' ')}`, []] : [command, args]

// --- 1. dsh CLI probe --------------------------------------------------------
const probe = spawnSync(...cmd('dsh', ['--version']), { stdio: 'pipe', ...shellOpt })
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
  const pnpmProbe = spawnSync(...cmd('pnpm', ['--version']), { stdio: 'pipe', ...shellOpt })
  if (pnpmProbe.error || pnpmProbe.status !== 0) {
    console.error(msg('noPnpm'))
    process.exit(1)
  }
  console.log(msg('bootstrapStart'))
  const add = spawnSync(...cmd('dsh', ['plugin', '--profile', PROFILE, 'add', `${PACKAGE}@${ownVersion}`]), { stdio: 'inherit', ...shellOpt })
  if (add.status !== 0) {
    console.error(msg('installFailed'))
    process.exit(add.status ?? 1)
  }
} else if (installedVersion !== ownVersion) {
  // Reverse skew is fatal (see MSG.profileOlderThanLauncher): compare
  // major/minor only — patch-level differences never move the patch surface.
  const majorMinor = v => v.split('-')[0].split('.').slice(0, 2).map(Number)
  const [installedMajor, installedMinor] = majorMinor(installedVersion)
  const [ownMajor, ownMinor] = majorMinor(ownVersion)
  if (installedMajor < ownMajor || (installedMajor === ownMajor && installedMinor < ownMinor)) {
    console.error(MSG.profileOlderThanLauncher(installedVersion, ownVersion))
    process.exit(1)
  }
  console.error(MSG.versionMismatch(installedVersion, ownVersion))
}

// --- 3. --resume interception ------------------------------------------------
// Rename transition (issue #120): the global bin and the TUI package
// inside the profile may be on different versions, so env is dual-written
// (both old and new names). File reads prefer the new path and fall back
// to the old one.
// Supported forms (issue #53):
//   --resume <id> / --resume=<id>   resume a specific session
//   --resume / -c / --continue      resume the most recent session (resume.txt)
// Every other positional argument is forwarded as-is to the dsh CLI, read
// by the plugin via ctx.cmdlineArgs (initial prompt).
const setResumeEnv = sessionId => {
  process.env.DSH_TUI_RESUME_SESSION = sessionId
  process.env.DSH_CC_RESUME_SESSION = sessionId
}
const readLastResumeTarget = () => {
  for (const dir of ['.dsh-tui', '.dsh-cc']) {
    try {
      const sessionId = readFileSync(join(homedir(), dir, 'resume.txt'), 'utf8').trim()
      if (sessionId) return sessionId
    } catch {
      // No historical session to resume — ignore silently and cold-start.
    }
  }
  return ''
}
const args = []
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--resume' || a === '-c' || a === '--continue' || a.startsWith('--resume=')) {
    let sessionId = ''
    if (a.startsWith('--resume=')) {
      sessionId = a.slice('--resume='.length).trim()
    } else if (a === '--resume' && argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
      sessionId = argv[++i].trim()
    }
    // The bare forms (including -c/--continue) fall back to resume.txt.
    if (!sessionId) sessionId = readLastResumeTarget()
    if (sessionId) setResumeEnv(sessionId)
  } else if (
    process.env.DSH_TUI_WORKSPACE_TARGET === undefined
    && !a.startsWith('-')
    && (isAbsolute(a) || /^[a-z][a-z0-9+.-]*:\/\//iu.test(a) || existsSync(resolve(a)))
  ) {
    // A workspace target is launcher syntax, not an argument for the profile
    // app. The registry resolves local paths/file URLs and provider URIs.
    process.env.DSH_TUI_WORKSPACE_TARGET = a
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
const child = spawn(...cmd('dsh', ['--profile', PROFILE, ...args]), {
  stdio: 'inherit',
  env: process.env,
  ...shellOpt,
})
child.on('error', err => {
  console.error(msg('launchFailed')(err))
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 0)
  }
})
