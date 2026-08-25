/**
 * A condensed tips pool — shared by the startup-screen rotation (LogoV2)
 * and the `/tips` command panel.
 *
 * Design conventions:
 * - Each tip is one sentence, roughly ≤100 characters, readable on a single
 *   line on the startup screen (narrow terminals truncate automatically);
 * - Copy only describes actions the user can act on immediately, not
 *   implementation details;
 * - `id` is stable (the panel dedupes/sorts by it); `group` drives the
 *   `/tips` panel's grouped display;
 * - Shares its source of truth with docs/user-guide.md: the doc is the
 *   detailed version, this is the condensed one, covering every feature.
 */

export type TipGroup = 'keys' | 'commands' | 'workflow' | 'display' | 'pitfalls'

export interface Tip {
  id: string
  group: TipGroup
  en: string
}

export const TIP_GROUP_LABELS: Record<TipGroup, string> = {
  keys: 'Shortcuts',
  commands: 'Commands',
  workflow: 'Workflow',
  display: 'Display',
  pitfalls: 'Gotchas',
}

export const TIPS: readonly Tip[] = [
  // ── Shortcuts ─────────────────────────────────────────────
  {
    id: 'keys-rewind',
    group: 'keys',
    en: 'Double-Esc on empty input rewinds time; edit and resend',
  },
  {
    id: 'keys-esc-levels',
    group: 'keys',
    en: 'Esc closes layers: help → command/file menus → clear input',
  },
  {
    id: 'keys-ctrl-o',
    group: 'keys',
    en: 'Ctrl+O expands thinking text and tool details',
  },
  {
    id: 'keys-ctrl-r',
    group: 'keys',
    en: 'Ctrl+R searches input history; press again for next match',
  },
  {
    id: 'keys-ctrl-t',
    group: 'keys',
    en: 'Ctrl+T opens the session trajectory scene (same as /trace)',
  },
  {
    id: 'keys-traj-fail',
    group: 'keys',
    en: 'In trajectory: [ / ] jump failures, { / } jump turns',
  },
  {
    id: 'keys-traj-query',
    group: 'keys',
    en: 'In trajectory, / queries fields like tool:, err:, >10s, tok>1k',
  },
  {
    id: 'keys-ctrl-g',
    group: 'keys',
    en: 'Ctrl+G edits your input in the $VISUAL/$EDITOR editor',
  },
  {
    id: 'keys-ctrl-enter',
    group: 'keys',
    en: 'Ctrl+Enter interrupts the turn and sends immediately',
  },
  {
    id: 'keys-shift-enter',
    group: 'keys',
    en: 'Shift+Enter inserts a newline; Ctrl+J works when modifiers are lost',
  },
  {
    id: 'keys-ctrl-e',
    group: 'keys',
    en: 'Ctrl+E: line end in input; reveals old messages in transcript',
  },
  {
    id: 'keys-ctrl-l',
    group: 'keys',
    en: 'Ctrl+L clears and force-redraws a garbled screen',
  },
  {
    id: 'keys-ctrl-p',
    group: 'keys',
    en: 'Ctrl+P toggles the startup loaded-context panel',
  },
  {
    id: 'keys-home-end',
    group: 'keys',
    en: 'Home/End jump to line start/end; Ctrl+E to line end',
  },
  {
    id: 'keys-ctrl-a',
    group: 'keys',
    en: 'Ctrl+A opens the subagent dashboard; Enter details, X interrupt, Esc close',
  },
  {
    id: 'keys-edit-keys',
    group: 'keys',
    en: 'Ctrl+U/K/W delete to line start, end, or previous word',
  },
  {
    id: 'keys-shift-tab',
    group: 'keys',
    en: 'Shift+Tab cycles modes: default → plan → full access',
  },
  {
    id: 'keys-shift-up',
    group: 'keys',
    en: 'Shift+↑ enters message selection; Enter expands one row',
  },
  {
    id: 'keys-help',
    group: 'keys',
    en: 'Press ? anytime for the shortcut menu (empty input)',
  },
  {
    id: 'keys-paste',
    group: 'keys',
    zh: 'Ctrl+V 或 Alt+V 粘贴文本、文件路径或图片附件；/settings 可改快捷键',
    en: 'Ctrl+V or Alt+V pastes text, file paths, or image attachments; remappable in /settings',
  },
  {
    id: 'keys-slash-search',
    group: 'keys',
    en: 'In transcript mode, / searches; n / N jump between hits',
  },
  {
    id: 'keys-mouse-click',
    group: 'keys',
    zh: '工具卡/thinking/摘要点击展开，子代理卡点击看详情；输入框点击定位光标',
    en: 'Click tool/thinking/summary rows to fold; subagent cards open detail; click input to move caret',
  },
  {
    id: 'keys-mouse-scenes',
    group: 'keys',
    zh: '轨迹与 /settings 支持鼠标：行点击跳转/编辑，滚轮移动光标或焦点',
    en: 'Trajectory and /settings take the mouse: row clicks jump/edit, the wheel moves cursor or focus',
  },

  // ── Commands ──────────────────────────────────────────────
  {
    id: 'cmd-new-resume',
    group: 'commands',
    en: '/new starts a session; /resume brings back old ones',
  },
  {
    id: 'cmd-resume-search',
    group: 'commands',
    en: 'In /resume, just type to search sessions',
  },
  {
    id: 'cmd-rename',
    group: 'commands',
    en: '/rename <title> gives the session a proper name',
  },
  {
    id: 'cmd-clear',
    group: 'commands',
    en: '/clear wipes the view, not the log',
  },
  {
    id: 'cmd-compact',
    group: 'commands',
    en: '/compact condenses context — a lifesaver for long sessions',
  },
  {
    id: 'cmd-export',
    group: 'commands',
    en: '/export saves the full session as Markdown (thinking included)',
  },
  {
    id: 'cmd-btw',
    group: 'commands',
    en: '/btw asks aside: no interruption, no history',
  },
  {
    id: 'cmd-status',
    group: 'commands',
    en: '/status shows model, branch, tokens, and context usage',
  },
  {
    id: 'cmd-cost',
    group: 'commands',
    en: '/cost shows token usage and cache hit rate',
  },
  {
    id: 'cmd-context',
    group: 'commands',
    en: '/context lists the loaded context in detail',
  },
  {
    id: 'cmd-doctor',
    group: 'commands',
    en: '/doctor checks your environment — run it first when stuck',
  },
  {
    id: 'cmd-config',
    group: 'commands',
    en: '/config shows config sources and how you launched',
  },
  {
    id: 'cmd-model',
    group: 'commands',
    en: '/model forks to continue: history is preserved',
  },
  {
    id: 'cmd-effort',
    group: 'commands',
    en: '/effort slider tunes reasoning effort live with ←/→',
  },
  {
    id: 'cmd-thinking',
    group: 'commands',
    en: '/thinking toggles expanded thinking display',
  },
  {
    id: 'cmd-tokens',
    group: 'commands',
    en: '/tokens shows token details and context percentage',
  },
  {
    id: 'cmd-preset',
    group: 'commands',
    en: '/preset switches presets: standard/code/minimal/cordis/liangshen',
  },
  {
    id: 'cmd-preset-liangshen',
    group: 'commands',
    en: '/preset liangshen starts minimal, then opens up',
  },
  {
    id: 'cmd-settings',
    group: 'commands',
    en: '/settings customizes the status bar: TPS, trajectory, context bars',
  },
  {
    id: 'cmd-workspace',
    group: 'commands',
    en: '/workspace open <path> switches the workspace',
  },
  {
    id: 'cmd-skills',
    group: 'commands',
    en: '/skills lists the skill catalog',
  },
  {
    id: 'cmd-audit',
    group: 'commands',
    en: '/audit runs a code audit; /review reviews the code',
  },
  {
    id: 'cmd-vuln',
    group: 'commands',
    en: '/vuln-check scans dependencies; /bug drafts a bug report',
  },
  {
    id: 'cmd-init',
    group: 'commands',
    en: '/init creates AGENTS.md project rules',
  },
  {
    id: 'cmd-provider',
    group: 'commands',
    en: '/provider adds your own model provider interactively',
  },
  {
    id: 'cmd-login',
    group: 'commands',
    en: '/login shows credential status; /logout signs out',
  },
  {
    id: 'cmd-mcp',
    group: 'commands',
    en: '/mcp lists MCP servers and their tools',
  },
  {
    id: 'cmd-plugins',
    group: 'commands',
    en: '/plugins check <manifest> diagnoses plugin compatibility',
  },
  {
    id: 'cmd-update',
    group: 'commands',
    en: '/update updates the TUI and restarts, resuming the session',
  },
  {
    id: 'cmd-permission',
    group: 'commands',
    zh: '/permission 弹出权限预设选择器（只读/工作区读写/完全访问）',
    en: '/permission opens the permission-preset picker (read-only/workspace-write/full)',
  },
  {
    id: 'cmd-plan-goal',
    group: 'commands',
    en: '/plan enters plan mode; /goal sets a session goal',
  },

  // ── Workflow ──────────────────────────────────────────────
  {
    id: 'flow-steer',
    group: 'workflow',
    en: 'While working: Enter steers, Tab queues, Ctrl+Enter interrupts',
  },
  {
    id: 'flow-alt-up',
    group: 'workflow',
    en: 'Alt+Up retrieves the last message to edit and resend',
  },
  {
    id: 'flow-rewind-fork',
    group: 'workflow',
    en: 'Rewind forks a session; your message returns to the input',
  },
  {
    id: 'flow-tree',
    group: 'workflow',
    zh: '/tree 打开会话分叉树：悬停预览、点击回退/分叉/切分支',
    en: '/tree opens the session tree: hover to preview, click to rewind/fork/adopt',
  },
  {
    id: 'flow-fork-copy',
    group: 'workflow',
    zh: '/fork 把当前会话复制成可恢复副本，原会话不受影响',
    en: '/fork copies the session into a resumable twin; the original is untouched',
  },
  {
    id: 'flow-resume',
    group: 'workflow',
    en: 'In /resume, Ctrl+S folds subagent runs',
  },
  {
    id: 'flow-search',
    group: 'workflow',
    en: 'Ctrl+R searches input history; / searches the transcript',
  },
  {
    id: 'flow-at',
    group: 'workflow',
    en: '@ completes files with fuzzy matching; @dir/ lists that directory',
  },
  {
    id: 'flow-question-type',
    group: 'workflow',
    en: 'Typing on a question row submits option + custom text',
  },
  {
    id: 'flow-plan-review',
    group: 'workflow',
    en: 'Plan review: press 1 / 2 to approve or give feedback fast',
  },
  {
    id: 'flow-approval',
    group: 'workflow',
    en: 'Approval bar: 1 allows once, 2 rejects',
  },
  {
    id: 'flow-goals',
    group: 'workflow',
    en: 'Goals/Todos appear automatically when the model writes them',
  },
  {
    id: 'flow-btw-copy',
    group: 'workflow',
    en: 'In /btw, press c to copy the answer',
  },

  // ── Display and personalization ───────────────────────────
  {
    id: 'disp-statusbar',
    group: 'display',
    en: 'TPS, trajectory, context bars are off by default — enable in /settings',
  },
  {
    id: 'disp-statusbar-session-id',
    group: 'display',
    zh: '底栏可显示短会话 ID（# 前 8 位），与日志文件名对应，/settings 里开',
    en: 'Footer can show the short session id (# + 8 chars, matches the log filename) — enable in /settings',
  },
  {
    id: 'disp-statusbar-title',
    group: 'display',
    zh: '底栏可显示会话标题；/rename 随时改',
    en: 'Footer can show the session title; rename anytime with /rename',
  },
  {
    id: 'disp-statusbar-fields',
    group: 'display',
    zh: '底栏字段逐项开关：token 总量、git 分支、模式、活动摘要…… /settings 里配',
    en: 'Footer fields are per-field switches: token totals, git branch, mode, activity — set in /settings',
  },
  {
    id: 'disp-statusbar-compact',
    group: 'display',
    zh: '底栏 compact 开=单行收纳；关=左右分组（指标在左、位置在右）',
    en: 'Footer compact on = one merged line; off = metrics left, location right',
  },
  {
    id: 'disp-statusbar-hint',
    group: 'display',
    zh: "空闲时 '? 查看快捷键' 常驻提示也是底栏开关（shortcutHint）",
    en: 'The idle "? for shortcuts" reminder is itself a footer switch (shortcutHint)',
  },
  {
    id: 'disp-context-warn',
    group: 'display',
    en: 'Context ≥80% turns amber — time to /compact',
  },
  {
    id: 'disp-tps-color',
    group: 'display',
    en: 'TPS gauge: ≥50 green / ≥20 yellow / <20 red',
  },
  {
    id: 'disp-theme',
    group: 'display',
    en: '/theme auto follows your terminal; /theme <name> switches directly',
  },
  {
    id: 'disp-theme-custom',
    group: 'display',
    en: 'Custom themes: ~/.dsh-tui/themes/<name>.json, hot-swappable',
  },
  {
    id: 'disp-theme-status',
    group: 'display',
    en: '/theme status shows which palette auto resolved to',
  },
  {
    id: 'disp-lang',
    group: 'display',
    en: 'The UI is English; /lang zh is a compatibility alias',
  },
  {
    id: 'disp-activity',
    group: 'display',
    en: '/activity frames comet changes the spinner (35 presets)',
  },
  {
    id: 'disp-diff-layout',
    group: 'display',
    en: 'In /settings, diffLayout switches split/unified diff',
  },
  {
    id: 'disp-thinking-fold',
    group: 'display',
    en: 'In /settings, thinkingFold: preview folds, full expands',
  },
  {
    id: 'disp-tool-bg',
    group: 'display',
    en: 'In /settings, toolBackground tunes tool-card emphasis',
  },
  {
    id: 'disp-mouse',
    group: 'display',
    en: 'Drag-select copies instantly in fullscreen; Esc cancels',
  },
  {
    id: 'disp-hover-footer',
    group: 'display',
    zh: '悬停底栏字段：ctx 原地变等宽压力条，明细走常驻底行，布局不动',
    en: 'Hover footer fields: ctx morphs in place into a same-width bar, details on a stable line',
  },
  {
    id: 'disp-wheel-sel',
    group: 'display',
    en: 'With a text selection, the wheel translates the selection, not the list',
  },
  {
    id: 'disp-whale',
    group: 'display',
    en: 'The whale intro shows on terminals ≥64 columns',
  },

  // ── Gotchas ───────────────────────────────────────────────
  {
    id: 'pit-busy',
    group: 'pitfalls',
    en: '/compact and /model refuse while working — Ctrl+C first',
  },
  {
    id: 'pit-esc',
    group: 'pitfalls',
    zh: '审批条 Esc=拒绝；问卷第 2 题起 Esc=上一题，Ctrl+C=取消整批',
    en: 'Esc rejects approvals; question batches use Esc for previous and Ctrl+C to cancel',
  },
  {
    id: 'pit-ctrl-c',
    group: 'pitfalls',
    en: 'Ctrl+C clears input first; double-tap to exit',
  },
  {
    id: 'pit-unknown-cmd',
    group: 'pitfalls',
    en: 'Unknown commands are sent to the model as plain messages',
  },
  {
    id: 'pit-preset-lock',
    group: 'pitfalls',
    en: '/preset only applies to new sessions (blank-only rule)',
  },
  {
    id: 'pit-update',
    group: 'pitfalls',
    en: '/update requires launching via dsh --profile',
  },
  {
    id: 'pit-version-skew',
    group: 'pitfalls',
    en: 'On version skew, follow the npm install -g hint to align the launcher',
  },
  {
    id: 'pit-drift',
    group: 'pitfalls',
    en: 'When the logo warns about dsh versions, follow the npm i -g @deepseek-ai/dsh hint',
  },
  {
    id: 'pit-mac',
    group: 'pitfalls',
    en: 'macOS ⌘ needs iTerm2, kitty, WezTerm, ghostty, or tmux',
  },
  {
    id: 'pit-thinking',
    group: 'pitfalls',
    en: '/thinking does not persist across restarts',
  },
  {
    id: 'pit-minimal',
    group: 'pitfalls',
    en: '/compact and questions are unavailable under minimal preset',
  },
  {
    id: 'pit-mouse-mode',
    group: 'pitfalls',
    zh: '主界面鼠标需开 fullscreen；轨迹/resume 整屏页两种模式都带鼠标',
    en: 'Main-chat mouse needs fullscreen; full-page screens (trajectory, /resume) have it in both modes',
  },
  {
    id: 'pit-env-rename',
    group: 'pitfalls',
    en: 'Legacy CC_TUI_*/DSH_CC_* env vars are now DSH_TUI_*',
  },
  {
    id: 'pit-pnpm',
    group: 'pitfalls',
    en: 'pnpm 10+ is required (pnpm 9 fails at startup)',
  },
  {
    id: 'pit-terminal',
    group: 'pitfalls',
    en: 'An interactive TTY is required; try Windows Terminal ≥110 cols',
  },
]

/**
 * Random rotation pick: each startup grabs one at random, so the splash
 * screen feels fresh every time.
 * `random` can be injected for deterministic tests (defaults to
 * Math.random).
 */
export function pickRandomTip(random: () => number = Math.random): Tip {
  return TIPS[Math.floor(random() * TIPS.length)]!
}

/** Get tips by group (for the `/tips` panel; preserves TIPS order). */
export function tipsByGroup(group: TipGroup): Tip[] {
  return TIPS.filter(tip => tip.group === group)
}
