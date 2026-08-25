# Interaction and Commands

[Documentation index](README.md)

## Input and global shortcuts

| Key | Behavior |
| --- | --- |
| `Enter` | 空闲时发送；模型工作时把文本 steer 到当前回合的下一步边界；菜单打开时确认选项 |
| `Tab` | 补全 `/` 命令或 `@` 文件；模型工作且输入非空时排入当前回合之后的 follow-up |
| `Ctrl+Enter` | 打断当前回合并立即处理输入消息 |
| `Shift+Enter` / `Ctrl+J` | 在光标处插入换行；终端无法上报 Shift 修饰键时可用 `Ctrl+J`（LF）兜底，macOS Terminal.app 用 `Option+Enter` |
| `Shift+Tab` | 在配置的会话模式间循环（默认：默认 → 计划模式 → 完全访问） |
| `Alt/Option+Up` | 把最后一条尚未处理的消息取回输入框编辑 |
| `Up/Down` | 菜单选择；普通输入中浏览历史或在多行文本间移动 |
| `Ctrl+V` / `Alt+V` | 从系统剪贴板插入文本或文件；图片作为持久附件发送。终端拦截 `Ctrl+V` 时用 `Alt+V` |
| `Ctrl+G` | 用外部编辑器（`$VISUAL` → `$EDITOR`）编辑当前输入，保存退出后回填；`:cq` 或非零退出保留原稿；未设置变量时提示配置，无 `vi` 兜底 |
| `Esc` | 层级：关帮助 → 关命令菜单 → 关文件菜单（仅当前 `@` token）→ 中断回合并重投 pending 消息 → 有输入时清空 → 空输入连续两次 = 时间回溯 rewind；fullscreen 下有鼠标选区时优先取消选区（不复制） |
| `Ctrl+C` | 工作时中断；空闲且有输入时清空；空输入时连续两次退出 |
| `Ctrl+D` | 空闲时连续两次退出 |
| `Ctrl+O` | 切换 transcript/verbose 详情，展开思考与完整工具参数/输出 |
| `Ctrl+P` | 切换启动时加载的 loaded-context 面板（面板在屏时有效） |
| `Ctrl+T` | 打开轨迹场景（等同 `/trace`）；场景内 `q`/`Esc` 返回对话 |
| `Ctrl+R` | 打开输入历史搜索；重复按或 `Down` 移到下一项 |
| `Ctrl+L` | 强制清理并重绘物理终端 |
| `?` | 输入框为空时打开快捷键和命令帮助 |
| Help 内 `↑/↓`、`PgUp/PgDn`、`Home/End` | 逐行滚动、翻页或跳到命令列表首尾；`Esc` 关闭 |
| `Shift+Up` | 进入消息选择模式；方向键移动，`Enter` 展开单条，`Esc` 退出 |

动作型快捷键（粘贴、历史搜索、外部编辑器、`Ctrl+O/T/P/R/L`、子代理面板、显示全部、待办折叠）支持在 `/settings` → `dsh-tui` → `Shortcuts` 中自定义：填写 `alt+v` 这类组合，多个用逗号分隔，留空恢复默认，保存即生效；与固定编辑键或其它动作冲突的组合会被拒绝。cordis.yml 亦可用 `shortcuts.<action>` 静态指定。

`/` 有两种语义：普通输入模式中打开 slash command 补全；`Ctrl+O` 的
transcript 模式中打开会话全文搜索。全文搜索使用 `n`/`N` 在结果间前后跳转。

Plugins may register additional combos through the `tuiShortcuts` seam (they
must carry Ctrl or Alt); built-in bindings always win and conflicting combos
are refused at registration. A managed plugin dialog (select/confirm/input)
owns the keyboard while open: `↑`/`↓` to move, `Enter` to confirm, `Esc` to
cancel. Plugins may also contribute display-only text to the status line
above the prompt.

## Editing keys

| Key | Behavior |
| --- | --- |
| `Left/Right` | Move by character |
| `Ctrl+Left/Right` | Move by word |
| `Home/End` | Move to the start/end of the current logical line |
| `Ctrl+A` / `Ctrl+E` | In the editor, move to the start/end of the current logical line; `Ctrl+E` also expands or folds hidden older rows in long transcripts |
| `Ctrl+U` | Delete before the caret |
| `Ctrl+K` | Delete after the caret |
| `Ctrl+W` | Delete the preceding word |

Bracketed paste from right-click or the terminal's native paste command is
inserted verbatim, including newlines, and is never mistaken for an Enter key.

## @ file references

Typing `@` at **any position** of the message opens file completion: keep typing
to filter, `Tab`/`Enter` to pick, and directories can be entered
further (plain fragments match **fuzzily** — `@ment` matches
`src/utils/mentions.ts`, with prefix/boundary and short-path boosts; path-shaped
queries — `@src/`, `@./`, `@../`, `@~/`, `@D:\`, or anything containing a
separator — read **only that directory** for local completion. `Esc` closes only
the current `@` token's menu; async refreshes keep your selected candidate).
Text files
and directory listings are attached as text; PNG, JPEG, WebP,
and GIF files are sent as durable Harness image blocks. Reads use the active
workspace filesystem, including provider-owned workspaces.

On `Ctrl+V`, files copied from a file manager (Windows Explorer, GNOME Files, KDE
Dolphin, …) insert as paths, while image files become `@` references. Clipboard
bitmaps are saved in the attachment store and appear as `[Image #N]`; submitting
the prompt sends a real image block. The prompt never contains base64.

## Interface language

The interface is English. `/lang` reports the current language code and still
accepts `/lang en` or `/lang zh` so a persisted `zh` preference does not error,
but TUI strings stay English either way. The **dsh-tui → Language** select in
`/settings` offers English only. The `DSH_TUI_LANG` env var always wins over
`dsh-tui.lang` in `~/.dsh/settings.yaml`, `cordis.yml`, and `~/.dsh-tui/lang.json`.

## Message delivery semantics

While the model is working, three paths have different placement:

| Action | Placement |
| --- | --- |
| `Enter` | Steer: deliver to the running turn at its next step boundary |
| `Tab` | Follow-up: wait until the current turn finishes |
| `Ctrl+Enter` | Interrupt: stop the turn and deliver immediately |

Undelivered messages appear above the editor. `Alt/Option+Up` retrieves the
latest one. Pressing `Esc` while pending messages exist interrupts and
redelivers them immediately.

## Session workflows

### Resume

`/resume` opens the session browser — a full screen, not a floating panel. It
lists the conversations in the current working directory, most recently active
first; confirming switches the Agent and replays persisted events.

The browser shows **conversations** only. Sub-agent runs the model delegated to
itself are persisted as sessions too (the session header records
`origin: 'subagent'`); they are folded away by default, counted in the header,
and revealed as indented rows under their parent with `ctrl+s`. Rewound
branches from `/rewind` are unaffected — those record `parentSession` without
`origin`, and they are the user's own conversations. Sessions that recorded
only their boot policy and hold no conversation are never listed, only counted,
with `ctrl+x` to clear them (scoped to the current list, never across
projects).

| Key | Action |
| --- | --- |
| Type | Live search over titles, directories, branches, models |
| `↑` `↓` / `PgUp` `PgDn` | Move, page |
| `Enter` | Resume the selected session |
| `Tab` | Preview that session's last few exchanges |
| `ctrl+a` | Toggle this project / all projects (grouped by directory) |
| `ctrl+b` | Only sessions last used on the current branch |
| `ctrl+s` | Expand / fold sub-agent runs |
| `ctrl+r` / `ctrl+d` | Rename / delete the selected session |
| `ctrl+x` | Remove sessions that hold no conversation |
| `Esc` | Clear the search first, leave second |

会话行点击 = 恢复该会话（同 Enter）；删除/清理的确认行点击 = 确认执行，
取消保留键盘 `Esc`。

每行显示标题、最近活动时间、上次使用时的 git 分支、日志大小与模型。标题按证据
分级：`/rename` 的名字、自动生成的标题、首条提示的摘录，或（都读不到时）目录名
——最后一种会显示为灰色，表示它不是一个真正的名字。

The list reads only bounded windows at each end of a session log and caches the
result against the persistence layer's own change token, so opening it costs
the same regardless of how long the history is or how large a session got.

On Windows, `dsh-tui.cmd --resume` uses the session ID last written to
`~/.dsh-tui/resume.txt` (also dual-written to the old path
`~/.dsh-cc/resume.txt` for older launchers that only read it).

### Rewind

Double-tap `Esc` on an empty editor to open the user-message list. After a
selection is confirmed, the TUI:

1. Finds the beginning of the turn containing that message.
2. Creates a branch session through DSH session fork.
3. Replays history before the boundary.
4. Restores the original message to the editor for revision and resubmission.

- The boundary is taken **before** the turn that contained the message; you
  **cannot rewind past the first message**.
- If the model is working, the TUI cancels the turn first and waits for it to
  settle (up to 30s).
- The rewound branch is not a sub-agent (it records `parentSession` without
  `origin`) and keeps using the current model route plus the session's own
  preset.

Plugins can intervene (`tui/rewind-prompt` decision event): veto the rewind
(with a reason), or offer extra rewind modes in the confirm pane — e.g.
"rewind the conversation AND restore the files changed since". The first
option is always "Conversation only"; when a plugin mode is picked, the
plugin receives `tui/rewind-done` (with the chosen mode id and both session
ids) once the rewind completes, and may reply with a summary toast.

鼠标：列表页点击行只选中（进入确认必须键盘 Enter）；确认页的消息行 /
模式行点击 = 直接执行该回退。

### 侧问 /btw

`/btw <question>` asks a quick side question without disturbing the main
task: it reuses the current session context (system prompt + existing
history) for a single **tool-less, one-turn** model call, and shows the
answer in a scrollable panel. Notes:

- **Never enters conversation history**: the exchange is not written to the
  session log and never reaches the main context or token counts (closing
  the panel discards it).
- **Never interrupts the running turn**: it can be triggered while the
  model is streaming; the main task keeps going.
- Inside the panel: `↑`/`↓` scroll, `Space`/`Enter`/`Esc` dismiss, `c`
  copies the answer; `Esc` cancels while the answer is still pending.
- Triggering `/btw` again aborts the previous side question.

### Trajectory scene (/trace / Ctrl+T)

A full-screen scene (no scrollback pollution) over the whole session timeline:

| Key | Action |
| --- | --- |
| `←`/`→` (or `h`) | Switch timeline / hotspot view |
| `↑` `↓` / `PgUp` `PgDn` | Move, page |
| `[` / `]` | Jump to previous / next failed point |
| `{` / `}` | Jump to previous / next turn |
| `/` | Query line: `tool:` `kind:` `turn:` `err:` `run:` `>10s` `tok>1k` prefixes, ANDed together; hits highlight in place |
| `m` | Cycle projection modes (equal / wall-clock / collapsed idle) |
| `g` / `G` | Jump to top / bottom |
| `Enter` | Expand details; `j`/`k` page inside the details |
| `t` (hotspot view) | Cycle sorting (time / count / tokens) |
| `q` / `Esc` | Exit; Esc is layered: fold details → clear query → close |

以上全部有鼠标等价（inline 模式的整屏场景同样启用鼠标跟踪）：时间线/热点
行点击跳光标、页签与右上标签点击切换/循环、查询行与页签空白区点击打开
`/` 搜索、波形带（含标尺）点击列跳最近事件、滚轮移动光标。

### /settings 设置编辑器

`/settings` 打开插件设置编辑器，按命名空间读取/编辑。编辑是**暂存制**：
`↑`/`↓` 移动、`Enter` 展开/切换/编辑，`s` 保存 / `d` 放弃 / `Esc` 先丢弃
脏区再退出。鼠标：字段/组行点击 = 设焦点并执行该行 Enter 动作，悬停即
移动焦点，滚轮走焦点（焦点跟随窗口下即滚动）。dsh-tui 自身命名空间的字段写入 settings.yaml 用户层并**实时生效**
（`lang`、`statusBar.*` 等）；未声明 TUI 区块的命名空间以只读形式列出，需
手工编辑 `~/.dsh/settings.yaml`。

### Model and preset

`/model` switches through a session fork at the end of current history because
DSH has no in-place model-switch API. The old session remains in `/resume`.

`/preset` switches in place only for a blank session. In a started session,
the choice becomes the default for the next `/new` or launch. See
[Configuration](configuration.md#agent-presets).

### Workspaces

`/workspace resume` opens the workspace picker. `/workspace rename <name>`
renames the current workspace, while `/workspace open <target>` opens a
workspace and starts a fresh session. `/resume` and `/rename` continue to
switch sessions within the current workspace and rename the current session.
A local target may be an absolute path,
a path relative to the current local workspace, or a standard `file://` URL.
Other URI schemes and `/workspace` subcommands are registered by optional plugins; the TUI has no built-in
knowledge of any external protocol. When a plugin owns the current workspace,
it also resolves relative paths in its own path space.

After `/workspace `, the completion menu includes both built-in and
plugin-contributed subcommands. Type a prefix and press Tab, for example
`/workspace rem`; plugin aliases participate in matching as well.

The launcher accepts the same target, for example `dsh-tui .`,
`dsh-tui ../project`, or `dsh-tui file:///path/to/project`. Without any
workspace plugin installed, local paths, `!command`, and all normal TUI session
flows remain available.

## Fullscreen and mouse

`fullscreen: false` is the default inline mode, where the terminal emulator
owns native scrollback and selection.

`fullscreen: true` uses the alternate screen and enables in-app mouse handling:

| Action | Behavior |
| --- | --- |
| 滚轮 | 按位置路由：补全/命令菜单悬停处移动菜单选中行；最上层滚动容器（转录 / 帮助 / 子代理面板）滚它；其余位置滚动会话消息列表；浮层打开时不穿透滚动背后转录；轨迹场景移动光标（时间线一格 ±3 行、热点 ±1 行、详情展开时滚详情）；设置屏移动焦点行 |
| 拖拽 | 选择文本，松开后立即复制并清除选区 |
| 双击/三击 | 选择单词/整行并复制 |
| `Esc` | 取消正在进行的拖拽（或现有选区），不复制 |
| 单击消息行 | 纯文本行（用户/assistant）无操作——转录是阅读区，鼠标职责是选字 |
| 单击工具卡 / thinking / compact 摘要 | 展开 / 收起（hover 时标题提亮指示，行右侧空白不触发） |
| 单击子代理卡 | 打开该子代理的详情场景（hover 时状态符号提亮） |
| 单击输入框 | 定位文本光标到点击处（多行/换行/CJK 均按显示宽度对齐） |
| 单击「加载更早消息」/「ctrl+e 显示前 N 条」 | 加载更早消息 / 展开全部 |
| 单击 StickyHeader / 「↓ N new messages」 | 跳回固定消息处 / 滚动到底部 |
| 单击超链接 | 打开浏览器 |
| 单击 picker / 菜单条目行 | 选中并立即应用（模型/技能/活动帧/预设/权限/plan/语言/主题/effort 档位/命令与文件补全/历史命令/会话行/thinking 显示模式/工作区目标与子菜单/工作区命令分支），与键盘 Enter 同路径；busy 或输入态中的浮层行禁点 |
| 单击 rewind 候选行 / 确认页 | 列表页点击只选中（确认保留键盘 Enter——高危操作显式触发）；确认页消息行 / 模式行点击 = 直接执行（确认页本身即显式确认层） |
| 单击审批 / 问卷 / 计划评审 / 插件对话框决定行 | 直接提交该决定（agent 阻塞等待时可鼠标放行） |
| 单击轨迹场景 | 时间线/热点行点击 = 光标跳该行（热点行跳回时间线定位该组，同 Enter；hover 亮 dim ▸ 轻指示不刷背景）；页签点击切视图；右上排序/投影标签点击循环；查询行与页签空白区点击打开 `/` 搜索；波形带（含标尺行）点击列 = 跳最近事件 |
| 单击 /settings 字段 / 组行 | 设焦点并执行该行的 Enter 动作（boolean/select 循环值、文本进编辑态、组进组页）；悬停即移动焦点（lazygit 语义），编辑态整屏不响应防误触 |
| 单击会话浏览器确认行 | 删除/清理确认行点击 = 确认执行（同 Enter）；取消保留键盘 Esc |
| 单击帮助菜单命令行 | 填入 `/name ` 并关闭帮助（Tab 补全的鼠标等价） |
| 键盘扩展选区 | 有选区时 `Shift+←/→/↑/↓/Home/End` 扩展 / 收缩（跨行环绕） |

Copy prefers OSC 52. Local fallbacks include `wl-copy`, `xclip`, and `xsel`;
tmux uses `load-buffer -w`. Set `DSH_TUI_DISABLE_MOUSE=1` to temporarily disable
fullscreen mouse handling.

## `ask_user_question` questionnaires

When the model invokes the questionnaire tool, its panel temporarily owns the
keyboard:

| Key | Behavior |
| --- | --- |
| `Up/Down` | 移动选项 |
| `Space` | 多选题勾选或取消 |
| `Tab` | 切换到自定义文本回答 |
| `Enter` | 提交当前题 |
| `Esc`（第 2 题起） | 返回上一题并保留当前草稿 |
| `Esc`（第 1 题） | 取消整批提问，模型收到 `ASK_CANCELLED` |
| `Ctrl+C` | 从任意题取消整批提问，模型收到 `ASK_CANCELLED`（harness 侧中止仍报 `ASK_ABORTED`） |

The last row is a free-form input line: typing directly on an option row
submits that option's label **plus** your custom text together (no need to
`Tab` first); `Tab` jumps straight to the input line.

Batched questions and concurrent subagent questions are shown one at a time in
FIFO order. A compact Q&A summary is added to the local transcript afterward.

## Plan review

When the model calls `exit_plan_mode` in plan mode, the full plan is rendered
as markdown in the review panel (the dedicated decision layout for
`intent: plan-review`):

| Key | Behavior |
| --- | --- |
| `Up/Down` | Move between the options and the feedback input line at the bottom |
| `1`/`2` | Submit the corresponding option directly (when the feedback buffer is empty; otherwise digits are treated as feedback characters) |
| Typing | Enters the feedback input line |
| `Enter` (option row) | Submit that option; an approval row with feedback errors out — approval must carry no feedback, or the protocol treats it as “continue planning” |
| `Enter` (input line) | Submit “continue planning” with the feedback text |
| `Esc` | Interrupt the review to talk (`ASK_CANCELLED`); the model stays in plan mode |

## Tool approval

When the permission layer issues an `approval/request`, the approval panel
shows the tool name, the full command extracted from the paired tool call, and
the reason, and temporarily owns the keyboard (when a questionnaire is also
pending, approval takes priority):

| Key | Behavior |
| --- | --- |
| `Up/Down` | Move through options |
| `1` / `2` | Allow (this time only) / deny |
| `Enter` | Submit the focused item |
| `Esc` / `Ctrl+C` | Deny (fail closed) |

The protocol offers only "allow once / deny" — there is **no "always allow"**.

## Slash commands

The command menu merges local commands with the DSH command registry. Type `/`
to inspect the complete surface available in the current composition. Built-in
and mapped registry commands (`/plan`, `/goal`, `/feedback`) use their English
description text; unmapped registry commands fall back to the registry's own
text.

| Group | Commands |
| --- | --- |
| 会话 | `/new`、`/resume`、`/rename`、`/recap`（最近活动摘要 + 建议标题一键应用；设置 `recapOnOpen` 开启时打开会话自动出分隔线 + `回顾：` 摘要行，发送新消息后消失，默认开）、`/workspace resume|rename|open`、`/clear`、`/compact`、`/export`、`/btw`、`/trace`（轨迹场景，亦可 `Ctrl+T`）、`/rewind`（时间回溯，同空输入双击 `Esc`） |
| 状态 | `/context`、`/status`、`/cost`、`/config`、`/doctor`、`/init`、`/agents`、`/settings` |
| 模型与显示 | `/model`、`/effort`、`/thinking`、`/tokens`、`/activity`、`/preset`、`/theme`、`/color`（会话强调色：无参打开调色板选择器，`<名>` 直接设置，`status`/`reset`；输入框边框 + 右上角会话名标签，按会话保存；标签默认关闭，`/settings` 可开）、`/lang` |
| 账号与策略 | `/provider`、`/login`、`/logout`、`/permissions`、`/add-dir`、`/hooks`、`/mcp`、`/skills`、`/plugins`（`check <路径>` 校验插件清单） |
| 打包 Skills | `/audit`、`/bug`、`/practice`、`/review`、`/pr_comments`、`/release-notes`、`/vuln-check` |
| 其他 | `/update`、`/vim`、`/terminal-setup`、`/connect`、`/help`、`/exit`（别名 `/quit`、`/q`） |
| 注册表 | `/plan`、`/goal`，以及当前 DSH 组合注册的其他命令 |

Additional forms:

- `/activity` opens the animation picker; `/activity frames <name>` selects
  directly (30 frame names: `random` + `claude` `star2` `sand` `triangle`
  `box` `box2` `corners` `point` `layer` `flip` `aesthetic` `hamburger`
  `moon` `moon8` `comet` `breathe` `dots` `arrow` `spark` `bar` `braille`
  `arc` `circle` `grow` `noise` `bounce` `rainbow` `dqpb` `toggle`; default
  `moon8`); `/activity status` reports the current choice.
- `/preset <id>` and `/preset status` are described in the configuration guide.
- `/effort` opens the reasoning-effort slider (←/→ adjusts live);
  `/effort <id>` sets a level directly; `/effort status` reports the current one.
- `/theme <name>` and `/theme status` are described in the theme guide.
- `/lang` reports the UI language (see “Interface language”). `/lang zh` is a
  compatibility alias and still shows English.
- `/compact` compresses the session history; unavailable under the minimal
  preset (bash + editor only).
- `/thinking` toggles extended reasoning display; UI state only — **not
  persisted**.
- After startup, the TUI checks npm for a newer version in the background and
  shows a notification when one is available. The check follows the npm
  registry configuration (`NPM_CONFIG_REGISTRY` or `~/.npmrc`), so mirror
  users see the versions their package manager actually installs. `/update`
  updates the installed `@deepseek-harness-tui/dsh-tui`, then restarts and
  resumes the current session automatically; wait for an active turn to finish first. It is only
  available under a `dsh --profile <name>` launch (source checkouts get an
  unavailable notice), and an already-latest install is reported as such
  without restarting.
- `/plan [off|message]` and `/goal ...` are handled by DSH command plugins and
  recorded as session events.
- Skill commands submit activation prompts. The actual skill is loaded through
  the DSH skill registry. Packaged `skills/` register at startup and may be
  overridden by same-name project or user skills.

`/vim`, `/connect`, and `/hooks` are currently compatibility
placeholders. When the DSH composition has no matching capability, each
command explains that explicitly rather than silently doing nothing.
