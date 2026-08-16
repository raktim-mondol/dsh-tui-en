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
  'agent-preset-switched': 'Agent preset switched: {{preset}}',

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

  // ── plugin.ts — boot-time rename notices (issue #120) ───────────────
  'legacy-dir-migrated': 'Data directory copied from ~/.dsh-tui to ~/.dsh-tui (the old directory is kept; delete it yourself once satisfied)',
  'legacy-env-renamed': 'Environment variable {{old}} was renamed to {{new}}; the old name no longer takes effect',

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
  'logo-tip-model': 'switch model',
  'logo-tip-help': 'view commands',
  'logo-tip-tab': 'autocomplete',

  // ── components/PromptInput.tsx ──────────────────────────────────────
  'input-sent-after-turn': 'Sent, processed after the current turn',
  'input-interrupted-next': 'Interrupted · processed next',
  'input-queued-after-turn': 'Queued · processed after the turn',
  'input-cannot-retract': 'Cannot retract: the message may already be processed, or this version doesn\'t support it',
  'input-retracted': 'Retracted, editable and resendable',
  'input-empty': 'Empty input, nothing to send',
  'input-interrupt-immediate': 'Interrupted current turn, processing immediately',
  'input-clipboard-empty': 'Clipboard is empty',
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

  // ── components/MessageList.tsx ──────────────────────────────────────
  'load-earlier': ' ↑ load earlier messages (full session log; /export for full text) ',
  'resume-none-in-cwd': 'No resumable sessions in the current directory',
  'rename-usage': 'Usage  /rename <new title>',
  'rename-current': 'Current title  {{title}}',
  'rename-done': 'Renamed to "{{title}}"',
  'compact-summary-folded': 'Summary folded',

  // ── components/ThemePicker.tsx ──────────────────────────────────────
  'theme-builtin-base': 'Built-in · {{name}} base',
  'theme-auto-base': 'Built-in · follows the system/terminal background (light/dark)',
  'theme-user-base': '{{base}} base · ~/.dsh-tui/themes/{{name}}.json',

  // ── components/LoadedContextPanel.tsx ───────────────────────────────
  'context-panel-collapse': 'Collapse',
  'context-panel-expand': 'Expand',
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

  // ── components/questions/PlanReviewPanel.tsx ────────────────────────
  'plan-review-fallback-header': 'Plan review',
  'plan-review-feedback-placeholder': 'Tell the model what to change…',
  'plan-review-approve-needs-empty': 'Clear the feedback to approve (or press Enter on the input row to send it)',
  'plan-review-hint': '↑/↓ select · 1/2 quick-pick · type feedback · Enter submit · Esc dismiss',

  // Slash-command descriptions live in LOCAL_COMMANDS (and the DSH
  // registry for external commands). tOr('cmd-desc-<name>', fallback)
  // still works if a key is added here later.

  // ── /lang command ───────────────────────────────────────────────────
  'lang-current': 'Current language  {{lang}}',
  'lang-switch-hint': 'Switch      /lang en',
  'lang-persist-hint': 'Persisted    ~/.dsh-tui/lang.json (survives restart; DSH_TUI_LANG wins)',
  'lang-switched': 'Language switched: {{lang}} (saved)',
  'lang-unknown': 'Unknown language "{{lang}}" · /lang to view all (en)',
  'lang-switch-failed': 'Language "{{lang}}" switch failed (cannot write ~/.dsh-tui/lang.json)',

  // ── components/TraceView.tsx (/trace, issue #80) ─────────────────────
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
 *  loaded-context.ts) resolve strings without a context. Defaults to `en`.
 *  `zh` remains a valid persisted code for compatibility; strings are English. */
let activeLang: Lang = 'en'

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
 */
export function detectLocaleLang(): Lang {
  const raw =
    process.env.LC_ALL ??
    process.env.LC_MESSAGES ??
    process.env.LANG ??
    ''
  const locale = raw.split('.')[0]?.toLowerCase() ?? ''
  if (locale.startsWith('en')) return 'en'
  return 'en'
}

/**
 * Resolve the startup language: the persisted `/lang` choice, else the OS
 * locale guess, else `en`. The env var / config precedence lives in
 * plugin.apply (see {@link resolveStartupLang} consumers).
 */
export function resolveStartupLang(): Lang {
  return readLangPref() ?? detectLocaleLang()
}
