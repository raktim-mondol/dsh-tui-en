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
  'questionnaire-answered': '📋 Questionnaire answered · {{total}} questions',
  'theme-sakura-name': 'Sakura Pink',
  'context-truncated': '… (truncated)',
  'context-sections': 'System prompt {{n}} sections',
  'context-files': 'Workspace instructions ×{{n}}',
  'context-runtime': 'Runtime context {{n}} items',
  'context-skills': 'Skills {{n}}',
  'context-tools': 'Tools {{n}}',
  'skill-unavailable': 'Skill {{name}} is gone or not user-invocable',
  'skill-audit-prompt': 'Use the audit skill to do a thorough code audit of the current project, finding security, correctness and quality issues.',
  'skill-bug-prompt': 'Use the bug skill to help me write a complete bug report (symptoms, reproduction steps, expected behavior).',
  'skill-practice-prompt': 'Use the practice skill to run a round of programming practice with me.',
  'skill-review-prompt': 'Use the review skill to do a thorough code review of the current project.',
  'skill-pr-comments-prompt': 'Use the pr-comments skill to review pull request comments on the current branch and suggest improvements.',
  'skill-release-notes-prompt': 'Use the release-notes skill to generate release notes for the current project.',
  'skill-vuln-check-prompt': 'Use the vuln-check skill to run a security vulnerability check on the current project.',
  'context-loaded': 'Context loaded',
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
  'login-api-key': 'API key: {{key}}',
  'login-key-missing': 'not configured (DEEPSEEK_API_KEY)',
  'login-base-url': 'Base URL: {{url}}',
  'login-official-endpoint': 'official endpoint',
  'login-source-hint': 'Source: env var → workspace .env (run.ts fallback)',
  'login-logout-hint': 'DSH credentials come from the DEEPSEEK_API_KEY env var — remove it and restart dsh-tui to log out',
  'permissions-policy-hint': 'DSH permission policy is set by fs-policy / bash-sandbox config (current leaf: read/write in workspace, writes need a prior read).',
  'permissions-approval-hint': 'The approval channel is mounted: sandbox escalations (sandbox_permissions) raise an approval bar — Yes allows once, No / Esc rejects.',
  'permissions-preset-hint': '/permission shows and switches permission presets (read-only / workspace-write / danger-full-access).',
  'permissions-root-hint': 'Current filesystem policy is rooted at the working directory: {{cwd}}',
  'permissions-path-hint': 'Relative paths of model tools resolve from this directory; cross-directory access is blocked by fs-policy.',
  'hooks-not-mounted': 'DSH hooks (dsh-hooks-claude / dsh-hooks-codex) are not mounted in this leaf.',
  'hooks-mount-hint': 'Mount the matching hooks plugin in cordis.yml when needed.',
  'memory-none': 'DSH has no persistent memory service yet.',
  'memory-hint': 'Long-term conventions can go into AGENTS.md (workspace context) or skills (~/.dsh/skills).',
  'update-unavailable': 'Automatic update is unavailable in this launch mode (needs dsh --profile). Run dsh plugin --profile <name> update @deepseek-harness-tui/dsh-tui in a terminal.',
  'update-working': 'The current turn is still running. Wait for it to finish before updating the TUI.',
  'update-starting': 'Updating @deepseek-harness-tui/dsh-tui. The TUI will restart and resume this session when finished…',
  'update-available': 'New version available: v{{latest}} (current v{{current}}) · type /update to update the TUI',
  'update-already-latest': 'Already on the latest version (v{{current}}).',
  'update-check-failed': 'Could not confirm a newer version (network or registry unreachable); attempting the update anyway…',
  'vim-not-implemented': 'vim mode not implemented yet',
  'terminal-setup-hint': 'Recommended: Windows Terminal (≥110 columns, monospace, TrueColor).',
  'terminal-paste-hint': '{{mod}}V pastes text/file paths; Ctrl+Shift+V is native terminal paste; right-click paste also works.',
  'connect-none': 'DSH has no remote connection mechanism (CC\'s /connect equivalent is not adapted).',
  'theme-switch-failed': 'Theme "{{name}}" switch failed (cannot write ~/.dsh-tui/theme.json)',
  'interrupt-delivered': 'Interrupted current turn, {{n}} messages processed immediately',
  'btw-usage': 'Usage: /btw <question> — quick side question without interrupting the conversation',
  'btw-answering': 'Answering…',
  'btw-hint-loading': 'Esc cancel',
  'btw-hint-done': '↑/↓ scroll · Space/Enter/Esc dismiss · c copy',
  'btw-llm-unavailable': 'Side question unavailable (llm service not mounted)',
  'exit-press-again': 'Press Ctrl+C again to exit',
  'new-session-started': 'New session started',
  'command-not-found': '/{{name}}: no such command',
  'thinking-toggled': 'Thinking {{state}}',
  'thinking-on': 'on',
  'thinking-off': 'off',
  'tokens-usage': 'Tokens: {{in}} in · {{out}} out',
  'tokens-usage-context': '{{usage}} · {{percent}}% of context',
  'legacy-dir-migrated': 'Data directory copied from ~/.dsh-tui to ~/.dsh-tui (the old directory is kept; delete it yourself once satisfied)',
  'legacy-env-renamed': 'Environment variable {{old}} was renamed to {{new}}; the old name no longer takes effect',
  'update-aborted-no-profile': 'dsh-tui update aborted: no dsh profile resolved.',
  'activity-ctx-warn': '⚠ ctx ',
  'activity-random-each-preset': 'random preset each time',
  'preset-default-tag': ' (default)',
  'preset-broken-tag': ' (failed to load)',
  'effort-unavailable': 'Reasoning effort switching unavailable (llm service not mounted)',
  'effort-read-failed': 'Failed to read reasoning efforts · {{error}}',
  'effort-single-tier': 'Current model has a single reasoning effort ({{name}})',
  'effort-unsupported': 'Current model does not support reasoning effort switching',
  'effort-switched': 'Reasoning effort → {{name}}',
  'effort-invalid': 'Unknown reasoning effort {{id}} (this model offers: {{ids}})',
  'effort-current': 'Current reasoning effort {{name}}',
  'effort-usage': 'Usage: /effort (slider) | /effort <id> | /effort status',
  'mode-switched': 'Mode → {{name}}',
  'mode-default': 'default',
  'mode-plan': 'plan mode',
  'mode-full': 'full access',
  'mode-plan-unavailable': 'The active preset does not register /plan; cannot toggle plan mode',
  'logo-tagline': 'Explore the uncharted!',
  'logo-tip-model': 'switch model',
  'logo-tip-help': 'view commands',
  'logo-tip-tab': 'autocomplete',
  'logo-tip-trace': 'trajectory',
  'logo-tip-prefix': 'Tip: ',
  'input-sent-after-turn': 'Sent, processed after the current turn',
  'input-interrupted-next': 'Interrupted · processed next',
  'input-queued-after-turn': 'Queued · processed after the turn',
  'input-cannot-retract': 'Cannot retract: the message may already be processed, or this version doesn\'t support it',
  'input-retracted': 'Retracted, editable and resendable',
  'input-empty': 'Empty input, nothing to send',
  'input-interrupt-immediate': 'Interrupted current turn, processing immediately',
  'input-clipboard-empty': 'Clipboard is empty',
  'input-editor-unavailable': 'No editor available — set the $EDITOR (or $VISUAL) environment variable',
  'input-editor-failed': 'External editor failed: {{name}}',
  'input-clipboard-read-failed': 'Failed to read the clipboard',
  'input-clipboard-unavailable': 'Cannot read clipboard: no usable wl-paste / xclip / xsel (not installed or session unreachable)',
  'input-clipboard-image-saved': 'Clipboard image saved to a temp file; path inserted',
  'input-image-pasted': 'Pasted image {{token}}',
  'input-image-paste-failed': 'Could not paste image: {{err}}',
  'input-pending-steer-label': 'Steer · delivered next',
  'input-pending-queue-label': 'Queued · delivered after the turn',
  'input-pending-actions-hint': 'Retract · Esc interrupts and sends immediately',
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
  'help-for-commands': '/ for commands',
  'help-this-help': '? for this help',
  'help-verbose-output': '{{mod}}o for verbose output',
  'help-toggle-context': '{{mod}}t to toggle context',
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
  'help-open-editor': 'ctrl+x to open editor',
  'help-commands-title': 'commands:',
  'interrupted-by-user': 'Interrupted ',
  'interrupted-ask-next': '· What should DeepSeek do instead?',
  'load-earlier': ' ↑ load earlier messages (full session log; /export for full text) ',
  'show-previous-messages': ' ctrl+e to show {{n}} previous messages ',
  'resume-none-in-cwd': 'No resumable sessions in the current directory',
  'resume-resumed': 'Session resumed',
  'resume-delete-confirm': 'Delete "{{name}}"? The session log is removed permanently.',
  'resume-deleted': 'Deleted session {{name}}',
  'resume-delete-failed': 'Could not delete session {{name}}',
  'resume-rename-placeholder': 'New session name…',
  'resume-rename-failed': 'Could not rename session {{name}}',
  'resume-hint-delete': '**Enter** to delete · Esc to cancel',
  'resume-hint-rename': '**Enter** to save · Esc to cancel',
  'resume-title': 'Resume session',
  'session-loading': 'Reading sessions…',
  'session-list-failed': 'Could not read the session list · {{err}}',
  'session-resume-refused': 'That session could not be resumed — the reason is in the conversation (switching is refused while the model is working)',
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
  'session-hint-list': '**Enter** resume · Tab preview · {{mod}}a all projects ({{projects}}) · {{mod}}s runs ({{runs}}) · {{mod}}b this branch · {{mod}}r rename · {{mod}}d delete · {{mod}}x clean · Esc exit',
  'session-hint-list-mid': '**Enter** resume · Tab preview · {{mod}}a projects · {{mod}}s runs · {{mod}}r rename · {{mod}}d delete · Esc exit',
  'session-hint-list-short': '**Enter** resume · Tab preview · Esc exit',
  'hint-confirm-exit': '**Enter** to confirm · Esc to exit',
  'hint-confirm-cancel': '**Enter** to confirm · Esc to cancel',
  'hint-select-exit': '**Enter** to select · Esc to exit',
  'hint-rewind-back': '**Enter** to rewind · Esc to back',
  'hint-adjust-done': '**←/→** to adjust · Enter/Esc to done',
  'hint-history-search': '↑/↓ to navigate · **Enter** to select · Esc to cancel',
  'hint-expand-ctrl-o': '(ctrl+o to expand)',
  'picker-title-model': 'Model',
  'picker-title-theme': 'Color theme',
  'picker-title-activity': 'Indicator preset',
  'picker-title-effort': 'Reasoning effort',
  'model-loading': 'Loading models',
  'model-loading-subtitle': 'Querying the provider…',
  'model-switching': 'Switching model to {{name}}…',
  'model-switched': 'Model switched to {{name}}',
  'rewind-title': 'Rewind',
  'rewind-subtitle': 'Pick a message to rewind the conversation to',
  'rewind-confirm-title': 'Rewind conversation to this message?',
  'rewind-confirm-desc': 'conversation restarts here',
  'rewind-empty': 'No messages to rewind to',
  'rewind-last-message': 'last message',
  'rewind-none': 'Nothing to rewind yet',
  'rewind-done': 'Rewound — edit and press Enter to resend',
  'thinking-title': 'Toggle thinking mode',
  'thinking-subtitle': 'Enable or disable thinking for this session.',
  'thinking-enabled': 'Enabled',
  'thinking-enabled-desc': 'DeepSeek will think before responding',
  'thinking-disabled': 'Disabled',
  'thinking-disabled-desc': 'DeepSeek will respond without extended thinking',
  'thinking-mid-warning': 'Changing thinking mode mid-conversation will increase latency and may reduce quality. For best results, set this at the start of a session.',
  'thinking-proceed': 'Do you want to proceed?',
  'thinking-label': 'Thinking',
  'history-search-title': 'Search history',
  'history-search-placeholder': 'Type to search…',
  'history-search-empty': 'No matching commands',
  'time-now': 'now',
  'time-minutes-ago': '{{n}}m ago',
  'time-hours-ago': '{{n}}h ago',
  'time-days-ago': '{{n}}d ago',
  'search-no-matches': 'no matches',
  'rename-usage': 'Usage  /rename <new title>',
  'rename-current': 'Current title  {{title}}',
  'rename-done': 'Renamed to "{{title}}"',
  'compact-summary-folded': 'Summary folded',
  'new-message': '1 new message',
  'new-messages': '{{n}} new messages',
  'theme-builtin-base': 'Built-in · {{name}} base',
  'theme-auto-base': 'Built-in · follows the system/terminal background (light/dark)',
  'theme-user-base': '{{base}} base · ~/.dsh-tui/themes/{{name}}.json',
  'context-panel-collapse': 'Collapse',
  'context-panel-expand': 'Expand',
  'context-panel-sections': 'System prompt · {{n}} sections',
  'context-panel-files': 'Workspace instructions · {{n}} files',
  'context-panel-runtime': 'Runtime context · {{n}} items',
  'context-panel-skills': 'Skills · {{n}}',
  'context-panel-tools': 'Tools · {{n}}',
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
  'approval-waiting': ' Awaiting approval · {{tool}} ',
  'approval-proceed': 'Do you want to proceed?',
  'approval-yes': 'Yes, allow once',
  'approval-no': 'No',
  'approval-hint': '↑/↓ select · Enter confirm · Esc reject',
  'plan-review-fallback-header': 'Plan review',
  'plan-review-feedback-placeholder': 'Tell the model what to change…',
  'plan-review-approve-needs-empty': 'Clear the feedback to approve (or press Enter on the input row to send it)',
  'plan-review-hint': '↑/↓ select · 1/2 quick-pick · type feedback · Enter submit · Esc dismiss',
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
  'provider-write-failed': 'Failed to write the provider configuration · {{err}}',
  'provider-cancelled': 'Provider setup cancelled',
  'provider-success': 'Provider {{route}} added',
  'provider-switch-hint': 'Run /model to switch to the new provider’s models',
  'provider-q-switch': 'Switch to the new provider now?',
  'provider-opt-switch-now': 'Switch to {{model}}',
  'provider-opt-switch-keep': 'Keep the current model',
  'cmd-desc-workspace-resume': 'Switch to another workspace',
  'cmd-desc-workspace-rename': 'Rename the current workspace',
  'cmd-desc-workspace-open': 'Open a path or workspace URI',
  'lang-current': 'Current language  {{lang}}',
  'lang-switch-hint': 'Switch      /lang en',
  'lang-persist-hint': 'Persisted    ~/.dsh-tui/lang.json (survives restart; DSH_TUI_LANG wins)',
  'lang-switched': 'Language switched: {{lang}} (saved)',
  'lang-unknown': 'Unknown language "{{lang}}" · /lang to view all (en)',
  'lang-switch-failed': 'Language "{{lang}}" switch failed (cannot write ~/.dsh-tui/lang.json)',
  'status-cache-label': 'cache ',
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
 */
export function tOr(key: string, fallback: string): string {
  const entry = (dict as Record<string, string | undefined>)[key]
  return entry ?? fallback
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
