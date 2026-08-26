#!/usr/bin/env node
/**
 * dsh-tui — 双态启动器（delegating launcher，0.9.3）。
 *
 * The same file plays one of two roles depending on where it lives:
 *
 *   Global install copy (the `dsh-tui-en` command from `npm i -g`) → thin shell:
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
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (process.platform === 'win32' && process.env.DSH_TUI_STANDALONE_BINARY) {
  try {
    const oldBinary = `${process.env.DSH_TUI_STANDALONE_BINARY}.old`
    if (existsSync(oldBinary)) rmSync(oldBinary, { force: true })
  } catch {
    // Best effort cleanup.
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const ownDir = dirname(here)

/**
 * Read and parse a JSON file safely.
 *
 * @param {string} p - File path to parse.
 * @returns {any} Parsed JSON content or undefined.
 */
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

// --- 内联小工具（见文件头：零 lib 依赖是迁移契约的一部分）---------------------
// 与 lib/types/utils/shellQuote.js 同语义的最小实现：cmd.exe 以空格拼接参数
// 且不做转义，含空格/引号的参数必须整体加引号（内层引号与反斜杠转义）。
/**
 * Quote an array of arguments for cmd.exe.
 *
 * @param {string[]} args - Argument tokens.
 * @returns {string[]} Quoted argument tokens.
 */
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
  noDsh: {
    en: '[dsh-tui-en] dsh CLI not found. Install the official client first:\n  npm install -g @deepseek-ai/dsh',
    zh: '[dsh-tui-en] 未检测到 dsh CLI。请先安装官方客户端：\n  npm install -g @deepseek-ai/dsh',
  },
  noPnpm: {
    en: '[dsh-tui-en] The first-time setup needs pnpm (dsh plugin delegates installs to it):\n  npm install -g pnpm   (or via corepack: corepack enable pnpm)',
    zh: '[dsh-tui-en] 首次安装需要 pnpm（dsh plugin 会把安装转发给它）：\n  npm install -g pnpm   （或启用 corepack：corepack enable pnpm）',
  },
  bootstrapStart: {
    en: `[dsh-tui-en] First run — initializing the ${PROFILE} profile (${PACKAGE}@${ownVersion})…`,
    zh: `[dsh-tui-en] 首次运行，正在初始化 ${PROFILE} profile（${PACKAGE}@${ownVersion}）…`,
  },
  bootstrapRetryW: {
    en: '[dsh-tui-en] pnpm refused to add to the workspace root (ERR_PNPM_ADDING_TO_ROOT) — retrying with -w…',
    zh: '[dsh-tui-en] pnpm 拒绝写入 workspace 根（ERR_PNPM_ADDING_TO_ROOT）——带 -w 重试…',
  },
  installFailed: {
    en: `[dsh-tui-en] Plugin install failed. Retry manually later:\n  dsh plugin --profile ${PROFILE} add -w ${PACKAGE}@${ownVersion}`,
    zh: `[dsh-tui-en] 插件安装失败。可稍后手工重试：\n  dsh plugin --profile ${PROFILE} add -w ${PACKAGE}@${ownVersion}`,
  },
  bootstrapUnreadable: {
    en: dir =>
      `[dsh-tui-en] install reported success but the plugin package is still unreadable under:\n` +
      `  ${dir}\n` +
      `  pnpm treats this half-installed profile as already up to date, so every retry\n` +
      `  reports success while boot keeps failing. Recovery:\n` +
      `  rm -rf ${dir} && dsh-tui-en`,
    zh: dir =>
      `[dsh-tui-en] 安装报告成功，但插件包仍不可读：\n` +
      `  ${dir}\n` +
      `  pnpm 把半残的 profile 视为已装好，重试永远「成功」而启动照旧崩溃。\n` +
      `  恢复方法：\n` +
      `  rm -rf ${dir} 后重新运行 dsh-tui`,
  },
  launchFailed: {
    en: err => `[dsh-tui-en] Failed to launch: ${err.message}`,
    zh: err => `[dsh-tui-en] 启动失败：${err.message}`,
  },
  delegateFailed: {
    en: path =>
      `[dsh-tui-en] cannot launch the profile copy:\n  ${path}\nReinstall the global launcher:\n  npm install -g --legacy-peer-deps ${PACKAGE}@latest\n(--legacy-peer-deps avoids an npm 12 peer-resolution crash; the launcher is a thin shim, so skipping global peer resolution is safe.)`,
    zh: path =>
      `[dsh-tui-en] 无法启动 profile 内副本：\n  ${path}\n请重装全局启动器：\n  npm install -g --legacy-peer-deps ${PACKAGE}@latest\n（--legacy-peer-deps 可绕过 npm 12 的 peer 解析崩溃；启动器是瘦壳，跳过全局 peer 解析是安全的。）`,
  },
  profileExited: {
    en: code => `[dsh-tui-en] dsh profile exited with code ${code}. Run it directly for diagnostics:\n  dsh --profile ${PROFILE}`,
    zh: code => `[dsh-tui-en] dsh profile 已退出（退出码 ${code}）。可直接运行以下命令查看诊断：\n  dsh --profile ${PROFILE}`,
  },
  legacyEnv: {
    en: (oldName, newName) => `[dsh-tui-en] note: env ${oldName} was renamed to ${newName}; the old name no longer takes effect.`,
    zh: (oldName, newName) => `[dsh-tui-en] 提示：环境变量 ${oldName} 已更名为 ${newName}，旧名不再生效。`,
  },
  notInstalled: {
    en: '(not installed)',
    zh: '（未安装）',
  },
  doctorLabels: {
    en: {
      dshMissing: 'not found — install it first:  npm install -g @deepseek-ai/dsh',
      pnpmMissing: 'not found — needed for install/update:  npm install -g pnpm',
      profileMissing: 'not installed — run `dsh-tui-en` once to bootstrap it',
      aligned: 'aligned',
      profileNewer: v => `profile is newer — align the launcher:  npm install -g ${PACKAGE}@${v}`,
      profileOlder: v => `profile is older — align it:  dsh plugin --profile ${PROFILE} add ${PACKAGE}@${v}`,
      keySet: 'set',
      keyMissing: 'not set — interactive launch reads DEEPSEEK_API_KEY',
      missing: 'missing',
    },
    zh: {
      dshMissing: '未找到——请先安装：  npm install -g @deepseek-ai/dsh',
      pnpmMissing: '未找到——安装/升级需要它：  npm install -g pnpm',
      profileMissing: '未安装——运行一次 `dsh-tui` 即可自举',
      aligned: '已对齐',
      profileNewer: v => `profile 较新——对齐启动器：  npm install -g ${PACKAGE}@${v}`,
      profileOlder: v => `profile 较旧——对齐它：  dsh plugin --profile ${PROFILE} add ${PACKAGE}@${v}`,
      keySet: '已设置',
      keyMissing: '未设置——交互启动读取 DEEPSEEK_API_KEY',
      missing: '缺失',
    },
  },
  updateUnavailable: {
    en:
      `[dsh-tui-en] \`update\` needs the profile's compiled copy, but it is missing or too old to carry the CLI entry.\n` +
      `Update manually instead:\n  dsh plugin --profile ${PROFILE} add ${PACKAGE}@latest`,
    zh:
      `[dsh-tui-en] \`update\` 需要 profile 的编译产物，但它缺失或版本过旧、不含 CLI 入口。\n` +
      `请改用手工升级：\n  dsh plugin --profile ${PROFILE} add ${PACKAGE}@latest`,
  },
  helpText: {
    en:
      `Usage: dsh-tui|dst [command] [options] [path|url]\n\n` +
      `Commands:\n` +
      `  update                 Update the ${PROFILE} profile to the latest release\n` +
      `  doctor                 Pre-flight environment checks (dsh/pnpm/profile/key)\n` +
      `  version                Show launcher and profile versions\n` +
      `  help                   Show this help\n\n` +
      `Options:\n` +
      `  --resume [id]          Resume the last (or the given) session\n` +
      `  -c, --continue         Same as --resume\n` +
      `  <path|url>             Open with the given workspace target\n\n` +
      `Any other argument is forwarded to \`dsh --profile ${PROFILE}\`.`,
    zh:
      `用法：dsh-tui|dst [命令] [选项] [路径|URL]\n\n` +
      `命令：\n` +
      `  update                 将 ${PROFILE} profile 升级到最新版本\n` +
      `  doctor                 启动前环境诊断（dsh/pnpm/profile/密钥）\n` +
      `  version                显示启动器与 profile 版本\n` +
      `  help                   显示本帮助\n\n` +
      `选项：\n` +
      `  --resume [id]          恢复上次（或指定 id 的）会话\n` +
      `  -c, --continue         同 --resume\n` +
      `  <路径|URL>             以指定工作区目标启动\n\n` +
      `其余参数原样转发给 \`dsh --profile ${PROFILE}\`。`,
  },
}
const msg = key => MSG[key].en

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

// ─── 子命令：version / help ──────────────────────────────────────────────────
// 只认第一个参数，且在角色分支之前应答：两种角色都不经过委托与自举——
// `dsh-tui --help` 在没装 dsh、profile 残缺时也必须能出（否则求助命令
// 本身先触发一轮安装）。后续位置的同名字符串不截获，保持既有透传与
// 工作区目标嗅探行为不变。
const subcommand = process.argv[2]
if (subcommand === 'version' || subcommand === '--version' || subcommand === '-v') {
  const role = runningInsideProfile ? 'profile' : 'launcher'
  console.log(`${PACKAGE} ${ownVersion ?? 'unknown'} (${role})`)
  const profileVersion = readJson(installedPkgPath)?.version
  console.log(`profile: ${profileVersion ?? msg('notInstalled')}  ${profilePkgDir}`)
  process.exit(0)
}
if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
  console.log(msg('helpText'))
  process.exit(0)
}
// ─── 子命令：doctor ──────────────────────────────────────────────────────────
// 启动前环境诊断——针对「TUI 起不来」的故障域（装不上、update 后版本不
// 同步、密钥没配），与 TUI 内 /doctor 的会话内诊断互补。零 lib 依赖、
// 不委托、不自举：profile 残缺时它必须还能跑。密钥红线：只报告是否已
// 设置，绝不输出值。仅 dsh 缺失记为硬失败（其余检查全部照常打印后再
// 以退出码 1 收束）。
if (subcommand === 'doctor') {
  const L = msg('doctorLabels')
  let hardFailure = false
  const report = (ok, label, detail) => console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  console.log(`dsh-tui doctor · ${PACKAGE} ${ownVersion ?? 'unknown'}`)
  report(true, 'node', `${process.version} · ${process.platform} ${process.arch}`)
  const probeVersion = command => {
    const probe = spawnSync(...cmd(command, ['--version']), { stdio: 'pipe', encoding: 'utf8', ...shellOpt })
    if (probe.error || probe.status !== 0) return undefined
    // 白名单校验：只回显版本号形状的首行。诊断输出的红线是绝不泄露密钥，
    // 而 PATH 上的 wrapper 理论上可以把任意环境变量 echo 进 --version——
    // 不匹配版本形状的输出一律不转印。
    const line = String(probe.stdout ?? '').trim().split('\n')[0] ?? ''
    return /^v?\d[\w.+-]*$/.test(line) ? line : '(version unreadable)'
  }
  const dshVersion = probeVersion('dsh')
  if (dshVersion === undefined) {
    hardFailure = true
    report(false, 'dsh', L.dshMissing)
  } else {
    report(true, 'dsh', dshVersion)
  }
  const pnpmVersion = probeVersion('pnpm')
  report(pnpmVersion !== undefined, 'pnpm', pnpmVersion ?? L.pnpmMissing)
  const profileVersion = readJson(installedPkgPath)?.version
  if (profileVersion === undefined) {
    report(false, 'profile', `${L.profileMissing}  (${profileDir})`)
  } else {
    report(true, 'profile', `${profileVersion}  (${profileDir})`)
    if (ownVersion !== undefined && !runningInsideProfile) {
      if (profileVersion === ownVersion) {
        report(true, 'launcher ↔ profile', L.aligned)
      } else if (isVersionNewer(profileVersion, ownVersion)) {
        report(false, 'launcher ↔ profile', L.profileNewer(profileVersion))
      } else {
        report(false, 'launcher ↔ profile', L.profileOlder(ownVersion))
      }
    }
  }
  // truthiness 而非 !== undefined：空字符串的 key 同样发不了请求，且 TUI 内
  // /doctor（channel.doctorInfo）按 truthiness 报告——两个 doctor 不许分叉。
  const keySet = Boolean(process.env.DEEPSEEK_API_KEY)
  report(keySet, 'DEEPSEEK_API_KEY', keySet ? L.keySet : L.keyMissing)
  for (const candidate of [join(homedir(), '.dsh-tui', 'cordis.yml'), join(profileDir, 'cordis.patch.yml')]) {
    report(existsSync(candidate), 'config', `${candidate}${existsSync(candidate) ? '' : `  ${L.missing}`}`)
  }
  process.exit(hardFailure ? 1 : 0)
}

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

// ─── 子命令：update ──────────────────────────────────────────────────────────
// 顶层处理、两种角色同一条路径——不放进委托链。委托会把 update 交给
// profile 内的旧 bin：旧副本不认识这个词，只会当参数透传，恰好是「profile
// 落后、最需要升级」的用户永远到不了新入口。这里统一动态 import **profile
// 的**编译产物（不是本副本的——DSH_TUI_NO_DELEGATE 下两者不同包，读本副本
// 会拿全局包版本误判 already-latest/half-updated）；瘦壳零 lib 静态依赖的
// 迁移契约不变。profile 未初始化时先走既有自举（dsh/pnpm 预检在其中）；
// 编译产物缺失或没有 cliUpdate 导出（半更新的旧版）给手工升级指引退出 1。
// 判定先于工作区目标嗅探：cwd 里名为 update 的文件不再被当成路径。
if (subcommand === 'update') {
  if (!profileReady()) bootstrapProfile()
  {
    const probe = spawnSync(...cmd('dsh', ['--version']), { stdio: 'pipe', ...shellOpt })
    if (probe.error || probe.status !== 0) {
      console.error(msg('noDsh'))
      process.exit(1)
    }
  }
  let cliUpdate
  try {
    ;({ cliUpdate } = await import(pathToFileURL(join(profilePkgDir, 'lib', 'types', 'update.js')).href))
  } catch {
    cliUpdate = undefined
  }
  if (typeof cliUpdate !== 'function') {
    console.error(msg('updateUnavailable'))
    process.exit(1)
  }
  process.exit(await cliUpdate(PROFILE))
}

// ─── 全局副本：瘦壳角色 ───────────────────────────────────────────────────────
// DSH_TUI_NO_DELEGATE=1 是测试/调试逃生口：强制走完整逻辑（verify-launcher
// 的沙箱用它直接驱动全量路径；现场排查委托链时同样可用）。
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
        `[dsh-tui-en] cannot start: the profile runs v${installedVersion} but this launcher is v${ownVersion}.\n` +
          `  dsh plugin --profile ${PROFILE} add ${PACKAGE}@${ownVersion}`,
      )
      process.exit(1)
    }
    const installedNewer = installedVersion !== undefined && ownVersion !== undefined && isVersionNewer(installedVersion, ownVersion)
    if (installedNewer) {
      console.error(
        `[dsh-tui-en] note: the profile is already v${installedVersion}; this launcher copy is v${ownVersion}.\n` +
          `  npm install -g --legacy-peer-deps ${PACKAGE}@${installedVersion}\n` +
          `(--legacy-peer-deps avoids an npm 12 peer-resolution crash, see issue #459)`,
      )
    } else {
      // The profile is older but same minor (a patch-level mismatch):
      // allow the launch, and point at `add` to align the profile to the
      // launcher's exact version (@latest could overshoot the alignment
      // point).
      console.error(
        `[dsh-tui-en] note: the profile is running v${installedVersion} but this launcher is v${ownVersion}.\n` +
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
