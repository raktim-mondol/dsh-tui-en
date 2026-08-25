# Contributing

[Documentation index](README.md)

Thanks for considering contributing to dsh-TUI! This guide is the shared
development contract for humans and coding agents working on `@deepseek-harness-tui/dsh-tui`.

## How To Contribute

- **报告 bug**：用 bug 表单提交 issue，填写版本、终端环境与最短复现步骤。
- **提功能建议**：发到 [Discussions Ideas](https://github.com/ccch1mneyyy/dsh-TUI/discussions/new?category=ideas)。
  Issues 不接受功能请求。维护者认可后会开一个 issue 跟踪实现，实现由该 issue
  的 assignee 负责。**拿到认可之前不要开始写代码**——被否的提案里已经有 OAuth、
  `/cost`、通知、插件 API、remote runtime 几套写完整才被关掉的实现。
  发出后 14 天没有维护者回应，可以直接提 PR，会被打上 `unreviewed-proposal`
  标签，按未经审阅处理。
- **提交 PR**：base 指向 `main`。保持改动聚焦——一个 PR 只做一个逻辑改动，
  标题用中文或中英对照，描述写清动机、改动点与验证方式。
- **请求 review 前先跑验证矩阵**：CI 运行的就是下面这些命令。
- 新功能应附带或扩展一个聚焦的回归脚本。

### 功能提案流程的生效时间

该流程只对 2026-08-24 起新建的 PR 生效。在此之前开着的 PR 按旧规则处理，
不需要补 Discussion 或跟踪 issue。

## 范围（Scope）


## Scope

This file applies to the entire repository. It is the shared development
contract for humans and coding agents working on `@deepseek-harness-tui/dsh-tui`.

`@deepseek-harness-tui/dsh-tui` is a single-package, ESM-only TypeScript project. It provides a
React terminal UI front door for DeepSeek Harness through Cordis. The package
owns the TUI, its local command surface, packaged skills, and a ported Ink/Yoga
renderer. DeepSeek Harness owns the agent, session, model, tool, persistence,
and policy domains that the TUI consumes.

- `src/index.ts`：公共 Cordis 插件入口、配置 Schema，与对运行时插件的惰性移交。
- `src/dsh-adapter/plugin.ts`：TTY 校验、服务注册、Agent 创建/恢复、React 树挂载，以及
  终端/进程的收尾清理。
- `src/dsh-adapter/channel.ts`：事件到视图的投影 + 非 React 的动作面。把 DSH 会话事件
  翻译成 transcript 行，实现 submit、steer、rewind、resume、模型/preset 切换、
  本地报告及相关状态迁移。
- `src/screens/Chat.tsx`：顶层交互协调器。负责模态优先级、全局键盘、滚动/
  搜索/选区状态、slash 命令分发与聊天屏组装。
- `src/screens/StatusLine.tsx` 与 `src/screens/StatusMetrics.ts`：底部状态栏
  呈现与指标推导。
- `src/components/`：功能组件。`components/design-system/` 是主题感知原语；
  `components/messages/` 是 transcript 行；`components/questions/` 是
  `ask_user_question` 的 UI。
- `src/ui.ts`：本地渲染器、主题化 `Box`/`Text`、hooks 与公共 TUI 原语的
  首选门面。
- `src/ink/`：移植的低层 Ink 渲染器与终端实现。**敏感基础设施**：改动要聚焦，
  并附渲染器专用回归覆盖。
- `src/native-ts/yoga-layout/`：渲染器使用的移植布局引擎。
- `src/cc/`：为 Claude Code 风格 UI 适配的终端格式化与呈现辅助。
- `src/*Prefs.ts`、`src/customTheme.ts`、`src/sessionHistory.ts`：持久化的
  用户偏好与 `~/.dsh-tui` 下的本地会话元数据。
- `skills/*/SKILL.md`：随 npm 包分发的技能，由 `src/dsh-adapter/packaged-skills.ts` 注册。
- `cordis.patch.yml`：profile 安装时使用的包级 bundle 覆盖层。行的顺序、行 ID、
  被禁用的 host 行、insert/override 语义都很关键。
- `cordis.yml`：直接 Cordis/DSH 启动的完整裸组合示例。
- `scripts/`：无头回归、复现环境、探针与诊断。运行前先读脚本头部说明。
- `lib/`：由 `src/` 生成、忽略入库并随 npm 分发的 JavaScript、声明与声明映射。
  `./invariant` 也直接使用 `lib/types/dsh-adapter/invariant.js` 的编译结果。
- `README.md` 与 `README_EN.md`：中英文用户文档。行为、配置、快捷键与限制
  必须两版同步。

## Repository Map

- `src/index.ts`: public Cordis plugin entry point, configuration schema, and
  lazy handoff to the runtime plugin.
- `src/plugin.ts`: TTY validation, service registration, agent creation/resume,
  React tree mounting, and terminal/process teardown.
- `src/channel.ts`: event-to-view projection and the non-React action surface.
  It translates DSH session events into transcript rows and implements submit,
  steering, rewind, resume, model/preset switching, local reports, and related
  state transitions.
- `src/screens/Chat.tsx`: top-level interaction coordinator. It owns modal
  precedence, global keyboard handling, scroll/search/selection state, slash
  command dispatch, and composition of the chat screen.
- `src/screens/StatusLine.tsx` and `src/screens/StatusMetrics.ts`: terminal
  status presentation and metric derivation.
- `src/components/`: feature components. `components/design-system/` contains
  theme-aware primitives; `components/messages/` contains transcript rows;
  `components/questions/` contains the `ask_user_question` UI.
- `src/ui.ts`: preferred facade for the local renderer, themed `Box`/`Text`,
  hooks, and public TUI primitives.
- `src/ink/`: ported, low-level Ink renderer and terminal implementation.
  Treat it as sensitive infrastructure: keep changes focused and accompany
  them with renderer-specific regression coverage.
- `src/native-ts/yoga-layout/`: ported layout engine used by the renderer.
- `src/cc/`: terminal formatting and presentation helpers adapted for the
  Claude Code-style UI.
- `src/*Prefs.ts`, `src/customTheme.ts`, and `src/sessionHistory.ts`: persisted
  user preferences and local session metadata under `~/.dsh-tui`.
- `skills/*/SKILL.md`: skills shipped in the npm package and registered by
  `src/packaged-skills.ts`.
- `cordis.patch.yml`: package bundle overlay used by profile installation.
  Ordering, row IDs, disabled host rows, and insert/override semantics matter.
- `cordis.yml`: full bare-composition example for direct Cordis/DSH startup.
- `scripts/`: headless regressions, reproduction harnesses, probes, and
  diagnostics. Read each script's header before running it.
- `lib/`: ignored JavaScript, declarations, and declaration maps generated from
  `src/` and shipped to npm. `./invariant` uses the compiled
  `lib/types/dsh-adapter/invariant.js` entry as well.
- `README.md` and `docs/`: English user documentation. Keep behavior,
  configuration, shortcuts, and limitations synchronized across the README
  and the guides under `docs/`.

## Runtime Shape

The central runtime path is:

```text
Cordis config
  -> src/index.ts
  -> src/dsh-adapter/plugin.ts
  -> DSH agent/session services
  -> src/dsh-adapter/channel.ts (session events -> Channel snapshot)
  -> src/screens/Chat.tsx
  -> src/components/*
  -> src/ui.ts
  -> src/ink/* + Yoga layout
  -> terminal ANSI output
```

Keep ownership in the layer where it belongs:

- Agent/session/tool facts come from DSH services and durable session events.
- Projection and TUI actions belong in `channel.ts`, not in presentation
  components.
- Interaction modes and key precedence belong in `Chat.tsx` or the focused
  modal/input component.
- Reusable visual behavior belongs in `components/` and theme-aware primitives.
- Terminal protocol, layout, hit-testing, selection, and frame-diff behavior
  belong in `ink/`.

Do not reimplement a DSH domain service in the TUI merely to make a screen
easier to build. Adapt the service through the channel or an existing registry
seam.

## Toolchain

- Supported Node versions are `^22.19 || >=24`; CI uses Node 24.
- CI and publishing use pnpm 11. Use pnpm as the development package manager.
- Install a clean checkout with:

  ```sh
  pnpm install --frozen-lockfile
  ```

- `pnpm-lock.yaml` is the single lockfile. npm consumers do not read a
  dependency's lockfile, so `package-lock.json` has been removed (follow-up of
  #173).
- When intentionally changing dependencies, update `pnpm-lock.yaml` with
  `pnpm add`, inspect the full lockfile diff, and avoid unrelated upgrades.
- Every `@deepseek-ai/*` framework package this package references at runtime
  or from its published types (mirroring `UPSTREAM_BLESSED_PACKAGES`, including
  `@deepseek-ai/schemastery`) is both a peer and a dev dependency: framework
  packages are host-provided and resolve at runtime to the host's own instance
  through the `$DSH_HOME/profiles/node_modules` fallback tree (see #198 —
  declaring them as runtime dependencies lands real copies inside the profile
  and splits module identity from the host). The dev declarations exist only
  so the package can type-check locally. Add new references of this kind to
  both sections at matching ranges (the verify:manifest-deps gate enforces
  it). Framework packages used only by tests/scripts (e.g. dsh-settings,
  dsh-tools, dsh-session-persistence-*) stay dev-only — do NOT declare peers
  for them. Non-host packages such as `dsh-working-activity` stay runtime
  dependencies. Historical exception, now resolved: `dsh-working-activity@0.2.4`
  and earlier pulled a real copy of `@deepseek-ai/schemastery` (plus cosmokit)
  into the profile via its runtime dependency, shadowing the fallback tree;
  0.2.5 peer-ified it (working-activity#2), so profiles no longer carry any
  framework copies. Keep the dependency range at `^0.2.6` or above (0.2.6 also
  fixes the web-side WorkingLine absent-field guard on unpatched hosts,
  working-activity#5).
- Do not expose, persist, or print credentials. Interactive startup reads
  `DEEPSEEK_API_KEY`; diagnostics may report whether it is set but must not
  reveal the complete value.

## Build And Generated Files

The normal build and type-check gate is:

```sh
pnpm build
```

This removes the complete `lib/` directory, runs `tsc -p tsconfig.json` to emit
`src/` into `lib/types/`, and then checks the adapter boundary, upstream
contract, and patch surface. The `prepare` lifecycle serves **source-checkout
bootstrapping only** (it fails fast when the vendored submodules are absent —
see scripts/prepare-guard.mjs); Git URL dependency installs have been triply
blocked since vendoring (#308: workspace deps / submodules / pnpm ≥11's
prepare allowlist) and are unsupported — install the registry package. Local
and CI workflows use explicit commands instead of depending on whether pnpm
implicitly runs the root lifecycle.

Rules for generated output:

- Edit `src/`, never `lib/`, to implement behavior.
- After any source change, run `pnpm build`, but do not commit generated files
  from `lib/`.
- Clean compilation removes the complete `lib/` first, so renamed or deleted
  source modules cannot leave stale output behind.
- Run `pnpm verify:package` to ensure every `main`, `types`, `bin`, and `exports`
  target is present in the npm tarball and to smoke-import the main and
  invariant entries.
- Documentation-only, workflow-only, and YAML-only changes do not require a
  rebuild unless they also alter TypeScript inputs.
- Git URL installation with `--ignore-scripts` skips `prepare` and is therefore
  unsupported. Registry packages already contain compiled output and do not
  depend on lifecycle scripts running on the consumer's machine.

`scripts/build.sh` is an alternate builder for a local DeepSeek Harness source
checkout. It locates a DSH checkout and rewires dependencies to that checkout.
It is not the default build command for this standalone repository.

## Verification

There is no root `test` or `lint` script. Do not claim that either ran. The
TypeScript build is the universal static gate, followed by focused executable
regressions.

CI runs these commands after installation:

```sh
pnpm compile                               # generate a clean runtime
test -f lib/types/index.js
pnpm verify:build                          # build gates without recompiling
pnpm verify:package                        # npm tarball and entry smoke test
node --import tsx/esm scripts/repro-askpanel.tsx
node --import tsx/esm scripts/verify-askpanel-layout.tsx
node --import tsx/esm scripts/repro-toolcards.tsx
```

Run all three CI regressions for changes to shared rendering, `Chat`, prompt or
question layout, tool cards, theme primitives, or the Ink core. For a narrow
change, also run the closest focused script:

| Change area | Focused verification |
| --- | --- |
| General headless screen composition | `pnpm smoke` |
| Channel submit/steer/pending behavior | `node scripts/verify-submit.mjs` |
| Prompt queue behavior | `node scripts/verify-queue.mjs` |
| Goal/todo projection and rendering | `node scripts/verify-channel-goal-todo.mjs` and `node scripts/verify-goal-todo.mjs` |
| Compaction and folded transcript rows | `node scripts/verify-compact.mjs` |
| Theme loading and persistence | `node --import tsx/esm scripts/verify-themes.mjs` |
| Scrolling/sticky-bottom behavior | `node scripts/verify-scroll.mjs`, `node scripts/verify-resticky.mjs`, and the matching `repro-*` harness |
| Fullscreen copy-on-select | `node scripts/verify-copy-on-select.mjs` |

Most focused scripts invoked with plain `node` import `lib/types/`; run
`pnpm build` first. Scripts that import TypeScript sources declare the
`node --import tsx/esm <script>` form in their header. Do not infer the input
layer from the file extension: `verify-themes.mjs`, for example, imports
`src/` through `tsx`.

Some scripts are forensic or interactive tools, not bounded tests. In
particular, heap/leak scripts, PTY probes, replay capture, performance probes,
and `scripts/run.ts` can require a specific OS, terminal, native dependency,
DSH checkout, or long-running process. Read the header and prerequisites; do
not run every file in `scripts/` as a blanket suite.

For terminal-visible changes, headless assertions are necessary but not always
sufficient. When the environment is available, manually exercise the affected
flow in both inline and fullscreen modes and at a narrow terminal width. Check
startup, resize, scrolling, input, cancellation, and clean exit. Windows
ConPTY, tmux, OSC clipboard behavior, and synchronized output have distinct
paths, so use the matching probe when changing one of them.

`pnpm tui` invokes `scripts/run.ts`, which assumes the package lives inside a
DeepSeek Harness monorepo layout with `apps/cli` and `packages/*`. It is not a
portable standalone smoke command. For an end-user integration check, install
the plugin into a DSH profile and run `dsh --profile dsh-tui` in a real TTY with
the required credentials.

## TypeScript And Style

- The package is ESM. Relative imports in TypeScript use `.js` specifiers,
  for example `import { Chat } from './screens/Chat.js'`. Preserve this rule.
- In repository-authored TypeScript, follow the prevailing style: two-space
  indentation, single quotes, no semicolons, and trailing commas in multiline
  constructs. The ported Ink files may retain their upstream tabs or quoting;
  do not mass-format them.
- Prefer `import type` for type-only dependencies.
- Do not introduce `any` merely because `tsconfig.json` relaxes
  `noImplicitAny`. Those relaxations exist to compile the ported Ink core and
  must not become the quality bar for new application code. Use `unknown` and
  narrow it, or define a small structural interface at an external seam.
- Preserve readonly data where the surrounding API uses it. Keep state
  mutations inside the channel/store implementation rather than mutating
  values from components.
- Keep exported APIs documented with concise JSDoc. Explain contracts and
  non-obvious invariants, not line-by-line mechanics.
- Avoid one-use abstractions and unrelated refactors. Inline a trivial helper
  when it has one call site and does not clarify a real invariant.
- Preserve initialization ordering around environment-sensitive imports.
  `FORCE_COLOR`, `NODE_ENV`, and terminal capability flags are often read at
  module evaluation time; moving an import above their setup can change
  behavior without a type error.

## Architectural Invariants

### Cordis Lifecycle And Configuration

- 保持 `src/index.ts` 是小的公共插件契约、`src/dsh-adapter/plugin.ts` 是运行时实现。
  除非任务有意改插件加载契约，否则保留惰性移交。
- 资源通过 Cordis 注册，用 `ctx.effect` 或既有单一退出漏斗清理。渲染失败必须
  响亮且非零退出；正常退出必须在进程退出前恢复终端状态。
- `cordis.patch.yml` 叠加在 `dsh-base` 上。不要重复 base 已挂载的服务行。
  区分 ID 覆盖与 `insert`，一个服务依赖另一个时保持顺序。
- profile 覆盖会替换整个 `config` 块。文档展示覆盖时，包含替换后必须存活的
  每个键。
- 新增或重命名插件选项时，同步更新 `src/index.ts` 的 `Config` 接口与 Schema、
  运行时消费、`cordis.patch.yml` 与 `cordis.yml` 的相应行，以及双 README。

### Session And Channel State

- The durable DSH session event log is the transcript source of truth. Rows are
  replayed/projected from events; do not insert optimistic assistant or tool
  facts that can diverge from persistence.
- Preserve event ordering, sequence anchors, and call-ID matching. Rewind,
  resume, folding, tool result association, and exports depend on them.
- Every observable channel mutation must use the appropriate synchronous or
  frame-coalesced emitter so `version` advances and subscribers are notified.
- Keep long-session memory bounded. Do not remove transcript folding, replay
  coalescing, virtualization, or cache limits without a measured replacement.
- Agent changes such as resume, rewind, model switch, and preset switch must
  reset all session-scoped projections together. Audit rows, goals, todos,
  titles, pending messages, metrics, and loaded context for stale state.
- Resolve agent/model/tool/preset capabilities through the mounted DSH
  services and registries. Do not guess external API shapes; inspect the
  installed package types when changing an integration.

### Interaction And Commands

- Keyboard precedence is behavior, not incidental control flow. A focused
  questionnaire or modal consumes its keys before global handlers; mouse text
  selection consumes Escape before rewind/clear behavior; the prompt owns text
  editing only when no overlay is active.
- Do not hardcode a new shortcut in one component and stop there. Update the
  relevant help UI and both README shortcut tables, and add or extend a
  regression for conflicts with existing modes.
- Local slash commands are declared in `src/commands.ts` and dispatched in
  `Chat.tsx`; registry commands are merged at runtime. When adding a command,
  update declaration, dispatch, help/documentation, the i18n description
  (`cmd-desc-<name>` in `src/i18n.ts`, zh only — en falls back to the
  declaration), and any packaged skill mapping together.
- Skill command spelling is not always the directory spelling. For example,
  the local `/pr_comments` command activates the packaged `pr-comments` skill.
  Preserve explicit mappings and host naming constraints.
- Keep `ask_user_question` serialized through `QuestionStore`; concurrent
  questions are intentionally presented FIFO and summarized after completion.

### Terminal Rendering

- Prefer themed primitives and hooks exported by `src/ui.ts`. Reach into
  `src/ink/` only for behavior that the facade intentionally does not expose.
- Terminal width is display-cell width, not JavaScript string length. Account
  for ANSI escapes, combining characters, emoji, and East Asian wide glyphs;
  use the repository's width, slicing, wrapping, and ANSI helpers.
- Keep frame output buffered and normal runs quiet. Do not add `console.log` or
  stdout diagnostics while the TUI is active. Use an opt-in stderr/debug path
  such as `DSH_TUI_DEBUG`, or the existing `DSH_TUI_RENDER_LOG` frame capture.
- Preserve raw-mode, cursor, alternate-screen, synchronized-output, mouse,
  focus, and terminal-query cleanup on success, error, interrupt, and teardown.
- Avoid render-time unbounded collections or per-token/per-frame allocations.
  Streaming sessions are long lived, and this repository has explicit
  regressions for prior OOM and scroll-performance failures.
- Layout changes must not allow transcript content to displace the input and
  status line. Exercise resize storms, long unbroken content, streaming rows,
  scrolled-up state, and sticky-bottom restoration when those paths change.
- Keep platform detection narrow. Windows Terminal/ConPTY, WSL, tmux, VS Code,
  and terminals with or without truecolor/DEC 2026 support follow different
  protocol paths.

### Preferences, Themes, And Files

- Follow the existing precedence for configurable preferences: explicit
  deployment config or environment override, then persisted user choice, then
  detected/default value. Document any change to that order.
- Persist user data beneath the existing `~/.dsh-tui` locations. Validate and
  safely parse external JSON; malformed optional state should warn or fall
  back rather than crash the TUI.
- Treat theme names and file contents as untrusted input. Preserve path
  containment checks and all-or-nothing validation of malformed theme files.
- Keep theme additions complete across the `Theme` contract and every built-in
  palette. Use semantic theme keys in components instead of isolated literal
  colors.

## Cross-File Change Checklist

| If you change | Keep these in sync |
| --- | --- |
| 插件配置或环境行为 | `src/index.ts`、运行时消费、`cordis.patch.yml`、`cordis.yml`、`README.md`、`README_EN.md` |
| Slash 命令或快捷键 | `src/commands.ts`、`src/screens/Chat.tsx`、帮助/输入组件、双 README、相关技能映射/测试 |
| 主题契约或持久化主题行为 | `src/theme.ts`、所有色板、主题 provider/picker、自定义主题解析器、主题验证、双 README |
| 会话/channel 行为 | `src/dsh-adapter/channel.ts`、受影响的 UI 投影、编译产物、聚焦 channel/回放回归 |
| 渲染器/布局行为 | `src/ink/` 或 Yoga 源、编译产物、CI 回归、聚焦滚动/resize/PTY 探针 |
| 打包技能 | `skills/<name>/SKILL.md`、`src/dsh-adapter/packaged-skills.ts` 假设、暴露为 slash 命令时的提示/映射 |
| 用户可见的文档化行为 | 中英文 README，外加适用的配置注释/帮助文本 |
| 包版本或依赖 | `package.json`、`pnpm-lock.yaml`、适用时的生成/发布产物；不要顺手搅动旧 npm 锁文件 |

## Git And Release Safety

- 工作树可能含有他人的改动。编辑前检查 `git status` 与相关 diff，保留无关
  改动，绝不丢弃不是你创建的工作。
- 不要运行破坏性清理命令（`git reset --hard`、`git checkout .`、
  `git clean -fd`）。不要用 `git stash` 隐藏他人会话的工作。
- 只暂存显式路径，绝不在共享工作树用 `git add .` 或 `git add -A`。
- 未经用户要求，不 commit、不打 tag、不 push、不发布、不建 Release。
- 发布由 tag 驱动：`.github/workflows/publish.yml` 要求 `v*` tag 与
  `package.json` 版本完全一致，随后构建、跑聚焦回归并发布 npm。版本变更与
  tag 是发布操作，不是日常清理。
- Release note 带贡献者署名：建 GitHub Release 用
  `gh release create vX.Y.Z --notes-file notes.md --generate-notes`——手写摘要
  在前，GitHub 在后面自动追加 What's Changed（PR 标题 + 作者 + 链接）、
  New Contributors 与 Full Changelog；`.github/release.yml` 从自动清单里排除
  bot。手写摘要中来自外部贡献者的条目在末尾标 `（#PR号 by @用户名）`，维护者
  自己的条目不标；裸写 `#123` 与 `@user`，GitHub 渲染成链接。
- 移交代码改动前检查 `git diff --check`、源码 diff、生成 diff 与 `git status`，
  并如实报告跑了哪些验证、哪些平台/凭证相关的检查没跑。
