/**
 * dsh-tui localization — English UI strings.
 *
 * Resolution order mirrors the `/theme` mechanism (see themePrefs.ts):
 *
 *   1. `DSH_TUI_LANG` env var (`en`) — pinned at process start
 *   2. `lang` cordis.yml config key (see Config in index.ts)
 *   3. the persisted `/lang` choice in `~/.dsh-tui/lang.json`
 *   4. the OS locale guess (`LC_ALL` / `LC_MESSAGES` / `LANG`)
 *   5. `en`
 *
 * The dictionary is a flat key → English string map; `t(key, params)`
 * substitutes `{{name}}` placeholders with the given params. Missing keys
 * render the key itself so a typo is visible in the UI instead of silently
 * blank. A persisted `zh` preference is accepted for compatibility but
 * still resolves to these English strings.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './utils/paths.js'

export type Lang = 'en' | 'zh'

const PREFS_DIR = DATA_DIR

/** The languages shipped with the plugin, in display order. */
export const LANGS = ['en'] as const

const dict = {
  // ── channel.ts ───────────────────────────────────────────────────────
  'activity-indicator-already': 'Indicator already set: {{name}}',
  'activity-indicator-switched': 'Indicator switched: {{name}} (saved)',
  'activity-pref-write-failed': 'Cannot write ~/.dsh-tui/working-activity.json, switch not saved',
  'model-pref-write-failed': 'Cannot write ~/.dsh-tui/model.json, the model choice will not survive a restart',
  'model-route-invalid': 'Persisted model route {{provider}}/{{model}} is not advertised by that provider; fell back to {{fallback}}',
  'unknown-activity-preset': 'Unknown preset "{{name}}" · /activity frames to view all',
  'preset-unavailable': 'Preset unavailable — the agent-presets roster is not mounted',
  'preset-agent-running': 'Agent is running, cannot switch preset',
  'preset-not-found': 'Preset "{{id}}" not found · {{err}}',
  'preset-load-failed': 'Preset "{{id}}" failed to load · {{broken}}',
  'preset-already-current': 'Current preset already: {{id}}',
  'preset-pref-write-failed': 'Cannot write ~/.dsh-tui/agent-preset.json, selection not saved',
  'preset-locked-saved-default': 'Session already started, preset locked (current: {{current}}) · Saved as default: {{id}} (applies on /new or next start)',
  'preset-switch-failed': 'Preset switch failed · {{err}}',
  'preset-switched-pref-failed': 'Preset switched: {{id}}, but writing the default preference failed (won\'t persist after restart)',
  'preset-switched-saved': 'Preset switched: {{id}} (saved as default)',
  'mcp-none-configured': 'No MCP servers configured.',
  'mcp-insert-hint': 'Insert one line in the profile patch layer (~/.dsh/profiles/dsh-tui/cordis.patch.yml), e.g.:',
  'mcp-readme-hint': 'See the MCP section of the repo README.',
  'mcp-server-tools': '{{server}} ({{count}} tools): {{tools}}',
  'child-stderr-line': 'Subprocess stderr: {{line}}',
  'child-stderr-line-repeat': 'Subprocess stderr: {{line}} (repeated {{count}}×)',
  'export-title': '# dsh-tui session export',
  'export-time': '- Exported: {{time}}',
  'export-model': '- Model: {{model}}',
  'export-session': '- Session: {{id}}',
  'export-dir': '- Directory: {{cwd}}',
  'mentions-attached': 'Attached {{count}} file reference(s)',
  'mentions-missing': 'References not found: {{paths}}',
  'send-failed': 'Send failed · {{err}}',
  'export-user-section': '## User',
  'export-thinking-section': '## Thinking',
  'export-assistant-section': '## Assistant',
  'export-tool-section': '## Tool · {{name}}',
  'export-result-section': '### Result',
  'agentsmd-project': '## Project',
  'agentsmd-project-body': '(Describe the project\'s goals, structure and conventions here — this file is injected to every agent as workspace context.)',
  'agentsmd-conventions': '## Conventions',
  'agentsmd-convention-read': '- Read the relevant modules before making changes',
  'agentsmd-convention-style': '- Keep consistent with the existing code style',
  'doctor-api-key': 'API key: {{state}}',
  'doctor-key-configured': 'configured',
  'doctor-key-missing': 'not configured (DEEPSEEK_API_KEY)',
  'doctor-model': 'Model: {{model}} · Provider: {{provider}}',
  'doctor-cwd': 'Working directory: {{cwd}}',
  'doctor-context-window': 'Context window: {{window}} tokens',
  'doctor-unknown': 'unknown',
  'doctor-session': 'Session: {{id}}',
  'doctor-config': 'Config: {{candidate}} {{state}}',
  'doctor-config-missing': '(missing)',
  'doctor-storage': 'Session storage: {{dir}} {{state}}',
  'doctor-storage-uninit': '(not initialized)',
  'doctor-legacy-dir': 'Legacy data directory: ~/.dsh-tui still exists (migrated to ~/.dsh-tui; delete it yourself once satisfied)',
  'subagent-not-mounted': 'Subagent service not mounted (leaf has no subagent)',
  'subagent-none': 'No subagents in the current session',
  'subagent-resumable': 'resumable',
  'subagent-oneshot': 'one-shot',
  'subagent-row': '{{mode}} {{label}}{{activity}} · {{id}}',
  'subagent-running': ' running',
  'subagent-archived': ' archived',
  'subagent-query-failed': 'Query failed · {{err}}',
  'subagent-tools': 'Tools',
  'subagent-expand-hint': 'Press Enter to expand full output',
  'subagent-status-running': 'running',
  'subagent-status-completed': 'completed',
  'subagent-status-failed': 'failed',
  'agent-preset-switched': 'Agent preset switched: {{preset}}',
  'context-low-warning': 'Context low ({{percent}}% remaining) · Run /clear or start a new session',
  'rewind-unavailable': 'Rewind unavailable — session services not loaded',
  'rewind-settling': 'Cannot rewind — the turn is still settling, try again in a moment',
  'rewind-fork-failed': 'Cannot rewind to this point · {{err}}',
  'rewind-create-failed': 'Rewind failed — could not create the replacement session',
  'rewind-attach-failed': 'Session rewound, but workspace attachment failed · {{err}}',
  'resume-while-working': 'Cannot resume while a turn is running',
  'resume-unavailable': 'Resume unavailable — agents service not loaded',
  'resume-failed': 'Resume failed · {{err}}',
  'resume-attach-failed': 'Session resumed, but workspace attachment failed · {{err}}',
  'new-session-while-working': 'Cannot start a new session while a turn is running',
  'new-session-unavailable': 'New session unavailable — agents service not loaded',
  'new-session-failed': 'New session failed · {{err}}',
  'new-session-attach-failed': 'Session created, but workspace attachment failed · {{err}}',
  'model-switch-while-working': 'Cannot switch models while a turn is running',
  'model-switch-unavailable': 'Model switch unavailable — session services not loaded',
  'model-switch-fork-failed': 'Cannot switch models · {{err}}',
  'model-switch-failed': 'Model switch failed · {{err}}',
  'model-switch-attach-failed': 'Model switched, but workspace attachment failed · {{err}}',
  'compact-unavailable': 'Compaction unavailable · no compaction service in this leaf',
  'compact-while-working': 'Cannot compact while a turn is running',
  'compact-working': 'Compacting conversation…',
  'compact-done': 'Conversation compacted',
  'compact-nothing': 'Nothing to compact',
  'compact-failed': 'Compaction failed · {{err}}',
  'turn-failed': 'Turn error{{detail}}',
  // ── questions.ts ─────────────────────────────────────────────────────
  'questionnaire-answered': '📋 Questionnaire answered · {{total}} questions',
  // ── customTheme.ts (doc example only) ───────────────────────────────
  'theme-sakura-name': 'Sakura Pink',
  // ── utils/loaded-context.ts ─────────────────────────────────────────
  'context-truncated': '… (truncated)',
  'context-sections': 'System prompt {{n}} sections',
  'context-files': 'Workspace instructions ×{{n}}',
  'context-runtime': 'Runtime context {{n}} items',
  'context-skills': 'Skills {{n}}',
  'context-tools': 'Tools {{n}}',
  // ── screens/Chat.tsx ────────────────────────────────────────────────
  'skill-unavailable': 'Skill {{name}} is gone or not user-invocable',
  'skill-audit-prompt': 'Use the audit skill to do a thorough code audit of the current project, finding security, correctness and quality issues.',
  'skill-bug-prompt': 'Use the bug skill to help me write a complete bug report (symptoms, reproduction steps, expected behavior).',
  'skill-practice-prompt': 'Use the practice skill to run a round of programming practice with me.',
  'skill-review-prompt': 'Use the review skill to do a thorough code review of the current project.',
  'skill-pr-comments-prompt': 'Use the pr-comments skill to review pull request comments on the current branch and suggest improvements.',
  'skill-release-notes-prompt': 'Use the release-notes skill to generate release notes for the current project.',
  'skill-vuln-check-prompt': 'Use the vuln-check skill to run a security vulnerability check on the current project.',
  'context-loaded': 'Context loaded',
  'context-panel-expand': 'Expand',
  'context-panel-collapse': 'Collapse',
  'copied-chars': 'Copied {{n}} characters',
  'activity-usage-name': '/activity frames <name>',
  'activity-current-preset': 'Current preset  {{name}}',
  'activity-switch-hint': 'Switch      /activity (picker) or /activity frames <name>',
  'activity-persist-hint': 'Persisted    ~/.dsh-tui/working-activity.json (survives restart)',
  'activity-current-direct': 'Current preset: {{name}} · /activity frames <name> to switch directly:',
  'activity-random-each': 'random each time',
  'activity-current-marker': '  ← current',
  'activity-usage': 'Usage: /activity | /activity frames <name> | /activity status',
  'preset-current': 'Current preset  {{name}}',
  'preset-roster-missing': '(roster not mounted)',
  'preset-switch-hint': 'Switch        /preset (picker) or /preset <id>',
  'preset-persist-hint': 'Persisted      ~/.dsh-tui/agent-preset.json (survives restart; cordis.yml preset wins)',
  'preset-lock-hint': 'Lock rule     started sessions cannot switch (official blank-only rule)',
  'preset-roster-unmounted': 'The agent-presets roster is not mounted (presets unavailable)',
  'theme-name-arg': '/theme <name>',
  'theme-current': 'Current theme  {{name}}',
  'theme-switch-hint': 'Switch      /theme (picker) or /theme <name>',
  'theme-persist-hint': 'Persisted    ~/.dsh-tui/theme.json (survives restart; DSH_TUI_THEME wins)',
  'theme-custom-hint': 'Custom      ~/.dsh-tui/themes/<name>.json (see README "Custom themes")',
  'theme-auto-resolved': 'Auto-resolved  currently {{name}} (follows terminal background)',
  'theme-switched-saved': 'Theme switched: {{name}} (saved)',
  'theme-unknown': 'Unknown theme "{{name}}" · /theme to view all',
  'status-model': 'Model   {{model}}',
  'status-working': 'working',
  'status-idle': 'idle',
  'status-state': 'Status   {{state}}',
  'status-session': 'Session   {{id}}',
  'status-dir': 'Directory   {{cwd}}',
  'workspace-picker-title': 'Workspace',
  'workspace-picker-hint': '**Enter** switch and start a new session · Esc to exit · or type /workspace open <path-or-URI>',
  'workspace-none': 'No workspaces available',
  'workspace-list-failed': 'Failed to list workspaces · {{err}}',
  'workspace-uri-invalid': 'Cannot resolve workspace target: {{uri}}',
  'workspace-uri-failed': 'Failed to load workspace · {{err}}',
  'workspace-switch-working': 'Cannot switch workspaces while the agent is running',
  'workspace-open-invalid': 'Cannot open workspace: {target} is not an existing directory',
  'workspace-switched': 'Workspace switched: {{target}}',
  'workspace-flow-hint': '**Enter** select · Esc to exit',
  'workspace-flow-edit-hint': '**Enter** select current directory · Tab enter a path · Esc to exit',
  'workspace-flow-input-hint': 'Enter an absolute path · **Enter** load directory · Esc back',
  'workspace-flow-input-empty': 'Directory path cannot be empty',
  'workspace-flow-loading': 'Connecting and loading directories… · Esc to close',
  'workspace-command-usage': 'Usage: /workspace resume | rename <name> | open <path-or-URI>{{commands}}',
  'workspace-open-usage': 'Usage: /workspace open <path-or-URI>',
  'workspace-rename-usage': 'Usage: /workspace rename <name>',
  'workspace-command-unknown': 'Unknown workspace subcommand: {{command}}',
  'workspace-command-empty': 'This workspace action has no available targets',
  'workspace-command-failed': 'Workspace action failed · {{err}}',
  'workspace-renamed': 'Workspace renamed: {{title}}',
  'workspace-rename-failed': 'Failed to rename workspace · {{err}}',
  'cost-cache-rate': 'Cache rate {{rate}}% · {{read}} read / {{write}} write',
  'cost-context': 'Context {{pct}}%',
  'status-title': 'Title   {{title}}',
  'cost-cache-hit-rate': 'Cache hit rate {{rate}}% · cache {{read}} read / {{write}} write',
  'cost-note': 'Note: DSH provides no API cost metering; the above is token usage (billed by your provider)',
  'doctor-example-config': 'Example config  {{path}}',
  'doctor-user-config': 'User config  {{path}}',
  'doctor-launch-hint': 'Launch      dsh-tui.cmd / dsh --profile dsh-tui',
  'doctor-route-hint': 'Model route  set by the llm-deepseek block in cordis.yml (/model only hints at restart)',
  'export-failed': 'Export failed (cannot write to working directory)',
  'export-saved': 'Exported: {{target}}',
  'agentsmd-create-failed': 'Failed to create AGENTS.md',
  'agentsmd-exists': 'AGENTS.md already exists, not overwritten',
  'agentsmd-created': 'Created {{result}}',
  'login-api-key': 'API key: {{status}}',
  'login-key-configured': 'configured ({{ref}})',
  'login-key-missing': 'not configured (DEEPSEEK_API_KEY)',
  'login-credentials-unavailable': 'unavailable (credentials service unavailable)',
  'login-credential-source': 'Credential source: {{source}}',
  'login-source-none': 'none',
  'login-credential-storage': 'Credential storage: {{mode}}',
  'login-storage-writable': 'writable',
  'login-storage-read-only': 'read-only',
  'login-base-url': 'Base URL: {{url}}',
  'login-official-endpoint': 'official endpoint',
  'login-logout-hint': 'Manage DSH credentials with /provider; for env sources, remove the corresponding environment variable and restart dsh-tui',
  'permissions-policy-hint': 'DSH permission policy is set by fs-policy / bash-sandbox config (current leaf: read/write in workspace, writes need a prior read).',
  'permissions-approval-hint': 'The approval channel is mounted: sandbox escalations (sandbox_permissions) raise an approval bar — Yes allows once, No / Esc rejects.',
  'permissions-preset-hint': '/permission shows and switches permission presets (read-only / workspace-write / danger-full-access).',
  'permissions-root-hint': 'Current filesystem policy is rooted at the working directory: {{cwd}}',
  'permissions-path-hint': 'Relative paths of model tools resolve from this directory; cross-directory access is blocked by fs-policy.',
  'hooks-not-mounted': 'DSH hooks (dsh-hooks-claude / dsh-hooks-codex) are not mounted in this leaf.',
  'hooks-mount-hint': 'Mount the matching hooks plugin in cordis.yml when needed.',
  'update-unavailable': 'Automatic update is unavailable in this launch mode (needs dsh --profile). Run dsh plugin --profile <name> update @deepseek-harness-tui/dsh-tui in a terminal.',
  'update-working': 'The current turn is still running. Wait for it to finish before updating the TUI.',
  'update-starting': 'Updating @deepseek-harness-tui/dsh-tui. The TUI will restart and resume this session when finished…',
  'update-available': 'New version available: v{{latest}} (current v{{current}}) · type /update to update the TUI',
  'update-already-latest': 'Already on the latest version (v{{current}}).',
  'update-check-failed': 'Could not confirm a newer version (network or registry unreachable); attempting the update anyway…',
  'update-refused-deadlock': 'Update cancelled: the mirror registry can only serve v{{latest}}, which deadlocks boot under older global-launcher patches (#183/#307); official latest is v{{authoritative}} — retry /update after the mirror syncs.',
  'update-mirror-lag': 'Mirror registry lag: installing v{{latest}} now; official latest is v{{authoritative}} — run /update again once the mirror syncs.',
  'streaming-folded': '…(first {{count}} chars folded while streaming; full text renders once the turn settles)',
  'vim-not-implemented': 'vim mode not implemented yet',
  'terminal-setup-hint': 'Recommended: Windows Terminal (≥110 columns, monospace, TrueColor).',
  'terminal-paste-hint': '{{mod}}V pastes text, file paths, or images; Ctrl+Shift+V is native terminal paste; right-click paste also works.',
  'connect-none': 'DSH has no remote connection mechanism (CC\'s /connect equivalent is not adapted).',
  'theme-switch-failed': 'Theme "{{name}}" switch failed (cannot write ~/.dsh-tui/theme.json)',
  'interrupt-delivered': 'Interrupted current turn, {{n}} messages processed immediately',
  'btw-usage': 'Usage: /btw <question> — quick side question without interrupting the conversation',
  'btw-answering': 'Answering…',
  'btw-hint-loading': 'Esc cancel',
  'btw-hint-done': '↑/↓ scroll · Space/Enter/Esc dismiss · c copy',
  'btw-llm-unavailable': 'Side question unavailable (llm service not mounted)',
  'exit-press-again': 'Press Ctrl+C again to exit',
  'esc-again-rewind': 'Press Esc again to rewind',
  'esc-again-clear': 'Press Esc again to clear',
  'new-session-started': 'New session started',
  'command-not-found': '/{{name}}: no such command',
  'thinking-toggled': 'Thinking display: {{state}}',
  'thinking-on': 'shown',
  'thinking-off': 'hidden',
  'tokens-usage': 'Tokens: {{in}} in · {{out}} out',
  'tokens-usage-context': '{{usage}} · {{percent}}% of context',
  // ── plugin.ts — boot-time rename notices (issue #120) ───────────────
  'legacy-dir-migrated': 'Data directory copied from ~/.dsh-tui to ~/.dsh-tui (the old directory is kept; delete it yourself once satisfied)',
  'legacy-env-renamed': 'Environment variable {{old}} was renamed to {{new}}; the old name no longer takes effect',
  // ── plugin.ts — /update flow ───────────────────────────────────────
  'update-aborted-no-profile': 'dsh-tui update aborted: no dsh profile resolved.',
  // 0.8.3 launcher alignment bridge: /update only replaces the profile
  // copy; the global `dsh-tui` launcher must be aligned separately.
  'update-launcher-align-unknown': 'The profile is now v{{version}}. If you normally launch with the global dsh-tui command, align the global launcher too:\n  npm install -g @deepseek-harness-tui/dsh-tui@{{version}}',
  'update-launcher-outdated': 'The profile is now v{{profile}}, but the global launcher is still v{{launcher}}. Align it with:\n  npm install -g @deepseek-harness-tui/dsh-tui@{{profile}}',
  // ── components/ActivityLine.tsx ──────────────────────────────────────
  'activity-ctx-warn': '⚠ ctx ',
  // ── components/ActivityPicker.tsx ─────────────────────────────────────
  'activity-random-each-preset': 'random preset each time',
  // ── components/PresetPicker.tsx ──────────────────────────────────────
  'preset-default-tag': ' (default)',
  'preset-broken-tag': ' (failed to load)',
  // ── channel.ts — reasoning-effort notifications ──────────────────────
  'effort-unavailable': 'Reasoning effort switching unavailable (llm service not mounted)',
  'effort-read-failed': 'Failed to read reasoning efforts · {{error}}',
  'effort-single-tier': 'Current model has a single reasoning effort ({{name}})',
  'effort-unsupported': 'Current model does not support reasoning effort switching',
  'effort-switched': 'Reasoning effort → {{name}}',
  'effort-invalid': 'Unknown reasoning effort {{id}} (this model offers: {{ids}})',
  'effort-current': 'Current reasoning effort {{name}}',
  'effort-usage': 'Usage: /effort (slider) | /effort <id> | /effort status',
  // ── channel.ts — Shift+Tab session modes ────────────────────────────
  'mode-switched': 'Mode → {{name}}',
  'mode-default': 'default',
  'mode-plan': 'plan mode',
  'mode-full': 'full access',
  'mode-plan-unavailable': 'The active preset does not register /plan; cannot toggle plan mode',
  // ── components/LogoV2.tsx ───────────────────────────────────────────
  'logo-tagline': 'Explore the uncharted!',
  'logo-tip-prefix': 'Tip: ',
  'logo-tip-more': 'more tips',
  // Upstream-drift notice (merged one-liner under the tip; copy explains
  // the problem AND the fix — the command pins the validated line).
  'logo-drift-newer': 'The dsh engine ({{installed}}) is newer than the {{validated}} this UI is validated against, so issues are possible; downgrade via npm i -g @deepseek-ai/dsh@{{primary}} for stability, or wait for a dsh-tui update.',
  'logo-drift-older': 'The dsh engine ({{installed}}) is older than the {{validated}} this UI is validated against; some features may be missing. Upgrade via npm i -g @deepseek-ai/dsh@{{primary}}.',
  'logo-drift-mixed': 'Mixed dsh engine versions detected ({{installed}}), which can cause odd behavior; unify them via npm i -g @deepseek-ai/dsh@{{primary}}.',
  'logo-drift-broken': 'Unexpected dsh engine versions ({{installed}}); this UI is validated against {{validated}}. Reinstall via npm i -g @deepseek-ai/dsh@{{primary}}.',
  // ── components/PromptInput.tsx ──────────────────────────────────────
  'input-sent-after-turn': 'Sent, processed after the current turn',
  'input-interrupted-next': 'Interrupted · processed next',
  'input-queued-after-turn': 'Queued · processed after the turn',
  'input-cannot-retract': 'Cannot retract: the message may already be processed, or this version doesn\'t support it',
  'input-retracted': 'Retracted, editable and resendable',
  'input-empty': 'Empty input, nothing to send',
  'input-interrupt-immediate': 'Interrupted current turn, processing immediately',
  'input-clipboard-empty': 'Clipboard is empty',
  'input-editor-unavailable': 'Error: No editor configured. Set $VISUAL or $EDITOR environment variable.',
  'input-editor-failed': 'External editor failed: {{name}}',
  'input-clipboard-read-failed': 'Failed to read the clipboard',
  'input-clipboard-unavailable': 'Cannot read clipboard: no usable wl-paste / xclip / xsel (not installed or session unreachable)',
  'input-clipboard-image-saved': 'Clipboard image saved to a temp file; path inserted',
  'input-image-pasted': 'Pasted image {{token}}',
  'input-image-paste-failed': 'Could not paste image: {{err}}',
  'input-pending-steer-label': 'Steer · delivered next',
  'input-pending-queue-label': 'Queued · delivered after the turn',
  'input-pending-actions-hint': 'Retract · Esc interrupts and sends immediately',
  // ── components/whaleFrames.ts (frame labels) ────────────────────────
  'frame-blink': 'blink',
  'frame-fin-1': 'fin1',
  'frame-fin-2': 'fin2',
  'frame-spout-1': 'spout1',
  'frame-spout-2': 'spout2',
  'frame-spout-3': 'spout3',
  'frame-spout-4': 'spout4',
  'frame-spout-5': 'spout5',
  'frame-spout-6': 'spout6',
  'frame-tail-1': 'tail1',
  'frame-tail-2': 'tail2',
  'frame-tail-3': 'tail3',
  // ── components/SuggestionCard.tsx (/ command menu · @ file menu) ────
  'sugg-commands-title': 'commands',
  'sugg-files-title': 'files',
  'sugg-count': '{{n}} items',
  'sugg-more-above': '↑{{n}}',
  'sugg-more-below': '↓{{n}}',
  // Second-tier completion child descriptions (/lang /theme /effort /preset /activity children)
  'sugg-status-desc': 'Show the current choice',
  'sugg-lang-en-desc': 'Switch the UI language to English',
  'sugg-theme-auto-desc': 'Follow the terminal background',
  'sugg-theme-builtin-desc': 'Built-in theme',
  'sugg-theme-user-desc': 'User theme ({{base}} base)',
  'sugg-effort-level-desc': 'Reasoning effort level',
  'sugg-activity-frames-desc': 'List or switch frame presets',
  'sugg-activity-frame-desc': 'Animation frame preset',
  // ── dsh-adapter/plugin.ts (/settings fullscreen settings) ────────────
  'settings-fullscreen-restart': 'Fullscreen preference saved — restart dsh-tui to apply',
  // ── components/HelpMenu.tsx ─────────────────────────────────────────
  'help-for-commands': '/ for commands',
  'help-this-help': '? for this help',
  'help-verbose-output': '{{mod}}o for verbose output',
  'help-open-trajectory': '{{mod}}t to open trajectory',
  'help-search-history': '{{mod}}r to search history',
  'help-interrupt': 'ctrl+c to interrupt',
  'help-exit': 'ctrl+d to exit',
  'help-redraw': '{{mod}}l to redraw',
  'help-clear-input': 'esc to clear input',
  'help-history-nav': '↑/↓ for history',
  'help-move-cursor': '←/→ to move cursor',
  'help-word-jumps': '{{mod}}←/→ for word jumps',
  'help-complete-command': 'tab to complete command',
  'help-cycle-mode': 'shift+tab to cycle mode',
  'help-open-editor': 'ctrl+g to open editor',
  'help-fold-todos': '{{mod}}q to fold todos',
  'goal-todo-fold-hint': '{{mod}}q to fold',
  'help-commands-title': 'commands:',
  'help-scroll-hint': '↑/↓ scroll · PgUp/PgDn page · Home/End jump · Esc close',
  'tips-title': 'Usage tips (shortcuts · commands · workflow · display · gotchas)',
  'tips-hint': '↑/↓ scroll · Esc to close',
  // ── components/InterruptedByUser.tsx ────────────────────────────────
  'interrupted-by-user': 'Interrupted ',
  'interrupted-ask-next': '· What should DeepSeek do instead?',
  // ── components/MessageList.tsx ──────────────────────────────────────
  'load-earlier': ' ↑ load earlier messages (full session log; /export for full text) ',
  'show-previous-messages': ' ctrl+e to show {{n}} previous messages ',
  'resume-none-in-cwd': 'No resumable sessions in the current directory',
  // ── screens/SessionBrowser.tsx + screens/Chat.tsx (/resume) ─────────
  'resume-resumed': 'Session resumed',
  'resume-delete-confirm': 'Delete "{{name}}"? The session log is removed permanently.',
  'resume-deleted': 'Deleted session {{name}}',
  'resume-delete-failed': 'Could not delete session {{name}}',
  'resume-rename-placeholder': 'New session name…',
  'resume-rename-failed': 'Could not rename session {{name}}',
  'resume-hint-delete': '**Enter** to delete · Esc to cancel',
  'resume-hint-rename': '**Enter** to save · Esc to cancel',
  'resume-title': 'Resume session',
  // ── screens/Settings.tsx (/settings, issue #165) ───────────────────
  'settings-title': 'Plugin settings',
  'settings-unavailable': 'settings service absent — read-only',
  'settings-empty': 'No configurable plugin settings (no plugin has registered a section)',
  'settings-group-empty': 'No configurable fields in this group',
  'settings-section-unavailable': 'namespace not served',
  'settings-readonly-heading': 'Other settings namespaces (read-only)',
  'settings-readonly-hint': 'No TUI section for these namespaces yet — edit {{path}} by hand',
  'settings-badge-override': 'overridden',
  'settings-badge-restart': 'applies on restart',
  'settings-badge-dirty': 'unsaved',
  'settings-badge-saving': 'saving',
  'settings-badge-failed': 'save failed',
  'settings-field-empty': '(unset)',
  'settings-field-invalid': 'invalid',
  'settings-secret-set': '●●●●●● (configured)',
  'settings-secret-unset': '(not configured)',
  'settings-secret-staged': '(pending save)',
  'settings-saved': 'Saved {{ns}}',
  'settings-save-failed': 'Saving {{ns}} failed — please retry',
  'settings-discarded': 'Discarded all unsaved edits',
  'settings-hint-list': '**Enter** open/edit/toggle · s save · d discard · Esc discard/exit',
  'settings-hint-group': '**Enter** edit/toggle · s save · d discard · Esc back',
  'settings-hint-edit': '**Enter** to confirm · Esc to cancel',
  // ── session browser: rows, counts, filters, preview ───────────────
  'session-loading': 'Reading sessions…',
  'session-list-failed': 'Could not read the session list · {{err}}',
  'session-resume-failed': 'Resuming the session failed · {{err}}',
  'session-when-now': 'just now',
  'session-when-minutes': '{{n}}m ago',
  'session-when-hours': '{{n}}h ago',
  'session-when-days': '{{n}}d ago',
  'session-when-date': '{{month}}/{{day}}',
  'session-children': '{{n}} runs',
  'session-kind-root': 'Conversation',
  'session-kind-fork': 'Rewound branch',
  'session-kind-subagent': 'Sub-agent run',
  'session-project-unknown': '(no directory recorded)',
  'session-scope-all': 'all projects',
  'session-search-placeholder': 'Type to search · {{scope}}',
  'session-count-shown': '{{n}} sessions',
  'session-count-subagents': '{{n}} runs folded',
  'session-count-empty': '{{n}} empty',
  'session-clean-confirm': 'Remove {{n}} sessions that hold no conversation? Their logs are deleted permanently.',
  'session-cleaned': 'Removed {{n}} empty sessions',
  'session-preview-times': 'created {{created}} · last active {{updated}}',
  'session-preview-loading': 'Reading the end of this session…',
  'session-preview-empty': 'No exchanges to preview in this session',
  'session-toggle-on': 'on',
  'session-toggle-off': 'off',
  // Three widths of the same hint. The browser picks the widest that fits the
  // terminal, because a hint that wraps costs the rows the list needs and can
  // push its own tail off the bottom of the screen.
  'session-hint-list': '**Enter** resume · Tab preview · {{mod}}a all projects ({{projects}}) · {{mod}}s runs ({{runs}}) · {{mod}}b this branch · {{mod}}r rename · {{mod}}d delete · {{mod}}x clean · Esc exit',
  'session-hint-list-mid': '**Enter** resume · Tab preview · {{mod}}a projects · {{mod}}s runs · {{mod}}r rename · {{mod}}d delete · Esc exit',
  'session-hint-list-short': '**Enter** resume · Tab preview · Esc exit',
  // ── picker generic keybinding hints (localized as whole sentences; **segments** render as bold key labels) ─
  'hint-confirm-exit': '**Enter** to confirm · Esc to exit',
  'hint-confirm-cancel': '**Enter** to confirm · Esc to cancel',
  'hint-select-exit': '**Enter** to select · Esc to exit',
  'hint-fill-exit': '**Enter** to insert · Esc to exit',
  'hint-rewind-back': '**Enter** to rewind · Esc to back',
  'statusline-hint-select': 'esc to return to input',
  'statusline-hint-working': 'esc to interrupt',
  'statusline-hint-shortcuts': '? for shortcuts',
  'hint-ext-dialog-input': '**Enter** to confirm · Esc to cancel',
  'hint-adjust-done': '**←/→** to adjust · Enter/Esc to done',
  'hint-history-search': '↑/↓ to navigate · **Enter** to select · Esc to cancel',
  'hint-expand-ctrl-o': '(ctrl+o to expand)',
  // ── components/ModelPicker.tsx / ThemePicker.tsx / ActivityPicker.tsx / EffortSlider.tsx ──
  'picker-title-model': 'Model',
  'picker-title-skills': 'Skills',
  'skills-loading': 'Loading skills',
  'skills-loading-subtitle': 'Querying the skill registry…',
  'skills-empty': 'No skills available in this session',
  'skills-load-failed': 'Failed to load the skill list',
  'plugin-scene-crashed': 'Plugin scene "{{id}}" crashed while rendering: {{err}} (closed)',
  'skills-source-bundled': 'built-in',
  'skills-source-user': 'user',
  'skills-source-project': 'project',
  'skills-source-runtime': 'runtime',
  'skills-source-custom': 'custom',
  'picker-title-theme': 'Color theme',
  'picker-title-activity': 'Indicator preset',
  'picker-title-effort': 'Reasoning effort',
  'model-loading': 'Loading models',
  'model-loading-subtitle': 'Querying the provider…',
  'model-switching': 'Switching model to {{name}}…',
  'model-switched': 'Model switched to {{name}}',
  // ── components/RewindPicker.tsx ─────────────────────────────────────
  'rewind-title': 'Rewind',
  'rewind-subtitle': 'Pick a message to rewind the conversation to',
  'rewind-confirm-title': 'Rewind conversation to this message?',
  'rewind-confirm-desc': 'conversation restarts here',
  'rewind-empty': 'No messages to rewind to',
  'rewind-last-message': 'last message',
  'rewind-none': 'Nothing to rewind yet',
  'rewind-done': 'Rewound — edit and press Enter to resend',
  'rewind-mode-default': 'Conversation only',
  'rewind-waiting-plugins': 'Waiting for plugins… (Esc to stop waiting)',
  // ── plugin extension seam (dsh-tui-extensions: decision events + hosted dialogs + keybindings) ──
  'ext-action-cancelled': 'Action cancelled by a plugin',
  'ext-action-handled': 'Input handled by a plugin',
  'ext-decision-pending': 'Waiting for a plugin decision ({{event}})…',
  'ext-stale-dropped': 'Session switched while a plugin decided — the input was dropped',
  'ext-compact-stale': 'Session switched while a plugin decided — compaction abandoned',
  'ext-shortcut-failed': 'Plugin shortcut {{combo}} failed',
  'command-invoke-denied': 'Command invocation denied by the grants file (commands.invoke revoked)',
  'command-invoke-denied-owner': 'Command "/{{name}}" invocation denied — its owner plugin "{{owner}}" lost commands.invoke',
  'plugins-check-tui-extension': 'Note: this manifest relies on the TUI host-extension surface (tui.dsh/v1alpha1 DecisionEvents / session.*.intercept permissions); the verdict used the host extension overlay, not the vendored community registry.',
  // /plugins diagnostics panel (C-070 trust disclosure + negotiation diagnostics)
  'plugins-trust-banner': 'Plugins run in-process with the host: grants are behavioral constraints, not a security boundary; passing validation ≠ a safe plugin (C-070).',
  'plugins-host-unavailable': 'plugin-host row not mounted: Host Descriptor and grant matrix degraded to no-data.',
  'plugins-contract-dropped': 'dropped (vendored hash drift)',
  'plugins-matrix-note': 'Grant matrix (✓ allowed / · denied; plugins with footprints only — union of the grants file, effect ledger, and storage directory):',
  'plugins-matrix-no-registry': '(permission registry unavailable)',
  'plugins-matrix-empty': '(no plugin footprints yet)',
  'plugins-footprint-overflow': '…{{count}} more plugin(s) not shown',
  'plugins-ledger-empty': 'The effect ledger is empty.',
  'plugins-ledger-header': 'Effect ledger ({{file}}), last 5 records:',
  'plugins-unknown-subcommand': 'Unknown subcommand: {{sub}} (supported: check <path>)',
  'plugins-check-usage': 'Usage: /plugins check <path-to-dsh-plugin.json>',
  'plugins-check-not-found': 'File not found: {{path}}',
  'plugins-check-invalid-json': 'Not parseable JSON: {{err}}',
  'plugins-check-spec-unavailable': 'Vendored spec data unavailable (dsh-ecosystem-spec/); cannot validate.',
  'plugins-check-schema-failed': 'Schema validation failed: {{err}}',
  'plugins-check-invalid': 'Semantic validation failed: {{err}}',
  'plugins-check-state': 'Negotiation decision: {{state}}',
  'plugins-check-dropped': '(host descriptor dropped drifted contracts: {{dropped}})',
  'doctor-plugin-generation': 'Plugin runtime generation: {{id}}',
  'doctor-plugin-registry': 'Plugin-spec registry self-check: {{state}}',
  'doctor-plugin-host-missing': 'plugin-host row not mounted',
  'ext-dialog-yes': 'Yes',
  'ext-dialog-no': 'No',
  // ── components/ThinkingToggle.tsx + messages/AssistantThinkingMessage.tsx ──
  'thinking-title': 'Thinking display',
  'thinking-subtitle': 'Only controls whether reasoning is shown; it does not change model behavior.',
  'thinking-enabled': 'Shown',
  'thinking-enabled-desc': 'Show DeepSeek\'s reasoning in the conversation',
  'thinking-disabled': 'Hidden',
  'thinking-disabled-desc': 'Hide reasoning; the model will still think as usual',
  'thinking-label': 'Thinking',
  // ── components/HistorySearchDialog.tsx ──────────────────────────────
  'history-search-title': 'Search history',
  'history-search-placeholder': 'Type to search…',
  'history-search-empty': 'No matching commands',
  'time-now': 'now',
  'time-minutes-ago': '{{n}}m ago',
  'time-hours-ago': '{{n}}h ago',
  'time-days-ago': '{{n}}d ago',
  // ── screens/Chat.tsx (/ transcript search bar) ─────────────────────
  'search-no-matches': 'no matches',
  'rename-usage': 'Usage  /rename <new title>',
  'rename-current': 'Current title  {{title}}',
  'rename-done': 'Renamed to "{{title}}"',
  'compact-summary-folded': 'Summary folded',
  'new-message': '1 new message',
  'new-messages': '{{n}} new messages',
  // ── components/ThemePicker.tsx ──────────────────────────────────────
  'theme-builtin-base': 'Built-in · {{name}} base',
  'theme-auto-base': 'Built-in · follows the system/terminal background (light/dark)',
  'theme-user-base': '{{base}} base · ~/.dsh-tui/themes/{{name}}.json',
  // ── components/LoadedContextPanel.tsx ───────────────────────────────
  'context-unavailable': 'No loaded context is available for this session',
  'context-panel-sections': 'System prompt · {{n}} sections',
  'context-panel-files': 'Workspace instructions · {{n}} files',
  'context-panel-runtime': 'Runtime context · {{n}} items',
  'context-panel-skills': 'Skills · {{n}}',
  'context-panel-tools': 'Tools · {{n}}',
  // ── components/questions/AskUserQuestionPanel.tsx ───────────────────
  'question-select-or-answer': 'Select at least one option, or type an answer on the last line',
  'question-answer-or-check': 'Type an answer or check options before submitting',
  'question-type-answer-first': 'Type your answer before submitting',
  'question-header-progress': ' 📋 Question {{position}}/{{total}} {{remaining}} ',
  'question-remaining-more': ' · {{n}} left',
  'question-hint-type': 'Type answer',
  'question-hint-enter': 'Enter submit',
  'question-hint-back': '↑ back to options',
  'question-hint-esc': 'Esc cancel',
  'question-hint-selected': 'Selected {{n}}',
  'question-hint-select': '↑/↓ select',
  'question-hint-multi': 'Space multi-select',
  'question-hint-attach': 'Type text to attach an answer',
  'question-custom-tab': 'Custom answer',
  'question-attached-label': '(attached: {{label}})',
  'question-direct-input': 'Type directly…',
  // ── components/approvals/ApprovalPanel.tsx ──────────────────────────
  'approval-waiting': ' Awaiting approval · {{tool}} ',
  'approval-proceed': 'Do you want to proceed?',
  'approval-yes': 'Yes, allow once',
  'approval-no': 'No',
  'approval-hint': '↑/↓ select · Enter confirm · Esc reject',
  // ── components/Subagent*.tsx ────────────────────────────────────────
  'subagent-model': 'Model',
  'subagent-duration': 'Duration',
  'subagent-status-label': 'Status',
  'subagent-status-cancelled': 'Cancelled',
  'subagent-count-running': 'running',
  'subagent-count-completed': 'completed',
  'subagent-count-failed': 'failed',
  'subagent-running-label': 'Running',
  'subagent-started': 'Started',
  'subagent-completed': 'Completed',
  'subagent-id': 'ID',
  'subagent-error-label': 'Error',
  'subagent-output-label': 'Output',
  'subagent-no-output': 'No output yet',
  'subagent-dashboard-title': ' Subagent Dashboard ',
  'subagent-dashboard-hint-basic': '↑/↓ browse · Esc close',
  'subagent-dashboard-hint-detail': '↑/↓ select · Enter view detail · Esc close',
  'subagent-detail-hint-basic': '↑/↓ scroll · Enter/Esc back',
  'subagent-detail-hint-enhanced': '↑/↓ scroll · X interrupt · Esc back',
  'subagent-card-prefix': 'Subagent: ',
  'subagent-tab-summary': 'Summary',
  'subagent-no-summary': 'No summary yet',
  'subagent-no-tools': 'No tool calls',
  'subagent-hint-page': 'page',
  'subagent-hint-scroll': 'scroll',
  'subagent-hint-back': 'back',
  'subagent-empty-hint': 'Subagents appear here once the main agent starts Task delegations',
  // ── components/questions/PlanReviewPanel.tsx ────────────────────────
  'plan-review-fallback-header': 'Plan review',
  'plan-review-feedback-placeholder': 'Tell the model what to change…',
  'plan-review-approve-needs-empty': 'Clear the feedback to approve (or press Enter on the input row to send it)',
  'plan-review-hint': '↑/↓ select · 1/2 quick-pick · type feedback · Enter submit · Esc dismiss',
  // ── providerWizard.ts ────────────────────────────────────────────────
  'provider-unavailable': '/provider requires starting through a dsh profile (settings / credentials / llm-pi-ai services not mounted)',
  'provider-q-mode': 'Which kind of model provider do you want to add?',
  'provider-opt-catalog': 'Built-in provider',
  'provider-opt-catalog-desc': 'Built-in catalog such as openai, anthropic, deepseek — endpoint and protocol inherited',
  'provider-opt-custom': 'Custom API endpoint',
  'provider-opt-custom-desc': 'An OpenAI/Anthropic-compatible gateway or self-hosted server',
  'provider-q-catalog': 'Choose a provider',
  'provider-opt-other-route': 'Other (enter a route name)',
  'provider-opt-other-route-desc': 'A catalog route not listed above',
  'provider-q-route-id': 'Enter a route name',
  'provider-q-route-id-detail': 'Lowercase letter first, digits and dashes allowed, e.g. my-gateway',
  'provider-route-id-invalid': 'Invalid route name: must start with a lowercase letter, only lowercase letters / digits / dashes',
  'provider-q-apikey': 'Enter the API key',
  'provider-q-apikey-detail': 'The key is stored in ~/.dsh/.credentials.yaml (mode 0600) and never shown in the transcript',
  'provider-q-baseurl-choice': 'Override the default API endpoint (baseURL)?',
  'provider-opt-baseurl-skip': 'Skip — use the default endpoint',
  'provider-opt-baseurl-input': 'Enter a baseURL now',
  'provider-q-baseurl': 'Enter the baseURL',
  'provider-q-protocol': 'Choose the wire protocol',
  'provider-protocol-completions-desc': 'OpenAI Chat Completions compatible (most gateways)',
  'provider-protocol-responses-desc': 'OpenAI Responses API',
  'provider-protocol-anthropic-desc': 'Anthropic Messages API',
  'provider-discovery-running': 'Discovering the models this endpoint advertises…',
  'provider-discovery-failed': 'Model discovery failed — enter model ids manually instead',
  'provider-q-models': 'Select the models to enable (add more comma-separated on the input row)',
  'provider-q-models-fallback': 'Enter model ids (comma-separated)',
  'provider-models-required': 'A custom endpoint needs at least one model id',
  'provider-q-confirm': 'Write this provider configuration?',
  'provider-route-exists-warning': '⚠ This route is already configured — writing overwrites it',
  'provider-opt-confirm-write': 'Write and enable',
  'provider-opt-confirm-cancel': 'Cancel',
  'provider-line-route': 'Route: {{route}}',
  'provider-line-keyref': 'Key ref: {{ref}} (stored in ~/.dsh/.credentials.yaml)',
  'provider-line-keyref-env': 'Key ref: {{ref}} (already in the process environment, write skipped)',
  'provider-line-baseurl': 'baseURL: {{url}}',
  'provider-line-protocol': 'Protocol: {{api}}',
  'provider-line-models': 'Models: {{models}}',
  'provider-line-models-catalog': 'Models: the whole catalog (not narrowed)',
  'provider-rollback-ok': 'Rolled back the just-written key',
  'provider-rollback-failed': 'Key rollback failed — check ~/.dsh/.credentials.yaml manually',
  'provider-write-failed': 'Failed to write the provider configuration · {{{err}}}',
  'provider-cancelled': 'Provider setup cancelled',
  'provider-success': 'Provider {{route}} added',
  'provider-switch-hint': 'Run /model to switch to the new provider’s models',
  'provider-q-switch': 'Switch to the new provider now?',
  'provider-opt-switch-now': 'Switch to {{model}}',
  'provider-opt-switch-keep': 'Keep the current model',
  // ── commands.ts — slash-command descriptions ─────────────────────────
  // zh-only on purpose: the English text stays in `LOCAL_COMMANDS` (and in
  // the DSH registry for external commands) as the single source of truth,
  // so `localizedDescription` falls back to it whenever the active language
  // has no entry here. `cmd-desc-<name>` keys are resolved at render time,
  // so `/lang` switches apply on the next repaint.
  // Conversation
  // Session / environment
  // Model / display
  // Account / policy
  // Built-in skills
  // Misc
  'cmd-desc-workspace-resume': 'Switch to another workspace',
  'cmd-desc-workspace-rename': 'Rename the current workspace',
  'cmd-desc-workspace-open': 'Open a path or workspace URI',
  // Help / exit
  // Registry-injected (external) commands — zh only; en falls back to the
  // registry's own description, and unlisted externals always fall back.
  // ── /lang command ───────────────────────────────────────────────────
  'lang-current': 'Current language  {{lang}}',
  'lang-switch-hint': 'Switch      /lang en | /lang zh',
  'lang-persist-hint': 'Persisted    ~/.dsh-tui/lang.json (survives restart; DSH_TUI_LANG wins)',
  'lang-switched': 'Language switched: {{lang}} (saved)',
  'lang-unknown': 'Unknown language "{{lang}}" · /lang to view all (en / zh)',
  'lang-switch-failed': 'Language "{{lang}}" switch failed (cannot write ~/.dsh-tui/lang.json)',
  // ── screens/StatusLine.tsx ───────────────────────────────────────────
  'status-cache-label': 'cache ',
  // ── screens/TrajectoryScene.tsx (issue #80 evolution: fullscreen trajectory scene) ──────────
  'traj-title': 'Trajectory',
  'traj-totals': '{{turns}} turns · {{steps}} rows',
  'traj-errors': '{{n}} failed',
  'traj-retries': '{{n}} retries',
  'traj-matches': '{{n}}/{{total}} matched',
  'traj-tab-timeline': 'Timeline',
  'traj-tab-hotspot': 'Hotspot',
  'traj-hot-tools': 'Tools',
  'traj-hot-model': 'Model',
  'traj-hot-turns': 'Turns',
  'traj-sort-duration': 'by duration',
  'traj-sort-count': 'by count',
  'traj-sort-tokens': 'by tokens',
  'traj-proj-sequence': 'even',
  'traj-proj-time': 'wall-clock',
  'traj-proj-compressed': 'compressed',
  'traj-hint-timeline': '**↑/↓** move · **←/→** view · **[ ]** failures · **{ }** turns · **/** query · **m** projection · **enter** detail · **q** exit',
  'traj-hint-hotspot': '**↑/↓** move · **←/→** view · **t** sort · **enter** locate in timeline · **q** exit',
  'traj-hint-query': '**tool:** **kind:** **turn:** **err:** **run:** **>10s** **tok>1k** · bare word = full text · **enter** apply · **esc** clear',
  'traj-hint-expanded': '**j/k** page · **enter/esc** collapse · **q** exit',
  'traj-empty': 'No trajectory events yet',
  'traj-hint-failure': '{{key}} for the full trajectory',
  // ── subagent UI ──────────────────────────────────────────────────────
  'subagent.unnamed': 'Unnamed subagent',
  'subagent.no-model': 'Unknown model',
  'subagent.status.running': 'Running',
  'subagent.status.completed': 'Completed',
  'subagent.status.failed': 'Failed',
  'subagent.status.pending': 'Pending',
  'subagent.dashboard.title': 'Subagent Dashboard',
  'subagent.dashboard.stats': 'Running: {{running}} · Completed: {{completed}} · Failed: {{failed}}',
  'subagent.dashboard.empty': 'No subagents yet',
  'subagent.dashboard.help': '↑↓ select · Enter view details · Esc back',
  'subagent.detail.not-found': 'Subagent not found',
  'subagent.detail.press-esc': 'Press Esc to go back',
  'subagent.detail.output': 'Output',
  'subagent.detail.no-output': 'No output yet',
  'subagent.detail.help': 'Esc back to dashboard',

  // ── dsh-tui-local additions (not present upstream) ────────────────────
  'login-source-hint': 'Source: env var → workspace .env (run.ts fallback)',
  'memory-none': 'DSH has no persistent memory service yet.',
  'memory-hint': 'Long-term conventions can go into AGENTS.md (workspace context) or skills (~/.dsh/skills).',
  'logo-tip-model': 'switch model',
  'logo-tip-help': 'view commands',
  'logo-tip-tab': 'autocomplete',
  'logo-tip-trace': 'trajectory',
  'help-toggle-context': '{{mod}}t to toggle context',
  'session-resume-refused': 'That session could not be resumed — the reason is in the conversation (switching is refused while the model is working)',
  'thinking-mid-warning': 'Changing thinking mode mid-conversation will increase latency and may reduce quality. For best results, set this at the start of a session.',
  'thinking-proceed': 'Do you want to proceed?',
  'trace-title': 'Trace',
  'trace-subtitle': 'Session event timeline · filter: {{filter}} · {{count}} entries',
  'trace-empty': 'No trace events yet',
  'trace-filter-all': 'all',
  'trace-filter-tool': 'tools',
  'trace-filter-thinking': 'thinking',
  'trace-filter-message': 'messages',
  'trace-filter-progress': 'progress',
} as const


export type I18nKey = keyof typeof dict
export type I18nParams = Record<string, string | number>

/** The active language, module-level so non-React modules (channel.ts,
 *  loaded-context.ts) resolve strings without a context. `zh` remains a
 *  valid persisted code for compatibility; strings are English regardless. */
// Resolved at import time (env var → persisted /lang → OS locale → en) so
// direct consumers of t() — repro/verify scripts that never reach
// plugin.apply — still get the pinned language instead of a hardcoded default.
// detectLocaleLang() below always resolves to 'en', so this is always 'en'.
let activeLang: Lang = resolveStartupLang()

/** Emitted on every language switch so React screens can re-render. */
type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to language switches (mirrors themePrefs subscription style). */
export function subscribeLang(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The currently active language. */
export function getLang(): Lang {
  return activeLang
}

/** Switch the active language and notify subscribers. */
export function setLang(lang: Lang): void {
  activeLang = lang
  for (const listener of listeners) listener()
}

/** Is a string a valid shipped language code? */
export function isLang(value: unknown): value is Lang {
  return value === 'zh' || value === 'en'
}

/**
 * Translate a dictionary key into the active language, substituting
 * `{{name}}` placeholders with params. Missing keys render the key itself
 * so a typo is visible instead of silently blank.
 * @param key - Dictionary key (see dict).
 * @param params - Placeholder values.
 */
export function t(key: I18nKey, params: I18nParams = {}): string {
  const template = (dict[key] as string | undefined) ?? key
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Translate a runtime-computed key (e.g. `cmd-desc-${name}`), falling back
 * to the given text when the key is missing — unlike {@link t}, which
 * renders the key itself. Used where the fallback holds the authoritative
 * text (command descriptions live in `LOCAL_COMMANDS` / the DSH registry).
 * @param key - Dictionary key, computed at runtime so it is not type-checked.
 * @param fallback - Text used when no translation exists.
 * @param params - Placeholder values substituted into whichever text wins.
 */
export function tOr(key: string, fallback: string, params: I18nParams = {}): string {
  const entry = (dict as Record<string, string | undefined>)[key]
  const template = entry ?? fallback
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

// ── persistence (~/.dsh-tui/lang.json) ─────────────────────────────────

/**
 * Parse a persisted `{ lang }` value; anything else yields undefined.
 * @param text - Raw file contents.
 */
export function parseLangPref(text: string): Lang | undefined {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const lang = (parsed as Record<string, unknown>).lang
    return isLang(lang) ? lang : undefined
  } catch {
    return undefined
  }
}

/** The persisted `/lang` choice, or undefined when unset or invalid. */
export function readLangPref(dir: string = PREFS_DIR): Lang | undefined {
  try {
    return parseLangPref(readFileSync(join(dir, 'lang.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/** Persist the chosen language (best effort). */
export function writeLangPref(lang: Lang, dir: string = PREFS_DIR): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'lang.json'), JSON.stringify({ lang }, null, 2))
    return true
  } catch {
    return false
  }
}

/**
 * Guess the user's language from the OS locale (`LC_ALL`, `LC_MESSAGES`,
 * `LANG`), defaulting to `en`. Only consulted when nothing else (env var,
 * cordis.yml `lang`, persisted `/lang` choice) pinned a language.
 * This build is English-only: every locale, including an absent locale
 * variable (typical on Windows) or the POSIX/C locale, resolves to `en`.
 */
export function detectLocaleLang(): Lang {
  // `||` (not `??`): an EMPTY locale variable means "unset" and must fall
  // through to the next one — runners and shells sometimes export LC_ALL=''.
  const raw =
    process.env.LC_ALL ||
    process.env.LC_MESSAGES ||
    process.env.LANG ||
    ''
  const locale = raw.split('.')[0]?.toLowerCase() ?? ''
  if (locale.startsWith('en')) return 'en'
  return 'en'
}

/**
 * Resolve the startup language: `DSH_TUI_LANG` when it holds a valid value
 * (pinned at process start — the repro/verify scripts rely on this for
 * deterministic UI copy), else the persisted `/lang` choice, else the OS
 * locale guess, else `en`. The cordis.yml `lang` precedence lives in
 * plugin.apply.
 */
export function resolveStartupLang(): Lang {
  const envLang = process.env.DSH_TUI_LANG
  if (isLang(envLang)) return envLang
  return readLangPref() ?? detectLocaleLang()
}
