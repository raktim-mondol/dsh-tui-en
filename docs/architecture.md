# Architecture and Limitations

[Documentation index](README.md)

## Runtime path

```text
Cordis profile
  -> src/index.ts（插件契约与 Schema）
  -> src/dsh-adapter/plugin.ts（服务、Agent、React 生命周期）
  -> DSH Agent / session / tool services
  -> src/dsh-adapter/channel.ts（session/event -> Channel）
  -> src/screens/Chat.tsx（键盘与模式编排）
  -> src/components/*（视图）
  -> src/ui.ts（主题化 renderer facade）
  -> src/ink/* + Yoga（布局、终端协议、差分输出）
  -> ANSI terminal
```

## Module ownership

| Module | Owns |
| --- | --- |
| `src/index.ts` | Cordis 插件名称、注入声明、配置接口与 Schema；保持入口轻量并延迟加载 runtime |
| `src/dsh-adapter/plugin.ts` | TTY 检查、问卷与 Skills 注册、Agent 创建/恢复、React 挂载、统一退出清理 |
| `src/dsh-adapter/channel.ts` | 将 DSH 持久化事件投影为 transcript；提供 submit、steer、resume、rewind、model/preset 等动作 |
| `src/workspaces.ts` | 本地路径 fallback 与通用工作区 provider registry；不得包含任何 provider 的协议、文案或依赖 |
| `src/screens/Chat.tsx` | modal 优先级、全局按键、滚动/搜索/选择状态、slash command 分发 |
| `src/components/` | 用户界面和 design-system；不直接拥有 Agent 或 session 真相 |
| `src/ui.ts` | 主题化 `Box`/`Text`、render、选择、滚动等公共 facade |
| `src/ink/` | 移植的 Ink renderer、终端协议、事件、选择与 Yoga 桥接；属于敏感底层设施 |
| `src/native-ts/yoga-layout/` | 纯 JS/TS 布局实现 |
| `cordis.patch.yml` | profile bundle 层；决定服务行、覆盖关系与挂载顺序 |

Do not duplicate DSH Agent, session, or tool services in a component. Connect new
capability through an existing service, registry, or channel seam.

Workspace extensions follow a one-way dependency: the TUI publishes only a
structural provider interface, while optional plugins register URIs, display
metadata, and command executors. Protocol parsing and external connections
belong entirely to the plugin. Removing a plugin must leave local workspaces
and session flows free of missing configuration, placeholders, or fallback
branches.

## The session log is the source of truth

`channel.ts` does not treat a React-local array as conversation truth. DSH
`session/event` records own:

- initial replay and incremental streaming events;
- assistant/reasoning/tool association and sequence anchors;
- rewind turn boundaries;
- reconstruction after resume, export, compact, and fork.

The Channel keeps a TUI-sized projection. Once a long transcript exceeds its
window, older rows fold into short previews while the complete content remains
in the session log and can be restored from events. Tool results are associated
by `callId`, never guessed from array position.

## Rendering and long-session performance

- **Differential output**: each frame writes only screen changes and uses
  capability detection to choose synchronized output, cursor, and Windows
  Terminal paths.
- **Message virtualization**: off-screen rows use the last measured fixed-height
  placeholder and do not participate in the full layout subtree.
- **Replay coalescing**: consecutive token chunks are merged during history
  replay, avoiding repeated string growth for long streamed messages.
- **Bounded caches**: transcript, render-node, and measurement caches are bounded;
  removing a bound requires measured evidence.
- **Display-cell width**: ANSI escapes, combining marks, emoji, and East Asian
  wide characters use terminal cell width, not JavaScript `string.length`.

When changing `src/ink/` or Yoga, run the CI questionnaire/tool-card regressions
and the affected scroll, resize, copy-on-select, or PTY harness. Do not print
diagnostics to an active TUI's stdout; use stderr `DSH_TUI_DEBUG` or
`DSH_TUI_RENDER_LOG`.

## Inline and fullscreen modes

- **Inline (default)**: content remains on the main screen, and the terminal
  emulator owns scrollback and native text selection.
- **Fullscreen**: `AlternateScreen` switches to the alternate screen, where the
  TUI owns scrolling, mouse selection, OSC 52 copy, and screen restoration.

Both modes share the Channel and React views but use different terminal protocol
paths. Changes involving input, scrolling, mouse, cursor, resize, or cleanup
must be checked in both modes, especially on narrow terminals and Windows
ConPTY.

## Persistence locations

| Path | Contents |
| --- | --- |
| `~/.dsh/sessions/` | Shared JSONL session events for profile TUI and Web |
| `~/.dsh-tui/sessions/` | JSONL session events for direct `cordis.yml` runs |
| `~/.dsh-tui/resume.txt` | Recent session ID used by the Windows launcher and exit hint |
| `~/.dsh-tui/last-used.json` | `/resume` recency metadata |
| `~/.dsh-tui/theme.json` | Current theme selection |
| `~/.dsh-tui/themes/` | User theme JSON files |
| `~/.dsh-tui/working-activity.json` | Activity animation selection |
| `~/.dsh-tui/agent-preset.json` | Default Agent preset for new sessions |

`DSH_TUI_SESSION_ROOT` overrides the JSONL root in either composition. The
profile defaults to `$DSH_HOME/sessions` (normally `~/.dsh/sessions/`);
direct `cordis.yml` runs default to `~/.dsh-tui/sessions/`. Preference files
are optional state: malformed or missing files fall back silently rather than
preventing startup.

The data directory was renamed from `~/.dsh-cc` to `~/.dsh-tui`: on first
launch, if the old directory exists and the new one does not, it is copied
(not moved) to the new location with one notice line; the old directory stays
in place for the user to remove. `resume.txt` is an exception: it is
dual-written to both paths because older launchers only read the old one.

## Permissions and security boundary

`dsh-TUI` does not provide a separate sandbox; it implements the tool-level
approval UI (a CC-style panel answering the `approval/request` waterfall),
while `/permission` preset switching comes from the dsh-base
`permission-presets` row. Effective capability comes from the DSH services
mounted by `cordis.patch.yml`:

- On non-Windows platforms, `DSH_PERMISSION_MODE` defaults to `workspace-write`;
  the filesystem policy requires observed files and the approval policy is
  normally `ask`.
- Windows has no usable local sandbox backend in the current composition, so it
  uses `danger-full-access` and `never` approval to match the terminal trust
  model.
- `DEEPSEEK_API_KEY` should come from the environment or controlled runtime
  injection. Status output only reports presence or a redacted fragment.
- MCP, shell, filesystem tools, and custom presets expand what the model can
  access and should be treated as code-execution surfaces in the same policy
  domain.

Inspect the active profile patch before running in an untrusted repository; the
visual TUI alone does not describe the effective policy.

## Known limitations

- Plugin-source context injected into the system prompt is not shown as a
  separate UI segment; it is included in the system/context meter.
- `/model` switches through a session fork rather than an in-place update; the
  old session remains in `/resume`.
- `Ctrl+V` clipboard reads dispatch per platform: PowerShell `Get-Clipboard` on
  Windows (a competing process can lock the clipboard and make the read appear
  empty after retries), `osascript`/`pbpaste` on macOS, and the first usable of
  `wl-paste`/`xclip`/`xsel` on Linux/Unix (missing tools are skipped, an
  unreachable session falls through to the next candidate, and paste reports
  no usable clipboard tool when all fail). Clipboard images are exported to
  a temp file whose path is inserted (0700 private directory, 0600 file);
  they are not embedded as image blocks.
- Exit restores the terminal and ends the process without waiting for the
  Agent's asynchronous flush; the persistence plugin is the fallback.
- The tool-level approval panel is implemented (approval service + TUI
  answerer); `/permission` preset switching is provided by the dsh-base
  `permission-presets` plugin and works in profile compositions — the bare
  `cordis.yml` mounts only the approval service, not `permission-presets`.
- `/vim`, `/connect`, and `/hooks` are compatibility placeholders,
  not evidence that those DSH capabilities are mounted.
- There is no automated full-flow suite that requires real model credentials;
  CI uses headless rendering and fake services, while live model integration
  still needs a manual check in the target terminal.

## Debugging and verification

| Goal | Method |
| --- | --- |
| Environment and profile | Run `/doctor`, `/config`, and `/permissions` inside the TUI |
| stderr diagnostics | `DSH_TUI_DEBUG=1 dsh --profile dsh-tui` |
| Raw ANSI frames | `DSH_TUI_RENDER_LOG=/path/to/render.log dsh --profile dsh-tui` |
| Theme regression | `node --import tsx/esm scripts/verify-themes.mjs` |

`DSH_TUI_RENDER_LOG` and session exports may contain sensitive content. Redact
them before sharing.
