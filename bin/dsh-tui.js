#!/usr/bin/env node
/**
 * dsh-tui — a two-mode delegating launcher (0.8.8).
 *
 * The same file plays one of two roles depending on where it lives:
 *
 *   Global install copy (the `dsh-tui` command from `npm i -g`) → thin shell:
 *     1. Locate the same package's bin inside $DSH_HOME/profiles/dsh-tui;
 *     2. Readable → forward argv as-is and delegate to it (the full launch
 *        logic always lives in the profile copy, its version advances with
 *        /update, and launcher-lag issues disappear structurally);
 *     3. Not readable (first run) → probe dsh/pnpm, bootstrap with
 *        `dsh plugin --profile dsh-tui add <this package>@<this package's version>`,
 *        then delegate once that succeeds.
 *
 *   Profile-internal copy (delegated to, or run directly from a junction /
 *   source checkout) → the full launch logic (same as 0.8.6 and earlier):
 *     dsh preflight / profile version check / --resume and workspace-target
 *     interception / legacy env-var warnings / `dsh --profile dsh-tui`
 *     launch with exit-code passthrough.
 *
 * Role detection at bootstrap uses realpath: a Windows junction (profile
 * pointing back into the repo) and running from source via `pnpm run dev`
 * both collapse to the same physical directory → the full logic runs, so
 * the launcher never delegates to itself and loops.
 *
 * This file must keep zero lib/ dependencies: the /update launcher
 * migration overwrites only this one file (plus package.json's version
 * number), so it must still work on an old global install where the newer
 * lib helpers don't exist yet. Small utilities like shellQuote are inlined
 * here for that reason.
 *
 * User-facing messages are English. This launcher runs before TUI boot and
 * cannot reuse src/i18n.ts. `DSH_TUI_LANG` / `CC_TUI_LANG` are ignored —
 * both `en` and `zh` print English.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ownDir = dirname(here)
const readJson = p => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return undefined
  }
}
const ownPackage = readJson(join(ownDir, 'package.json'))
const ownVersion = ownPackage?.name === '@deepseek-harness-tui/dsh-tui' ? ownPackage.version : undefined
const PACKAGE = '@deepseek-harness-tui/dsh-tui'
const PROFILE = 'dsh-tui'

// --- inlined small utilities (see file header: zero lib deps is part of the migration contract) ---
// Minimal equivalent of lib/types/utils/shellQuote.js: cmd.exe joins
// arguments with spaces and does not escape them, so any argument
// containing spaces/quotes must be quoted as a whole (with inner quotes
// and backslashes escaped).
const shellQuote = args =>
  args.map(arg => {
    const s = String(arg)
    if (s === '') return '""'
    if (!/[\s"^]/.test(s)) return s
    return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
  })
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

// Inlined semver (parse + strict greater-than): the launcher may run in an
// environment with incomplete dependencies (migration, a half-broken
// install, a test sandbox), so zero external dependencies is the
// self-sufficiency floor here. Mirrors semver's core prerelease-comparison
// rule: prerelease identifiers compare segment by segment (numeric segments
// by value, numeric sorts below alphabetic), fewer segments with an
// identical prefix is older, and no prerelease at all is newest.
const parseVersion = v => {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v).trim())
  return m
    ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] === undefined ? null : m[4].split('.') }
    : null
}
const isVersionNewer = (a, b) => {
  const A = parseVersion(a)
  const B = parseVersion(b)
  if (A === null || B === null) return false
  for (const key of ['major', 'minor', 'patch']) {
    if (A[key] !== B[key]) return A[key] > B[key]
  }
  if (A.pre === null) return B.pre !== null
  if (B.pre === null) return false
  for (let i = 0; i < Math.max(A.pre.length, B.pre.length); i++) {
    const x = A.pre[i]
    const y = B.pre[i]
    if (x === undefined) return false
    if (y === undefined) return true
    if (x === y) continue
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) return Number(x) > Number(y)
    if (xn !== yn) return yn
    return x > y
  }
  return false
}

// --- Messages (launcher runs before TUI boot, so it cannot reuse src/i18n.ts)
// English only. DSH_TUI_LANG / CC_TUI_LANG are not consulted.
const MSG = {
  noDsh: '[dsh-tui] dsh CLI not found. Install the official client first:\n  npm install -g @deepseek-ai/dsh',
  noPnpm: '[dsh-tui] The first-time setup needs pnpm (dsh plugin delegates installs to it):\n  npm install -g pnpm   (or via corepack: corepack enable pnpm)',
  bootstrapStart: `[dsh-tui] First run — initializing the ${PROFILE} profile (${PACKAGE}@${ownVersion})…`,
  bootstrapRetryW: '[dsh-tui] pnpm refused to add to the workspace root (ERR_PNPM_ADDING_TO_ROOT) — retrying with -w…',
  installFailed: `[dsh-tui] Plugin install failed. Retry manually later:\n  dsh plugin --profile ${PROFILE} add -w ${PACKAGE}@${ownVersion}`,
  bootstrapUnreadable: dir =>
    `[dsh-tui] install reported success but the plugin package is still unreadable under:\n` +
    `  ${dir}\n` +
    `  pnpm treats this half-installed profile as already up to date, so every retry\n` +
    `  reports success while boot keeps failing. Recovery:\n` +
    `  rm -rf ${dir} && dsh-tui`,
  launchFailed: err => `[dsh-tui] Failed to launch: ${err.message}`,
  delegateFailed: path =>
    `[dsh-tui] cannot launch the profile copy:\n  ${path}\nReinstall the global launcher:\n  npm install -g ${PACKAGE}@latest`,
  profileExited: code => `[dsh-tui] dsh profile exited with code ${code}. Run it directly for diagnostics:\n  dsh --profile ${PROFILE}`,
  legacyEnv: (oldName, newName) => `[dsh-tui] note: env ${oldName} was renamed to ${newName}; the old name no longer takes effect.`,
}
const msg = key => MSG[key]

// The React development build piles every render's performance.measure()
// into an unbounded buffer and OOMs long sessions — match the repo-root
// dsh-tui.cmd and force production.
process.env.NODE_ENV ??= 'production'

const sameDir = (a, b) => {
  try {
    return realpathSync(resolve(a)) === realpathSync(resolve(b))
  } catch {
    return resolve(a) === resolve(b)
  }
}

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', PROFILE)
const profilePkgDir = join(profileDir, 'node_modules', '@deepseek-harness-tui', 'dsh-tui')
const profileBin = join(profilePkgDir, 'bin', 'dsh-tui.js')
const installedPkgPath = join(profilePkgDir, 'package.json')
const runningInsideProfile = sameDir(ownDir, profilePkgDir)

const forwardExit = child => {
  child.on('error', err => {
    console.error(msg('launchFailed')(err))
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
    } else {
      if (code !== null && code !== 0) console.error(msg('profileExited')(code))
      process.exit(code ?? 0)
    }
  })
}

// First-run bootstrap: probe dsh and pnpm, then pin `dsh plugin add` to the
// same version as this launcher (avoids stale-version drift from a pnpm
// store cache). The -w retry (issue #239) and the "install reported
// success but nothing is actually there" recheck (issue #209) are
// centralized here and shared by both the thin shell and the full logic.
const profileReady = () => {
  try {
    readFileSync(installedPkgPath, 'utf8')
    return true
  } catch {
    return false
  }
}
const bootstrapProfile = () => {
  const probe = spawnSync(...cmd('dsh', ['--version']), { stdio: 'pipe', ...shellOpt })
  if (probe.error || probe.status !== 0) {
    console.error(msg('noDsh'))
    process.exit(1)
  }
  const pnpmProbe = spawnSync(...cmd('pnpm', ['--version']), { stdio: 'pipe', ...shellOpt })
  if (pnpmProbe.error || pnpmProbe.status !== 0) {
    console.error(msg('noPnpm'))
    process.exit(1)
  }
  console.log(msg('bootstrapStart'))
  const runAdd = (extraArgs, capture) => spawnSync(
    ...cmd('dsh', ['plugin', '--profile', PROFILE, 'add', ...extraArgs, `${PACKAGE}@${ownVersion}`]),
    { stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', ...shellOpt },
  )
  let add = runAdd([], true)
  if (add.status !== 0) {
    const captured = `${add.stdout ?? ''}${add.stderr ?? ''}`
    process.stderr.write(captured)
    if (captured.includes('ERR_PNPM_ADDING_TO_ROOT')) {
      console.log(msg('bootstrapRetryW'))
      add = runAdd(['-w'], false)
    }
  } else {
    process.stdout.write(`${add.stdout ?? ''}${add.stderr ?? ''}`)
  }
  if (add.status !== 0) {
    console.error(msg('installFailed'))
    process.exit(add.status ?? 1)
  }
  if (!profileReady()) {
    console.error(msg('bootstrapUnreadable')(profileDir))
    process.exit(1)
  }
}

// ─── Global copy: thin-shell role ──────────────────────────────────────────
// DSH_TUI_NO_DELEGATE=1 is a test/debug escape hatch: forces the full logic
// path (verify-launcher's sandbox drives the full path with it directly;
// also useful when diagnosing the delegation chain in the field).
if (!runningInsideProfile && ownVersion !== undefined && process.env.DSH_TUI_NO_DELEGATE !== '1') {
  if (!profileReady()) bootstrapProfile()
  // Delegate to the profile-internal copy for the rest of the launch logic.
  // The outer generation is communicated via DSH_TUI_LAUNCHER_VERSION (the
  // /update alignment diagnostic relies on this contract too).
  try {
    readFileSync(profileBin, 'utf8')
  } catch {
    console.error(msg('delegateFailed')(profileBin))
    process.exit(1)
  }
  process.env.DSH_TUI_LAUNCHER_VERSION = ownVersion
  const child = spawn(process.execPath, [profileBin, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  })
  forwardExit(child)
} else {
  // ─── Profile-internal copy (or running from source): full launch logic ──
  // dsh CLI preflight (installation guidance when missing, before any
  // profile logic runs).
  {
    const probe = spawnSync(...cmd('dsh', ['--version']), { stdio: 'pipe', ...shellOpt })
    if (probe.error || probe.status !== 0) {
      console.error(msg('noDsh'))
      process.exit(1)
    }
  }
  let installedVersion
  try {
    installedVersion = JSON.parse(readFileSync(installedPkgPath, 'utf8')).version
  } catch {
    installedVersion = undefined
  }
  // A stale/uninitialized profile: bootstrap in place just like the old
  // launcher did (add pins to this package's own version, so the versions
  // naturally align on success), instead of refusing to launch.
  if (installedVersion === undefined) {
    bootstrapProfile()
    try {
      installedVersion = JSON.parse(readFileSync(installedPkgPath, 'utf8')).version
    } catch {
      installedVersion = undefined
    }
  }
  if (installedVersion !== undefined && ownVersion !== undefined && installedVersion !== ownVersion && !runningInsideProfile) {
    const majorMinor = v => v.split('-')[0].split('.').slice(0, 2).map(Number)
    const [installedMajor, installedMinor] = majorMinor(installedVersion)
    const [ownMajor, ownMinor] = majorMinor(ownVersion)
    if (installedMajor < ownMajor || (installedMajor === ownMajor && installedMinor < ownMinor)) {
      console.error(
        `[dsh-tui] cannot start: the profile runs v${installedVersion} but this launcher is v${ownVersion}.\n` +
          `  dsh plugin --profile ${PROFILE} add ${PACKAGE}@${ownVersion}`,
      )
      process.exit(1)
    }
    const installedNewer = installedVersion !== undefined && ownVersion !== undefined && isVersionNewer(installedVersion, ownVersion)
    if (installedNewer) {
      console.error(
        `[dsh-tui] note: the profile is already v${installedVersion}; this launcher copy is v${ownVersion}.\n` +
          `  npm install -g ${PACKAGE}@${installedVersion}`,
      )
    } else {
      // The profile is older but same minor (a patch-level mismatch):
      // allow the launch, and point at `add` to align the profile to the
      // launcher's exact version (@latest could overshoot the alignment
      // point).
      console.error(
        `[dsh-tui] note: the profile is running v${installedVersion} but this launcher is v${ownVersion}.\n` +
          `  dsh plugin --profile ${PROFILE} add ${PACKAGE}@${ownVersion}`,
      )
    }
  }

  // --resume / workspace-target interception (the launcher contract from
  // issue #120/#53).
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
      if (!sessionId) sessionId = readLastResumeTarget()
      if (sessionId) setResumeEnv(sessionId)
    } else if (
      process.env.DSH_TUI_WORKSPACE_TARGET === undefined
      && !a.startsWith('-')
      && (isAbsolute(a) || /^[a-z][a-z0-9+.-]*:\/\//iu.test(a) || existsSync(resolve(a)))
    ) {
      // A workspace target is launcher syntax, not an argument for the
      // profile app. The registry resolves local paths/file URLs and
      // provider URIs.
      process.env.DSH_TUI_WORKSPACE_TARGET = a
    } else {
      args.push(a)
    }
  }

  // Legacy env-var warnings (must print before the TUI renders; writing to
  // stderr under fullscreen would break the UI). Mirrors the RENAMED_ENV
  // table in utils/paths, inlined here to keep zero lib dependencies.
  const RENAMED_ENV = {
    CC_TUI_THEME: 'DSH_TUI_THEME',
    CC_TUI_LANG: 'DSH_TUI_LANG',
    CC_TUI_PERSONA: 'DSH_TUI_PERSONA',
    CC_TUI_PRESET: 'DSH_TUI_PRESET',
    CC_TUI_DISABLE_MOUSE: 'DSH_TUI_DISABLE_MOUSE',
    CC_TUI_DEBUG: 'DSH_TUI_DEBUG',
    CC_TUI_COMPACT_RATIO: 'DSH_TUI_COMPACT_RATIO',
    CC_TUI_COMPACT_RETAIN: 'DSH_TUI_COMPACT_RETAIN',
    DSH_CC_UPDATED_FROM: 'DSH_TUI_UPDATED_FROM',
    DSH_CC_RENDER_LOG: 'DSH_TUI_RENDER_LOG',
    DSH_CC_SESSION_ROOT: 'DSH_TUI_SESSION_ROOT',
    DSH_CC_WORKSPACE: 'DSH_TUI_WORKSPACE',
  }
  for (const oldName of Object.keys(RENAMED_ENV)) {
    if (process.env[oldName] !== undefined) {
      console.error(msg('legacyEnv')(oldName, RENAMED_ENV[oldName]))
    }
  }

  // Launch: in a delegated scenario, this copy's own version is the
  // launcher generation the alignment diagnostics see.
  if (process.env.DSH_TUI_LAUNCHER_VERSION === undefined && ownVersion !== undefined) {
    process.env.DSH_TUI_LAUNCHER_VERSION = ownVersion
  }

  const child = spawn(...cmd('dsh', ['--profile', PROFILE, ...args]), {
    stdio: 'inherit',
    env: process.env,
    ...shellOpt,
  })
  forwardExit(child)
}
