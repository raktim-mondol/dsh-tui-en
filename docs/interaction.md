# Interaction and Commands


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
| `Ctrl+C` | 工作时中断；中断迟迟不收敛时再按一次强制退出；空闲且有输入时清空；空输入时连续两次退出 |
| `Ctrl+D` | 与 `Ctrl+C` 同阶梯：工作中=中断（未收敛时再按=强制退出）；空闲时连续两次退出 |
| `Ctrl+O` | 切换 transcript/verbose 详情，展开思考与完整工具参数/输出 |
| `Ctrl+P` | 切换启动时加载的 loaded-context 面板（面板在屏时有效） |
| `Ctrl+T` | 打开轨迹场景（等同 `/trace`）；场景内 `q`/`Esc` 返回对话 |
| `Ctrl+R` | 打开输入历史搜索；重复按或 `Down` 移到下一项 |
| `Ctrl+L` | 强制清理并重绘物理终端 |
| `?` | 输入框为空时打开快捷键和命令帮助 |
| Help 内 `↑/↓`、`PgUp/PgDn`、`Home/End` | 逐行滚动、翻页或跳到命令列表首尾；`Esc` 关闭 |
| `Shift+Up` | 进入消息选择模式；方向键移动，`Enter` 展开单条，`Esc` 退出 |

The action shortcuts (paste, history search, external editor, `Ctrl+O/T/P/R/L`, subagent dashboard, show-all, todo fold) are remappable in `/settings` → `dsh-tui-en` → `Shortcuts`: enter combos such as `alt+v`, comma-separate several, leave blank to restore defaults — saves apply live. Combos clashing with the fixed editing keys or another action are rejected. Deployments can also pin them via `shortcuts.<action>` in cordis.yml.

`/` has two meanings. In normal input it opens slash-command completion. In
the `Ctrl+O` transcript view it opens full-session search; use `n` and `N` to
move forward and backward through matches.

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

`/lang` toggles the UI between Simplified Chinese and English (affects all UI
strings); the choice persists across restarts (0.3.7+). The **dsh-tui-en →
Language** select in `/settings` switches it too (applies immediately and saves
to `dsh-tui-en.lang` in `~/.dsh/settings.yaml`; the `DSH_TUI_LANG` env var always
wins).

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

Each row carries the title, last activity, the git branch this install was on
when it last used the session, the log size, and the model. Titles are graded
by evidence: a `/rename`, an automatically generated title, an excerpt of the
opening prompt, or — when none of those can be read — the directory name,
which is dimmed to say it is not really a name.

The list reads only bounded windows at each end of a session log and caches the
result against the persistence layer's own change token, so opening it costs
the same regardless of how long the history is or how large a session got.

On Windows, `dsh-tui-en.cmd --resume` uses the session ID last written to
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

### Side question /btw

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

### /settings editor

`/settings` opens the plugin settings editor, read/edit by namespace. Editing
is **staged**: `↑`/`↓` to move, `Enter` to expand/toggle/edit, `s` saves /
`d` discards / `Esc` first drops dirty sections, then exits. Fields under the
dsh-tui namespace are written to the user layer of settings.yaml and take
**effect immediately** (`lang`, `statusBar.*`, …); namespaces without a
declared TUI section are listed read-only and need manual edits to
`~/.dsh/settings.yaml`.

### Model and preset

`/model` switches through a session fork at the end of current history because
DSH has no in-place model-switch API. The old session remains in `/resume`.

`/preset` switches in place only for a blank session. In a started session,
the choice becomes the default for the next `/new` or launch. See
[Configuration](configuration.en.md#agent-presets).

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

The launcher accepts the same target, for example `dsh-tui-en .`,
`dsh-tui-en ../project`, or `dsh-tui-en file:///path/to/project`. Without any
workspace plugin installed, local paths, `!command`, and all normal TUI session
flows remain available.

## Fullscreen and mouse

`fullscreen: false` is the default inline mode, where the terminal emulator
owns native scrollback and selection.

`fullscreen: true` uses the alternate screen and enables in-app mouse handling:

| Action | Behavior |
| --- | --- |
| Wheel | Routed by position: moves the selected row in the completion/command menu under the pointer; scrolls the topmost scroll container (transcript / help / subagent panel); elsewhere scrolls the message list; never scrolls the transcript behind an open overlay; moves the cursor in the trajectory scene (±3 rows per notch on the timeline, ±1 in hotspot, scrolls the detail while expanded); walks the focused row in /settings |
| Drag | Select text, copy on release, then clear the selection |
| Double/triple click | Select and copy a word/line |
| `Esc` | Cancel an active drag (or an existing selection) without copying |
| Single-click a message row | Plain text rows (user/assistant) do nothing — the transcript is a reading surface, selection is the mouse's job there |
| Single-click a tool card / thinking / compact summary | Expand / collapse (header brightens on hover; trailing blank cells do not trigger) |
| Single-click a subagent card | Open that subagent's detail scene (status glyph brightens on hover) |
| Single-click the input box | Place the text caret at the click (multi-line, wrapped rows and CJK all width-aligned) |
| Single-click “load earlier messages” / “ctrl+e show previous N” | Load earlier messages / expand all |
| Single-click the sticky header / “↓ N new messages” | Jump back to the pinned message / scroll to bottom |
| Single-click a hyperlink | Open it in the browser |
| Single-click a picker / menu row | Select and apply immediately (model / skills / activity frames / preset / permissions / plan / language / theme / effort / command & file completion / history / session rows / thinking mode / workspace targets, submenu & flow choices) — the keyboard Enter path; rows are inert while a picker is busy or mid-input |
| Single-click a rewind candidate / confirm row | List page: click selects only (stepping into the confirm state stays an explicit keyboard Enter); confirm page: clicking the message / mode row executes the rewind directly — the confirm pane is itself the confirmation layer |
| Single-click an approval / questionnaire / plan-review / plugin dialog row | Submit that decision directly (unblock a waiting agent with the mouse) |
| Single-click in the trajectory scene | Timeline/hotspot rows jump the cursor (a hotspot row jumps back to the timeline at that group — same as Enter; hover shows a dim ▸ pointer); tabs switch views; the sort/projection label cycles; the query line and the tab gap open the `/` search; a wave-band column (ruler included) jumps to its nearest event |
| Single-click a /settings field / group row | Focus it and run that row's Enter action (boolean/select cycles, text enters edit, groups open); hover moves the focus (lazygit-style); the edit mode ignores the mouse entirely |
| Single-click a session-browser confirm row | Confirm the delete/clean (same as Enter); cancelling stays on keyboard Esc |
| Single-click a help-menu command row | Fill `/name ` into the prompt and close the help (the Tab completion's mouse equivalent) |
| Keyboard selection extension | With a selection, `Shift+←/→/↑/↓/Home/End` extends / shrinks it (wraps across lines) |

Copy prefers OSC 52. Local fallbacks include `wl-copy`, `xclip`, and `xsel`;
tmux uses `load-buffer -w`. Set `DSH_TUI_DISABLE_MOUSE=1` to temporarily disable
fullscreen mouse handling.

## `ask_user_question` questionnaires

When the model invokes the questionnaire tool, its panel temporarily owns the
keyboard:

| Key | Behavior |
| --- | --- |
| `Up/Down` | Move through options |
| `Space` | Toggle a multi-select option |
| `Tab` | Switch to a custom text answer |
| `Enter` | Submit the current question |
| `Esc` (from question 2 onward) | Return to the previous question and keep the current draft |
| `Esc` (from question 1) | Cancel the whole batch; the model receives `ASK_CANCELLED` |
| `Ctrl+C` | Cancel the whole batch from any question; the model receives `ASK_CANCELLED` (a harness-side abort still reports `ASK_ABORTED`) |

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
to inspect the complete surface available in the current composition. Command
descriptions follow the UI language (`/lang`): built-in commands and mapped
registry commands (`/plan`, `/goal`, `/feedback`) show Chinese translations in
zh; unmapped registry commands fall back to the registry's own text.

| Group | Commands |
| --- | --- |
| 会话 | `/new`、`/resume`、`/rename`、`/recap`（最近活动摘要 + 建议标题一键应用；设置 `recapOnOpen` 开启时打开会话自动出分隔线 + `回顾：` 摘要行，发送新消息后消失，默认开）、`/workspace resume|rename|open`、`/clear`、`/compact`、`/export`、`/btw`、`/trace`（轨迹场景，亦可 `Ctrl+T`）、`/rewind`（时间回溯，同空输入双击 `Esc`） |
| 状态 | `/context`、`/status`、`/cost`、`/balance`（DeepSeek 官方余额：摘要行 + hover 明细，点击刷新）、`/config`、`/doctor`、`/init`、`/agents`、`/settings` |
| 模型与显示 | `/model`、`/effort`、`/thinking`、`/tokens`、`/activity`、`/preset`、`/theme`、`/color`（会话强调色：无参打开调色板选择器，`<名>` 直接设置，`status`/`reset`；输入框边框 + 右上角会话名标签，按会话保存；标签默认关闭，`/settings` 可开）、`/lang` |
| 账号与策略 | `/provider`、`/login`、`/logout`、`/permissions`、`/add-dir`、`/hooks`、`/mcp`、`/skills`、`/plugins`（`check <路径>` 校验插件清单） |
| 打包 Skills | `/audit`、`/bug`、`/practice`、`/review`、`/pr-comments`、`/release-notes`、`/vuln-check` |
| 其他 | `/update`、`/vim`、`/terminal-setup`、`/connect`、`/help`、`/exit`（别名 `/quit`、`/q`） |
| 注册表 | `/plan`、`/goal`，以及当前 DSH 组合注册的其他命令 |

Additional forms:

- `/activity` 打开动画选择器；`/activity frames <name>` 直接设置（帧名
  30 个：`random` 随机 + `claude` `star2` `sand` `triangle` `box` `box2`
  `corners` `point` `layer` `flip` `aesthetic` `hamburger` `moon` `moon8`
  `comet` `breathe` `dots` `arrow` `spark` `bar` `braille` `arc` `circle`
  `grow` `noise` `bounce` `rainbow` `dqpb` `toggle`，默认 `moon8`）；
  `/activity status` 查看当前选择。
- `/preset <id>` 与 `/preset status` 见配置文档。
- `/effort` 打开推理强度滑杆（←/→ 实时调整）；`/effort <id>` 直接设定，
  `/effort status` 查看当前档位。
- `/theme <name>` 与 `/theme status` 见主题文档。
- `/lang` 切换中英界面语言（见「界面语言」）。
- `/compact` 压缩会话历史；minimal preset（仅 bash+编辑器）下不可用。
- `/thinking` 扩展思考显示开关，仅本次界面状态、**不持久化**。
- 启动后会后台检查 npm 新版本；发现更新时会提示。检测遵循 npm registry
  配置（`NPM_CONFIG_REGISTRY` 或 `~/.npmrc`），镜像源用户看到的就是安装源
  的最新版。`/update` 更新已安装的
  `@deepseek-harness-tui/dsh-tui`，然后自动重启并恢复当前会话；当前回合运行时需等待完成。
  仅在 `dsh --profile <name>` 启动时可用（源码运行等场景会提示不可用）；
  已是最新版时直接提示，不会重启。
- `/plan [off|message]` 与 `/goal ...` 由 DSH 命令插件处理并写入会话事件。
- Skill 命令由 host 注入对应 `SKILL.md` 的技能正文后执行，参数原样随行；
  包内 `skills/` 会在插件启动时自动注册，也可用项目或用户目录中的同名 skill 覆盖。

`/vim`, `/connect`, and `/hooks` are currently compatibility
placeholders. When the DSH composition has no matching capability, each
command explains that explicitly rather than silently doing nothing.
