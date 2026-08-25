# The update system

This document covers version checking (a one-shot background check at
startup), the /update manual-update pipeline, restart and session resume,
and a confirmed defect (the timing of when DSH_CC_UPDATED_FROM is read). The
update system was introduced in commit dde5c86 (PR #66). All line numbers
are relative to the audit baseline b2f4087.

## Startup version check (one-shot, no periodic polling)

```text
src/plugin.ts:308  void checkForTuiUpdate().then(...) runs in the background
  after the first frame renders
  (:305's comment: "Check in the background so registry latency never delays
  the first frame. A failed/offline check is intentionally silent")
  -> src/update.ts:150-153 checkForTuiUpdate -> resolveTuiUpdateTarget
  -> Own version: installedTuiVersion() (src/update.ts:36-53) reads either
     ../../package.json or ../package.json (dual paths for the compiled
     layout / source layout), requiring name to match dsh-cc-tui and a
     valid semver (a foreign manifest is rejected)
  -> Latest version: fetchLatestVersion (src/update.ts:108-127)
     fetch(`${registry}/dsh-cc-tui/latest`, accept: application/json,
     with an AbortController 4s timeout UPDATE_CHECK_TIMEOUT_MS); any
     failure returns undefined — silent when offline/on a network error
  -> Three-way target classification (src/update.ts:134-143):
     update (latest > current) / latest (already current) / unknown
     (offline, or its own version couldn't be read)
  -> On a hit for update: channel.notify(update-available, including
     current/latest, timeoutMs 12000, auto-dismisses after 12 seconds)
     prompting the user to type /update (src/plugin.ts:310-314)
```

registry-resolution priority (src/update.ts:83-94): `NPM_CONFIG_REGISTRY`
(both spellings, including lowercase npm_config_registry) > the `registry=`
line in the user's ~/.npmrc > the npmjs.org default — "mirror users see the
same `latest` their package manager would install".

## The /update manual-update pipeline

Prerequisite: /update **is only available when launched via
`dsh --profile <name>`** — the profile is parsed from argv
(src/update.ts:63-76 resolveDshProfileName, the first --profile token; dsh
doesn't set a profile environment variable); when run from source or a
direct --config launch, onUpdate is undefined
(src/plugin.ts:184-187,271-274).

```text
/update (src/screens/Chat.tsx:647-657):
  onUpdate === undefined -> notify update-unavailable
  channel.working -> notify update-working (the current turn needs to finish first)
  otherwise notify update-starting -> onUpdate()
  -> src/plugin.ts:274-292 onUpdate's preflight resolveTuiUpdateTarget:
     latest -> notify update-already-latest, no restart
     unknown -> notify update-check-failed but continue anyway
     updateRequested = true; instance?.unmount() (the TUI must unmount
     before updating, so pnpm's output doesn't corrupt an already-rendered
     terminal frame)
  -> waitUntilExit().then(handleExit) (src/plugin.ts:330) -> onUserExit
     (src/plugin.ts:194-264): writeResumeTarget(channel.agentId) writes
     resume.txt
  -> prints 'Updating dsh-cc-tui and restarting…' -> disposeRootAndThen
     (cordis ctx.root.fiber.dispose() reclaims the whole tree, with a 5-second
     fallback timer guaranteeing an exit code, src/plugin.ts:497-510)
  -> updateTuiAndRestart(channel.agentId, profile) (src/update.ts:216-236):
     runProcess('dsh.cmd'/'dsh', ['plugin', '--profile', profile, 'update',
       '--latest', 'dsh-cc-tui'], { shell: true }) (shellQuote handles
       quoting on win32; stdio inherit connects directly to the user's
       terminal)
       --latest is the key to crossing a minor version
       (src/update.ts:199-210's comment):
       "`--latest` is required: `pnpm add` writes a caret range into the
       profile manifest, and a plain `pnpm update` stays inside that range"
       — under this repo's minor-per-release cadence, a plain update would
       restart without actually changing anything
     -> On success, restart: spawn(process.execPath, [...process.execArgv,
        ...process.argv.slice(1)]) launches node directly — **bypassing
       cmd.exe** — because the standard install path
       C:\Program Files\nodejs\node.exe contains a space that cmd.exe would
       split apart, preventing the replacement process from starting
       (src/update.ts:228-234); the env carries DSH_CC_RESUME_SESSION (the
       session id) and DSH_CC_UPDATED_FROM
  -> The restarted process's cordis.patch.yml:203 sessionId =
     process.env.DSH_CC_RESUME_SESSION -> resumes the session
  -> New-process startup verification (src/plugin.ts:52-71):
     delete process.env.DSH_CC_UPDATED_FROM (avoids assigning undefined,
     which would turn into the string "undefined" and leak to child
     processes); when the current version isn't strictly newer than the
     marker value, logger.warn + a stderr hint ("the mirror registry may be
     stale — retry later or check the registry config")
  -> The 0.8.3 launcher-alignment bridge (same verification block):
     /update only replaces the package inside the profile — the global
     dsh-tui launcher is a separate install. The launcher (bin/dsh-tui.js,
     >=0.8.3) sets DSH_TUI_LAUNCHER_VERSION before spawning dsh; if that
     marker is missing after a successful update (an older launcher
     <=0.8.2 doesn't set it), it gives a one-time "if you use the global
     dsh-tui, please update it too" hint; if the marker is explicitly older
     than the new profile, it gives the exact
     `npm install -g @deepseek-harness-tui/dsh-tui@<profile-version>`
     command. The marker isn't one-time — it must be inherited across
     subsequent /update restarts, so the outer launcher's staleness can
     still be detected later.
```

Failure path (src/plugin.ts:236-244): when updateCode is non-zero, there's
no restart — it prints 'cc-tui update failed (exit N). Your session is
preserved — resume with:' + resumeCommand (Windows: `dsh-cc --resume <id>`;
POSIX: `DSH_CC_RESUME_SESSION=<id> dsh --profile <name>`,
src/plugin.ts:484-489), then exits the process with restartCode.

How teardown and updating connect (src/plugin.ts:316-323,450-467): a cordis
context teardown (e.g. a recompose during launcher startup) only does
markTeardown + unmount and never enters the user-exit/update sequence;
/update goes through the user-exit funnel path instead.

## Confirmed defects

**DSH_CC_UPDATED_FROM 取值时点错误**（原 src/update.ts:232）——**已修复**：
现代码在 `runProcess(update)` 之前捕获 `updatedFrom`（updateTuiAndRestart
开头，注释引用 issue #307），重启 env 复用该捕获值；verify-update.mjs
的 `stamp:` 两项断言锁定该顺序。本文行号仍以审计基线 b2f4087 为准。

## 2026-08-24 修复（issues #479/#483）

- **#479（Linux 必现 ERR_PNPM_EEXIST）**：pnpm `importPackage` 的确定性
  暂存目录名（`_tmp_<pid>_<threadId>`）使同一次 update 内第二次 swap
  撞名，Linux overlayfs 报 EEXIST——必现、非瞬时，普通重试永远失败。
  修复分两层：`isEexistTmpRenameFailure()` 识别该签名（与 #225 的
  ENOENT/EPERM/EBUSY 瞬时族分开）；`removeStalePackageInstall()` 清除
  profile 内陈旧包目录（`$DSH_HOME ?? ~/.dsh`/profiles/<name>/…，
  junction/symlink 只摘链接不穿越目标树）与同级 `dsh-tui_tmp_<pid>_<tid>`
  残留暂存目录后重跑——issue 实测验证的恢复路径。#225 瞬时族直接重试
  失败后同样升级到该恢复。
- **#483-1（更新重启后键盘失灵）**：/update 重启尾部从裸
  `runProcess(inherit)` 换为复用泛化后的 `restartTui(sessionId,
  { kind: 'update' })`——获得 /restart 同款加固：等待替代进程自然退出、
  stdin watchdog 周期性 re-assert detach、stderr 捕获与快速死亡同步
  报告、restart.log 诊断（事件前缀 `update-restart:`；kind 'update' 不
  设 DSH_TUI_RESTART_CHILD 标记）。
- **#483-2（启动器同步提示命令在 npm 12 崩溃，#459）**：
  `update-launcher-align-unknown` / `update-launcher-outdated` 的手动
  命令加 `--legacy-peer-deps`（全局启动器是瘦壳，跳过全局 peer 解析
  安全）。

## Regression verification

`scripts/verify-update.mjs`：57 项 check，对编译产物 lib/types/update.js 做
纯函数断言（真实编译 lib、无网络、无子进程；:27-29），任一失败非零退出
（:206-210），挂 CI（.github/workflows/ci.yml:43-45）。覆盖：installedTuiVersion 双布局+外来
manifest 拒绝（4）、registry 解析 env 两种拼写/npmrc/默认（4）、semver 严格
大于（5）、resolveDshProfileName 五种形态（5）、shellQuote 三种（3）、源码
文本断言（4：pnpm --latest 存在、P1 dsh.cmd spawn 请求 shell、P1 node 重启
spawn 无 shell——空间安全执行路径）。

## Conflicts

| Item | Both sides |
| --- | --- |
| The update-unavailable fallback hint is missing --latest | `src/i18n.ts:173`'s hint gives 'dsh plugin --profile <name> update dsh-cc-tui' (no --latest); src/update.ts:204-207's comment explicitly states a plain update gets stuck inside the caret range and a cross-minor update requires --latest — that hint effectively points the user at a command that will spin without effect; getting-started.md:100's manual command uses `add dsh-cc-tui@latest`, which is the one that actually matches the --latest intent |
| Docs miss the lowercase spelling | docs/interaction.md:152 only mentions 'NPM_CONFIG_REGISTRY or ~/.npmrc'; the code (src/update.ts:84) and verify-update.mjs:112-117 both also support the lowercase npm_config_registry |

## Unverified items

- The exact details of session resume after a restart: the restarted
  process replays the launcher arguments as-is via process.argv.slice(1);
  how the dsh launcher re-parses --profile and recomposes the cordis tree
  is an external implementation detail.
- installedTuiVersion's true runtime behavior under a source-checkout
  layout (launched via scripts/run.ts through tsx) (verify-update.mjs
  simulates that layout using a compiled module copied into scratch space;
  the real tsx runtime was not directly verified).

Related documents: [lifecycle.md](lifecycle.md) (the exit funnel and
teardown), [session-context.md](session-context.md) (the resume contract),
[model-route.md](model-route.md) (route resolution after a restart),
[unknowns.md](unknowns.md).
