# dsh-TUI User Guide

> A day-to-day operations manual: startup, keybindings, commands, session
> workflow, interface metrics, and common tips.
> Written from the current repository code and docs; configuration behavior
> is ultimately governed by `package.json`, `cordis.patch.yml`, and the
> actual DSH composition.

## Table of Contents

- [1. Quick Start](#1-quick-start)
- [2. Keybinding Reference](#2-keybinding-reference)
- [3. Full Command List](#3-full-command-list)
- [4. Session Workflow](#4-session-workflow)
- [5. Interface and Status Bar](#5-interface-and-status-bar)
- [6. Model / Preset / Theme / Language](#6-model--preset--theme--language)
- [7. Common Tips](#7-common-tips)

---

## 1. Quick Start

### 1.1 Install and Launch

```sh
# Install the CLI and this plugin globally (the plugin ships the dsh-tui command)
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui

# Start it (first run auto-initializes the dsh-tui profile; needs pnpm)
dsh-tui
```

- `dsh-tui --resume`: restores the most recently selected session; on Windows
  the repository's `dsh-tui.cmd` works the same way.
- `dsh --profile dsh-tui`: a manual launch equivalent to `dsh-tui` (only this
  form supports `/update`).
- Model requests require `DEEPSEEK_API_KEY`; use `/doctor` to self-check the
  environment.
- Supported dsh engine range: `0.1.0-rc.6` through `0.1.1-rc.2` (including
  rc.7/rc.8 and 0.1.1-rc.1). Older or newer versions can still launch, but the
  logo screen shows a version-drift warning with an alignment command.

### 1.2 What You See on First Launch

1. **The pixel whale header** (a ~3.4s intro animation: blink → spout →
   tail-wag, then it settles): next to it, `✦ dsh-TUI` and its version, the
   large `DEEPSEEK / HARNESS` wordmark, the current model and effort, the
   working directory, and one **startup hint line** (`/model` to switch
   models · `/help` for commands · `Tab` to autocomplete). The whale hides
   below 64 columns, leaving only the text column.
   If the dsh engine version is outside the validated range, one
   **⚠ version-drift warning** line appears below the hint (newer / older /
   mixed / broken forms), with an alignment command
   (`npm i -g @deepseek-ai/dsh@<version>`).
2. **The bottom status bar**: the working-activity row, context progress bar,
   TPS gauge, and various live metrics (see
   [5. Interface and Status Bar](#5-interface-and-status-bar)).
3. Type `/` to see the command menu, press `?` for the keybinding help.

### 1.3 Core Mental Model

- The TUI only handles interaction and rendering; **the session log is the
  single source of truth** for the conversation — model calls, tool
  execution, fork/resume, compaction, and persistence are all handled by DSH
  services (`/status` shows session info).
- Almost every command supports **Tab completion**; for commands that take
  arguments, type `/command ` (with a trailing space) first, then Tab.
- Anything typed that isn't a command is a normal chat message; **an unknown
  command is sent to the model as a plain message** (e.g. `/permission` when
  it isn't mounted in the current composition).

---

## 2. Keybinding Reference

> In the tables below, `Ctrl` can mostly be swapped for `⌘` on macOS (`⌘V`
> `⌘O` `⌘R` `⌘T` `⌘L` `⌘Enter`, etc.); `Ctrl+C` / `Ctrl+D` stay as Ctrl.
> `⌘` requires an extended keyboard protocol (iTerm2 / kitty / WezTerm /
> ghostty / tmux) — use Ctrl in macOS Terminal.app.

### 2.1 Send and Deliver (three meanings while the model is working)

| Key | Action |
|---|---|
| `Enter` | Idle = send; **while the model is working = steer** (inject a next-step boundary without interrupting); with a menu open = confirm the selected item |
| `Tab` | Complete `/` commands or `@` files; **while the model is working = follow-up** (queued after the current turn) |
| `Ctrl+Enter` (⌘Enter) | Interrupt the current turn and send the input immediately |
| `Shift+Enter` / `Ctrl+J` | Newline (`Option+Enter` is the fallback on macOS Terminal.app) |
| `Alt+Up` | Pull the last unhandled message back into the input for editing (without interrupting the turn) |
| `Esc` (working + a pending message) | Interrupt the turn and immediately resend the pending message |
| `/btw …` while working | Enter runs it right away (the side question never interrupts the main turn) |

### 2.2 Interrupt / Exit / System

| Key | Action |
|---|---|
| `Ctrl+C` | While working = interrupt; idle with input = clear the input; idle with empty input = double-press to exit (3s window) |
| `Ctrl+D` | Double-press while idle to exit |
| `Ctrl+L` (⌘L) | Clear the screen and force a redraw |
| `Ctrl+O` (⌘O) | Expand/collapse details (full thinking text, tool arguments and output) |
| `Ctrl+E` | In the input box = jump to end of line; while transcribing = expand/collapse hidden older messages |
| `Ctrl+P` | Toggle the startup loaded-context panel (effective while the panel is on screen) |
| `?` | Opens the keybinding/command help menu when the input is empty |

### 2.3 Search

| Key | Action |
|---|---|
| `Ctrl+R` (⌘R) | History search; repeat the press or `↓` for the next match; `Enter` fills it back into the input |
| `/` (in transcript view) | In-session full-text search; `n` / `N` to jump (only while expanded with Ctrl+O) |

### 2.4 Input Editing

| Key | Action |
|---|---|
| `←` / `→` | 按字符移动光标 |
| `Ctrl+←` / `Ctrl+→`（⌘←/→） | 按词跳转 |
| `Home` / `End`，`Ctrl+E` | 逻辑行首 / 行尾（`Ctrl+A` 已改用于子代理面板，见 §2.7） |
| `Ctrl+U` / `Ctrl+K` | 删除光标前（至行首）/ 光标后（至行尾） |
| `Ctrl+W` | 删除前一个单词 |
| `Backspace` / `Delete` | 删前一 / 后一字符 |
| `↑` / `↓` | 多行时行间移动；单行时浏览输入历史（50 条） |
| `Ctrl+V`（⌘V）/ `Alt+V` | 粘贴：文本 / 文件路径（图片自动 `@` 引用）/ 剪贴板位图（`[Image #N]` 附件）；终端拦截 `Ctrl+V` 时用 `Alt+V` |
| `Ctrl+G` | 用 `$VISUAL`/`$EDITOR` 外部编辑器编辑输入（`:cq` 保留原稿；未设置变量时提示配置） |
| 右键 / `Ctrl+Shift+V` | 终端原生粘贴（含换行原样插入） |
| `Esc`（输入框） | 层级：关帮助 → 关命令菜单 → 关文件菜单（仅当前 `@` token）→ 中断重投 → 有输入清空 → 双击=时间回溯 |
| 双击 `Esc`（空输入） | **时间回溯 rewind**（3s 窗口内按两次） |

### 2.5 Navigation / Modes

| Key | Action |
|---|---|
| `Shift+Tab` | Cycle session mode (default → plan → full access) |
| `Shift+↑` | Message selection mode (`↑/↓` to move, `Enter` expands a single message, `Esc` exits) |
| `Ctrl+T` (⌘T) | Open the trajectory scene (same as `/trace`) |

### 2.6 Mouse (fullscreen mode; drag/double-click/triple-click select-and-copy)

| Action | Effect |
|---|---|
| Left-click drag | Select text, **copies on release** (OSC 52 + wl-copy/xclip/xsel fallback), the selection clears automatically |
| Double-click / triple-click | Select word / select line, copies immediately |
| Wheel | Scroll the message list (±3 lines per notch); **pans an active text selection with the content instead** (both directions; the selection clears automatically once either end scrolls out of the viewport) |
| `Esc` | Clear the selection (without copying) |
| Click a message row | Expand/collapse that row |
| Click "Load earlier messages" / "ctrl+e to show N more" | Load earlier messages / expand all |
| Click the sticky header / "↓ N new messages" | Jump back to the pinned message / scroll to bottom |
| Click a hyperlink | Open it in the browser |
| Keyboard selection extension | With an active selection, `Shift+←/→/↑/↓/Home/End` extends/shrinks it (wraps across lines) |

### 2.7 Per-Scene Keybindings

**问卷（模型 ask_user_question）**
`↑/↓` 选择 · `Space` 多选勾选 · `Tab` 切自定义回答 · `Enter` 提交 · 第 2 题起 `Esc` 返回上一题 · 第 1 题 `Esc` 或任意题 `Ctrl+C` 取消整批提问

**Plan review**
`↑/↓` move · `1`/`2` quick-pick by number (when feedback is empty) · typing =
feedback · `Enter` submit · `Esc` interrupt the review
(an approval row with feedback text errors out — approval must carry no
feedback)

**Tool approval**
`↑/↓` move · `1` allow (this time only) / `2` deny · `Enter` submit ·
`Esc`/`Ctrl+C` deny

**`/resume` session browser**
Typing = live search · `↑/↓` and `PgUp/PgDn` move · `Enter` resume · `Tab`
toggle preview · `⌘A` all projects ·
`Ctrl+B` current branch · `Ctrl+S` fold subagent runs · `Ctrl+R` rename ·
`Ctrl+D` delete · `Ctrl+X` clear empty shells ·
`Esc` clears the search first, then exits

**History search (Ctrl+R)**
`↑/↓` select · repeat `Ctrl+R` or `↓` for the next match · `Enter` fill back
in · `Esc`/`Ctrl+C`/`Ctrl+D` cancel

**Trajectory scene (Ctrl+T / /trace)**
`↑/↓` and `PgUp/PgDn` move · `←/→` (or `h`) switch timeline/hotspot ·
`[`/`]` jump to the previous/next failure point ·
`{`/`}` jump to the previous/next turn · `/` query line (`tool:` `kind:`
`turn:` `err:` `run:` `>10s` `tok>1k` prefixes) ·
`m` cycle projection mode · `g`/`G` top/bottom · `Enter` expand details ·
`j`/`k` page through details · hotspot view `t` to sort ·
`q`/`Esc` exit (Esc has three layers: collapse details → clear the query →
close)

**`/settings` panel**
`↑/↓` move · `Enter` expand/toggle/edit · `s` save · `d` discard · `Esc`
discards the dirty draft first, then exits

**`/btw` side-question panel**
`↑/↓` scroll · `Space`/`Enter`/`Esc` close · `c` copy the answer · `Esc`
cancels while waiting

**`/effort` slider**
`←/→` adjust live (Esc does not revert) · `Enter`/`Esc` finish

**`@` file completion**
`@` triggers anywhere in the message · `↑/↓` move · `Tab`/`Enter` accept ·
directories can be drilled into further ·
`Esc` closes only the current token's menu
- **Two query modes**: path-shaped input (`@src/` `@./` `@~/` `@D:\`,
  any path separator) lists only that directory; a plain fragment uses
  **fuzzy subsequence matching** (prefix/boundary-weighted — `@ink` also
  matches `src/ink/Box.js`).
- Files and directories each have a **budget of 100**; accepting is judged by
  entry type (file = insert a reference, directory = drill in further).
- Pasting or typing an image path automatically becomes a `[Image #N]`
  attachment.

**Subagent panel (Ctrl+A)**
`↑/↓` browse · `Enter` view details · `Esc` close; in the detail view `←/→`
page through (overview / output stream / tools and tokens),
`X` interrupts a running subagent · `Esc` returns. In the chat stream,
subagents render as live card rows (a three-line waterfall while running,
collapsing to a title row once settled; the corresponding Task tool card is
suppressed).

**Double-press Esc time rewind**
The list: `↑/↓` + `Enter` to enter confirmation · confirmation screen: `Enter`
to rewind / `Esc` to go back · while a plugin decision is pending, only `Esc`
responds

---

## 3. Full Command List

The command menu = built-in commands (50) + DSH registry commands (`/plan`
`/goal`, etc.) + the skill catalog (completion only, hidden from the `/help`
menu). The interface is English; `/lang zh` is a compatibility alias and
still shows English.

### 3.1 Session

| Command | Arguments | Effect |
|---|---|---|
| `/new` | 无 | 新开会话（无二次确认；旧会话可 `/resume` 恢复） |
| `/resume` | 无 | 打开会话浏览器（搜索、预览、跨项目、折叠子 agent 运行） |
| `/rename` | `<新名称>` | 重命名当前会话（无参时显示当前标题与用法） |
| `/recap` | 无 | 最近活动摘要（一行）+ 建议标题；面板内 `a` 键或点击一键应用标题。设置 `dsh-tui.recapOnOpen`（默认开）开启时，打开/恢复会话自动在底部显示一条分隔线 + `回顾：` 摘要行，悬停可查看操作、点击展开，发送新消息后自动消失 |
| `/workspace` | `resume` / `rename <名称>` / `open <路径或URI>` | 管理工作区；`open` 支持绝对路径、file URI、插件 scheme |
| `/clear` | 无 | 清空当前会话视图（重置展开/选择状态） |
| `/compact` | 无 | 压缩会话历史（无可压缩内容时会提示） |
| `/export` | 无 | 导出会话为 Markdown 到工作目录 |
| `/btw` | `<问题>` | 侧问：单轮、无工具、不打断主回合、不写历史 |
| `/trace` | 无 | 打开轨迹场景（同 `Ctrl+T`） |
| `/rewind` | 无 | 回退选择器（同空输入双击 Esc 的时间回溯） |
| `/exit`（别名 `/quit` `/q`） | 无 | 退出 dsh-tui |

### 3.2 Status and Diagnostics

| Command | Arguments | Effect |
|---|---|---|
| `/context` | none | Loaded-context breakdown (instructions/runtime context/skills/tools, etc.) |
| `/status` | none | Model+effort, working/idle, session id, directory+git branch, tokens, cache hit rate, context percentage, session title |
| `/cost` | none | Token usage + cache hit rate (DSH does not provide cost metering) |
| `/config` | none | Configuration sources: `cordis.patch.yml` path, launch method, model routing |
| `/doctor` | none | Environment self-check |
| `/init` | none | Create `AGENTS.md` in the working directory (created / exists / failed states) |
| `/agents` | none | List of this session's subagents |
| `/settings` | none | Open the plugin settings editor (namespaced read/edit) |
| `/help` | none | Keybinding + command help menu (same as `?`) |

### 3.3 Model / Display

| Command | Arguments | Effect |
|---|---|---|
| `/model` | 无 | 模型选择器；**切换 = fork 会话续聊**（历史保留、仅换路由），选择持久化到 `~/.dsh-tui/model.json` |
| `/effort` | `status` / `<id>` | 推理强度：无参滑杆（←/→ 实时调整）；`status` 当前档位；`<id>` 直接设定。持久化 `~/.dsh-tui/effort.json` |
| `/thinking` | 无 | 扩展思考显示开关（流式时思考逐条展开） |
| `/tokens` | 无 | token 用量 + 上下文百分比 |
| `/activity` | `frames <名>` / `status` | 工作状态行动画：无参选择器；`frames` 列全部预设；`frames <名>` 直接设置。帧名 30 个（`random` 随机 + `claude/star2/sand/triangle/box/box2/corners/point/layer/flip/aesthetic/hamburger/moon/moon8/comet/breathe/dots/arrow/spark/bar/braille/arc/circle/grow/noise/bounce/rainbow/dqpb/toggle`，默认 `moon8`）。持久化 `~/.dsh-tui/working-activity.json` |
| `/preset` | `<id>` / `status` | Agent 预设切换：官方 `standard` / `code` / `minimal` / `cordis` + TUI 打包**梁神模式 `liangshen`** + 用户自定义；**已开始的会话不可切换**（blank-only 锁定）。持久化 `~/.dsh-tui/agent-preset.json` |
| `/theme` | `<名字>` / `status` | 主题：无参选择器；`<名字>` 直接切换；`status` 当前主题（auto 时附 OSC 11 解析结果）。持久化 `~/.dsh-tui/theme.json` |
| `/color` | 无参 / `<名>` / `status` / `reset` | 会话强调色：**无参打开调色板选择器**（8 色 + 色点预览，`↑/↓` 选择、`Enter` 应用）；`<名>` 直接设置；`status` 当前；`reset` 恢复主题默认。输入框边框 + 会话名标签变色（标签显示在输入框顶边框**右上角**，**默认关闭**，`/settings` 的「会话名标签」可开启；`red/orange/yellow/green/blue/purple/pink/cyan`）。按会话经 `session/color` 事件保存，resume/rewind 后仍在 |
| `/lang` | `en` / `zh` / `status` | 界面语言热切换。优先级：`DSH_TUI_LANG` > settings.yaml > cordis.yml > 持久化 |

### 3.4 Account / Policy / Extensions

| Command | Arguments | Effect |
|---|---|---|
| `/provider` | none | Interactive wizard for adding a model provider (persists profile + key) |
| `/login` | none | Credential status (source, storage writability, base URL) |
| `/logout` | none | Logout instructions (env-sourced credentials require removing the variable and restarting) |
| `/permissions` | none | Permission policy and approval-channel explanation |
| `/add-dir` | none | File-policy scope explanation (rooted at the working directory) |
| `/hooks` | none | Placeholder: explains that DSH hooks aren't mounted in this composition |
| `/mcp` | none | MCP connection status (tools grouped as `mcp__server__tool`); shows a `cordis.patch.yml` insertion example when nothing is configured |
| `/skills` | none | Skill catalog picker (name+source+summary); Enter fills a directly-invocable skill back in as `/name ` |
| `/plugins` | `check <path to dsh-plugin.json>` | Plugin diagnostics: trust banner + host descriptor + grant matrix + ledger; `check` validates a manifest file and reports compatibility |
| `/update` | none | Update the TUI and auto-restart back into the session (only available when launched via `dsh --profile`; refused while a turn is running) |
| `/terminal-setup` | none | Terminal configuration advice (Windows Terminal ≥110 columns, paste keybindings) |

### 3.5 Bundled Skills

| Command | Effect |
|---|---|
| `/audit` | Code audit |
| `/bug` | Bug report |
| `/practice` | Coding practice |
| `/review` | Code review |
| `/pr_comments` | PR comments (note: the skill's registered name is `pr-comments`, so both entries may appear in the menu) |
| `/release-notes` | Release notes |
| `/vuln-check` | Vulnerability check |

Skill commands send an activation prompt to the model, which loads and
executes the matching `SKILL.md` from the `skills/` directory.

### 3.6 Placeholder Commands

| Command | Notes |
|---|---|
| `/vim` | Placeholder: no equivalent mechanism on the DSH side, reports as unimplemented |
| `/connect` | Placeholder: DSH has no remote-connection mechanism yet |

### 3.7 Registry Commands (from the DSH ecosystem, merged into the `/` menu dynamically with the composition)

| Command | Effect |
|---|---|
| `/plan` | `[off\|message]` plan mode; `/plan off` exits it |
| `/goal` | Set/view the session goal |
| `/feedback` | Submit usage feedback |
| `/permission` | View/switch the permission preset (read-only / workspace-write / danger-full-access; not present in every composition) |

> These commands are implemented by the DSH command registry — this
> repository only merges them into the menu, completes them, and dispatches
> them; an unknown command is sent to the model as a plain message.

---

## 4. Session Workflow

### 4.1 Session Lifecycle

| Action | Command/Key | Notes |
|---|---|---|
| Create | `/new` | No confirmation — the old session is already persisted and recoverable any time via `/resume`; also clears the resume marker |
| Resume | `/resume` | Fullscreen session browser: live search while typing (title/directory/branch/model), `Enter` resumes; `Tab` previews; `⌘A` all projects / `Ctrl+B` current branch / `Ctrl+S` fold subagent runs / `Ctrl+R` rename / `Ctrl+D` delete / `Ctrl+X` clean up empty shells; `Esc` clears the search first, then exits |
| Rename | `/rename <title>` | Renames immediately and persists it (writes a session/title event, readable back by the browser) |
| Compact | `/compact` | Manually triggers DSH compaction; **refused while a turn is running**; unavailable under the minimal preset; the compaction point renders as a divider summary row |
| Export | `/export` | Exports Markdown from the full session log (including thinking and tool-call sections); the file `dsh-tui-export-<timestamp>.md` lands in the session's current working directory |
| Clear view | `/clear` | Clears only the view, leaves the session log untouched |
| Delete | `Ctrl+D` in `/resume` | Deletes the log directory and its MRU entry (with confirmation) |
| Exit | `/exit` (or `/quit` `/q`) | Double-press `Ctrl+C` or double-press `Ctrl+D` while idle also exits |

Command-line resume: `dsh-tui --resume` (most recent session) /
`dsh-tui --resume <id>` (a specific session); `-c` / `--continue` are
equivalent.

### 4.2 Time Rewind (double-press Esc)

**Press `Esc` twice in a row on an empty input** (or run `/rewind`) to enter
the rewind selector:

1. The selector lists **your own messages** (most recent first, side
   questions excluded), `↑/↓` + `Enter` to pick one.
2. If the model is currently working: the turn is cancelled first and the
   selector waits for it to settle (up to 30s).
3. The boundary is taken **just before** the turn that message belongs to;
   **you cannot rewind past the first message**.
4. The system forks a new session and replays history up to the rewind
   point (tokens/progress reset to zero); **the original message is placed
   back in the input box** for editing and resending.
5. A rewound branch **does not count as a subagent** (no origin marker) and
   stays in the `/resume` list; it keeps using the current model route +
   the session's own preset.

> With content in the input, a double-press of Esc clears it instead; the
> full Esc layering in the input box is:
> close help → close command menu → close file menu → (working + pending)
> interrupt and resend → clear input → double-press on empty input = rewind.

### 4.3 Message-Delivery Semantics (while the model is working)

- `Enter` = **steer**: inject a next-step boundary into the current turn
  without interrupting it.
- `Tab` = **follow-up**: queue the message to be handled after the current
  turn.
- `Ctrl+Enter` = **interrupt**: interrupt and send immediately.
- `Alt+Up` = pull the last unhandled message back into the input (without
  interrupting).
- `Esc` (with a pending message) = interrupt and immediately resend the
  pending message.
- `/btw …` while working runs immediately on Enter — a side question never
  interrupts the main turn.

### 4.4 Side Questions (`/btw`)

`/btw <question>` reuses the current session's full context for a
**tool-free, single-turn** answer.
**Nothing is written to session history and no tokens are counted**; closing
the panel discards it; the main turn continues as normal.
Panel: `↑/↓` scroll · `Space`/`Enter`/`Esc` close · `c` copy the answer ·
`Esc` cancels while waiting.
Triggering it again aborts the previous side question.

### 4.5 Trajectory Scene (Ctrl+T / /trace)

A fullscreen scene (does not pollute scrollback) for viewing the session's
full timeline:

- `←/→` (or `h`) switch timeline / hotspot; `↑/↓` and `PgUp/PgDn` move;
  `g`/`G` jump to start/end; `Enter` expands details (`j`/`k` to scroll).
- `[`/`]` jump to the previous/next failure point; `{`/`}` jump to the
  previous/next turn; `m` cycles the projection mode (even split / wall
  clock / compacted idle).
- `/` opens a **field query**: `tool:web_search` `kind:retry` `turn:9`
  `err:` `run:` `>10s` `tok>1k`, multiple terms AND together, matches
  highlight in place.
- Hotspot view: `↑/↓` selects a row, `t` cycles the sort (duration / count /
  tokens), `Enter` jumps back to that point in the timeline.
- `q`/`Esc` exit (Esc has three layers: collapse details → clear the query
  → close).
- Before first use, a `ctrl+t` hint appears next to the mini trajectory bar
  in the status bar; it retires permanently once you've opened it;
  unread failures are marked only on the **most recent** failed tool row.

### 4.6 Model Switching and Presets

- `/model`: a picker; **switching = fork the session and continue**
  (history kept, only the provider/model route changes, the preset stays
  the same); the old session stays in `/resume`; the choice persists to
  `~/.dsh-tui/model.json`. Switching mid-turn is refused.
- `/preset`: `standard` (default, full-featured) / `code` (PTC) / `minimal`
  (bash + editor only, no compaction) / `cordis` (creative mode) /
  `liangshen` (Liangshen mode: a minimal two-tool first turn, opens the
  full directory tree after the first tool call).
  **Cannot be switched once the session has any messages** (blank-only:
  the choice is only saved as the default for the next `/new`).
- Session mode `Shift+Tab` cycles through three tiers: default
  (workspace-write + approvals) → plan (read-only) → full
  (danger-full-access).

### 4.7 Questionnaires and Approvals

**问卷（模型 ask_user_question）**：面板独占键盘；`↑/↓` 选选项、`Space` 多选、
`Enter` 提交。**最后一行是自由输入行**——在选项行直接打字 = 附加该选项标签 + 自定义文本一起提交；
`Tab` 直达输入行。第 2 题起按 `Esc` 返回上一题并保留草稿；第 1 题按 `Esc`，或任意题按 `Ctrl+C`，取消整批提问（模型收到 ASK_CANCELLED）。
计划评审卡片：`1`/`2` 数字快选；**批准必须无反馈文本**（带反馈视为"继续规划"）。

**Tool approval**: an approval bar pops up when a command requests elevated
permissions (tool name + full command + reason).
`↑/↓` select · `1` allow (this time only) / `2` deny · `Enter` submit ·
`Esc`/`Ctrl+C` deny.
When an approval and a questionnaire are both pending, **the approval takes
priority**; the protocol only has "allow once / deny", no "always allow".

### 4.8 Skills / Registry / Goals-Todos

- Bundled skills (`/audit` code audit · `/bug` bug report · `/review`
  review · `/practice` practice ·
  `/pr_comments` PR comments · `/release-notes` release notes ·
  `/vuln-check` vulnerability check): the command sends an activation
  prompt, and the model loads and runs `SKILL.md`; `/skills` browses the
  skill catalog.
- `/plan` `/goal` `/feedback` `/permission`: come from the DSH command
  registry, merged into the `/` menu with the composition.
- **The Goals/Todos panel appears automatically**: when the model writes a
  goal/todo, it renders live above the input box (🎯 goal + phase badge +
  a tree of up to 8 todo lines) with no action needed; it auto-hides
  completed items once the agent is idle.

### 4.9 MCP / Workspace / Other

- `/mcp`: lists `mcp__server__tool` grouped by server; shows a
  `cordis.patch.yml` insertion example when nothing is configured.
- `/workspace`: `resume` / `rename <name>` / `open <path|file:// URI>`
  (opens and starts a new session); the `dsh-tui <path>` launcher also
  accepts a workspace target. Relative paths are resolved by the current
  workspace plugin.
- `/doctor` self-check: Node/platform, API key, model routing, cwd, context
  window, session storage, plugin host.
- `/provider` interactive wizard for adding a model provider (the key is
  written to `~/.dsh/.credentials.yaml` with mode 0600; the interface only
  shows `••••••`).
- `/init` creates AGENTS.md; `/agents` lists subagents; `/login` `/logout`
  manage credentials;
  `/permissions` `/add-dir` explain permissions; `/hooks` `/vim` `/connect`
  are placeholders (DSH has no equivalent mechanism, and each gives a clear
  explanation).

---

## 5. Interface and Status Bar

An empty session shows the whale logo area at the top (it disappears as the
conversation scrolls):

- **Intro animation** (~3.4s, plays once): blink → 6× water spouts →
  tail-wag, then settles into a static whale.
- Text column to the right of the whale: `✦ dsh-TUI v<version>` → a 5-line
  block-letter `DEEPSEEK / HARNESS` wordmark (brand-blue gradient)
  → current model + effort → working directory → a **startup hint row**
  (`/model` to switch models · `/help` for commands · `Tab` to
  autocomplete).
  If the dsh engine version is outside the validated range, one extra
  **⚠ version-drift warning** line appears below the hint (newer / older /
  mixed / broken forms, with an `npm i -g @deepseek-ai/dsh@<version>`
  alignment command).
- A centered welcome line below the whale: "Explore the uncharted!"
- The whale **hides below 64 columns**, leaving only the text column.

### 5.2 Bottom Status Bar (three rows below the input box)

**Row 1 — segmented context progress bar** (`/settings → statusBar.contextBar`,
off by default)
Colored by content type: system dark blue / prompt navy / assistant indigo /
thinking brand blue / tools light blue,
with a right-edge readout like `ctx 12.3k/1.0M 1.2% 988.9k` (auto-shortened
on narrow terminals).

**Row 2 — 状态字段行**（每个字段独立开关，见 `/settings`）
- 左组：模型 → TPS → thinking 推理等级 → mode 会话模式 → ctx 上下文占用 → cache 缓存命中率 → tokens（`1.2k→340` 输入→输出）
- 右组：git 分支 → 工作目录（紧凑模式仅 basename）→ 会话标题 → 短会话 ID（`#` + 前 8 位，与日志文件名对应，方便 `--resume` 定位）
- `statusBar.compact` 时左右合并为单行。
- 默认开：compact / model / thinking / cwd / contextUsage / cache；默认关：tokens / tps / gitBranch / sessionTitle / sessionId / mode / contextBar / activity / trajectory。

**Row 3 — hint / working activity + mini trajectory bar**
- Shows `? for shortcuts` while idle, `esc to interrupt` while a turn is
  running, and `esc to return to input` during message selection.
- While idle (with `statusBar.activity` on), shows a **working-activity
  summary**: an animated frame character + an ice-blue sweep;
  at ≥80% context pressure it shows an amber `⚠ context N%`, turning red at
  ≥95%; while a turn is running it replaces the classic spinner (with a
  token-direction suffix).
- The **mini trajectory bar (MiniWake)** on the right
  (`statusBar.trajectory`, off by default): projects the whole session onto
  a dozen-or-so density glyphs,
  `▁▂▃▄▅▆▇█`, colored by channel (input/tool/model), failure columns tint
  red and rise; 16 cells at ≥120 columns / 12 at ≥100 / 8 at ≥84 / hidden
  below that.
  Before first use, a `ctrl+t` hint appears next to the bar; it retires
  permanently once the trajectory scene has been opened.

**TPS gauge** (`statusBar.tps`, off by default)
Shows a 1/8-cell live gauge + `N tps` while streaming; after the turn ends,
shows a min-max sparkline over the last 12 samples.
Speed color coding: **≥50 green / ≥20 yellow / <20 red**.

### 5.3 `/settings` Editor

`/settings` opens the plugin settings editor; **edits are staged**: `s` to
save / `d` to discard / `Esc` discards the dirty draft on exit.
The dsh-tui section itself (written to the user layer of settings.yaml,
takes effect live) has 19 fields:

| Field | Notes |
|---|---|
| lang | 界面语言 zh/en（DSH_TUI_LANG 钉死时不可改） |
| whale | 开屏头部像素鲸鱼娘（默认开） |
| diffLayout | Edit/Write diff 布局：auto（≥110 列双栏）/ split / unified |
| thinkingFold | 思考块：preview（流式 2-3 行预览 + 落定折叠）/ full（展开到轮末） |
| toolBackground | 工具卡背景强调：none / subtle / strong |
| statusBar.* | 上表全部状态栏开关（compact/model/thinking/cwd/contextUsage/cache/tokens/tps/gitBranch/sessionTitle/sessionId/mode/contextBar/activity/trajectory；statusBar.sessionId 是底栏显示开关，与 cordis 的启动 sessionId 无关） |

Namespaces without a declared TUI section are listed read-only; edit
`~/.dsh/settings.yaml` by hand for those.
provider / model / cwd / effort / fullscreen / preset / workspace /
sessionId / modes
**are not in /settings** — change them in
`$DSH_HOME/profiles/dsh-tui/cordis.patch.yml`.

### 5.4 Terminal Requirements

- Requires an interactive TTY; Windows Terminal is recommended (≥110
  columns, monospace, TrueColor).
- The ⌘ modifier on macOS needs an extended keyboard protocol (iTerm2 /
  kitty / WezTerm / ghostty / tmux); use Ctrl in Terminal.app.
- VS Code: use the companion extension `dsh-tui-vscode` (on the
  Marketplace, backed by a real integrated terminal), or run `dsh-tui`
  directly in the integrated terminal.
- Environment self-check: `/doctor`.

---

## 6. Model / Preset / Theme / Language

| Item | Command | Notes |
|---|---|---|
| Model | `/model` | Picker; **switching = fork the session and continue** (history kept, only the route changes); persisted to `~/.dsh-tui/model.json`, carried over on restart and `/new` |
| Reasoning effort | `/effort` | Slider (←/→ live) or `/effort <id>`; `/effort status` shows the current tier |
| Agent preset | `/preset` | `standard` / `code` / `minimal` / `cordis` + **Liangshen mode `liangshen`**; **cannot be switched once the session has started** (blank-only) |
| Theme | `/theme` | `auto` (follows the terminal background via OSC 11) / `light` / `dark` / `dark-ansi`; `/theme <name>` switches directly; `/theme status` shows the resolution result |
| Custom theme | manual | `~/.dsh-tui/themes/<name>.json`, `{base, colors}` format, hot-switches on selection; a theme named `auto` is shadowed by the built-in one |
| Language | `/lang` | English UI; `/lang zh` is a compatibility alias. Priority `DSH_TUI_LANG` > settings.yaml > cordis.yml > persisted choice |
| Status-row animation | `/activity` | Picker, or `/activity frames <name>`; 30 frame names (default `moon8`, `random` for a random pick) |

**Theme priority**: `DSH_TUI_THEME` > `~/.dsh-tui/theme.json` > OSC 11
terminal-background detection > dark fallback.

**`~/.dsh-tui/` preference files** (all best-effort, a corrupt file falls
back to defaults): `theme.json`, `model.json`,
`agent-preset.json`, `effort.json`, `working-activity.json`, `lang.json`,
`trajectory.json` (the hint-retired marker),
`resume.txt` / `last-used.json` (session resume), `themes/<name>.json`
(custom themes).

**Common environment variables**: `DSH_TUI_LANG`, `DSH_TUI_THEME`,
`DSH_TUI_PRESET`, `DSH_TUI_PERSONA`,
`DSH_TUI_DISABLE_MOUSE`, `DSH_TUI_RESUME_SESSION`, `DSH_TUI_WORKSPACE_TARGET`,
`DSH_TUI_SESSION_ROOT`,
`DSH_TUI_DEBUG`, `DSH_TUI_RENDER_LOG` (frame forensics, may contain
sensitive content), `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`,
`VISUAL`/`EDITOR` (the `Ctrl+G` external editor), `DSH_PERMISSION_MODE`. The
former `CC_TUI_*` / `DSH_CC_*` names have been renamed (a warning is printed
at startup if they're still set).

---

## 7. Common Tips

> Distilled from a deep dive through the code and docs; this is also the
> source pool for the startup hint and `/tips`.

**Getting started**
1. Press `?` (with an empty input box) any time to see the keybinding menu;
   type `/` to see all commands — both support Tab completion.
2. Not sure the environment is set up right? Run `/doctor` first; use
   `/status` for the full session picture.
3. The interface is English. `/lang` reports the language code; `/lang zh`
   is accepted for compatibility and still shows English.

**Efficiency**
4. **While the model is working**: `Enter` slips in a next step (steer),
   `Tab` queues a follow-up instruction, `Ctrl+Enter` interrupts and sends
   right away — no need to wait for the turn to finish.
5. `Alt+Up` pulls the last unhandled message back into the input for
   editing, no need to retype it.
6. Want to ask something quickly without interrupting the main turn or
   leaving a history trace: `/btw <question>`.
7. Made a typo and want a do-over: **double-press Esc on an empty input for
   time rewind**, pick your message, edit, and resend; `/rewind` does the
   same thing.
8. For long input, use `Ctrl+G` to pop open `$VISUAL` and write there — it
   fills back in on save.
9. `@` completes files anywhere in a message: a plain fragment uses
   **fuzzy matching** (`@ink` also matches `src/ink/Box.js`), while a
   path-shaped input (`@src/` `@./` `@~/`) **jumps straight to that
   directory**; directories can be drilled into further; image paths
   automatically become `[Image #N]` attachments.
10. Want to keep an eye on a subagent: **open the subagent panel with
    `Ctrl+A`**, `Enter` for details, `X` to interrupt a running one.

**Inspection and diagnostics**
11. `Ctrl+O` expands/collapses tool-card details (full thinking text,
    arguments and output); `Ctrl+E` expands hidden older messages.
12. `Ctrl+R` searches input history (repeat the press to jump to the next
    match); in transcript view, `/` does full-text search + `n`/`N` to
    jump.
13. `Ctrl+T` opens the trajectory view: `[`/`]` jump to a failure point,
    `/` for a field query (`tool:` `kind:` `err:` `>10s` `tok>1k`).
14. Status-bar items like the context bar, TPS, trajectory bar, and git
    branch are all toggles under `/settings → statusBar.*` — the
    off-by-default `tps`/`trajectory`/`contextBar` are worth trying.
15. At ≥80% context pressure, the working-activity row turns amber as a
    warning, and red at ≥95% — time to `/compact`.
    (`/compact` isn't available under the minimal preset.)

**Personalization**
16. `/theme` switches themes; `auto` follows the terminal background. For a
    custom palette, write
    `~/.dsh-tui/themes/<name>.json` (`{base, colors}`) — it hot-switches on
    selection.
17. `/preset liangshen` — Liangshen mode: a minimal tool set on the first
    turn, opens the full directory after the first tool call (**only takes
    effect on a new session**).
18. The `/effort` slider's `←/→` adjusts reasoning effort live;
    `/activity frames comet` changes the status-row animation
    (30 frame names, `random` for a random pick).
19. Switching `/model` forks and continues the conversation (history kept),
    and persists across restart and `/new` — feel free to switch models.
20. Too many sessions? In `/resume`, `Ctrl+S` folds subagent runs and
    `Ctrl+X` cleans up empty-shell sessions.
21. With an active text selection, the wheel **pans the selection** instead
    of scrolling the list — press `Esc` to clear the selection first if you
    want to scroll.

**避坑**
22. `/compact`、`/model` 在回合运行中会被拒绝——先 `Ctrl+C` 或等回合结束。
23. 审批条 `Esc` = 拒绝（fail closed）；问卷第 2 题起 `Esc` = 返回上一题，第 1 题 `Esc` 或任意题 `Ctrl+C` = 取消整批（模型会收到取消信号）。
24. `/update` 只更新 profile runtime 不动全局安装；提示版本错位时按提示执行
    `npm install -g @deepseek-harness-tui/dsh-tui@<版本>` 对齐启动器。
25. macOS 的 ⌘ 键需要 iTerm2/kitty/WezTerm/ghostty/tmux；Terminal.app 用 Ctrl 即可。
26. 鼠标拖选即复制（fullscreen 模式）；`DSH_TUI_DISABLE_MOUSE=1` 可临时关闭鼠标。
27. logo 页出现 **⚠ 版本漂移警告**时按提示对齐 dsh 引擎：
    `npm i -g @deepseek-ai/dsh@<版本>`（支持范围见 §1.1）。

---

> This document was assembled from the code and existing docs; documentation
> gaps found along the way (`/rewind` `/effort` `/settings`
> `/skills` and other commands missing from the README command table,
> `Ctrl+P` missing from the keybinding table, hardcoded English status-bar
> hints, `docs/vscode.md` version numbers lagging, etc.) are backlog items
> for a future documentation pass.
