# Unresolved conflicts and unverified items

This document collects every conflict and unverified item found across the
documentation set during the audit that was not resolved, serving as a
closing index for the whole set. All line numbers are relative to the audit
baseline b2f4087. Evidence-tier convention: explicit evidence (directly
verifiable from code/config/commits), strong indication (paraphrased from
comments/commit messages, statically self-consistent but lacking runtime or
upstream evidence), unverified (no way to confirm).

## Table of unresolved conflicts

| Topic | Conflict | Both sides | Evidence tier |
| --- | --- | --- | --- |
| Session persistence | JSONL vs SQLite backend | The config side (cordis.patch.yml:143-149, cordis.yml:158-164) is entirely JSONL, with no SQLite row and no "disable JSONL" row in the patch; the doc side (docs/configuration.md:139/154-162, docs/architecture.md:77/85-86, docs/getting-started.md:71) claims the profile mode uses SQLite (~/.dsh-cc/sessions.sqlite); getting-started.md:108-109 then claims JSONL itself — the older docs are even internally self-contradictory. **The config is treated as authoritative; the SQLite claim is marked "documentation conflict / unconfirmed"** | Config side explicit; doc side explicit (content is stale) |
| Update system | Timing of when DSH_CC_UPDATED_FROM is read | src/plugin.ts:47-48's comment states the design intent is "the version before the update"; src/update.ts:232 only reads installedTuiVersion **after** runProcess(update --latest) completes — labeling it as the new version, so isVersionNewer is false after every successful update, and the warning fires on every successful update | strong indication (the static ordering is clear; the runtime consequence needs an actual run) |
| Update system | The update-unavailable fallback hint is missing --latest | src/i18n.ts:173's hint gives the plain `update` command; src/update.ts:199-210's comment explicitly states a plain update gets stuck inside the caret range and a cross-minor update requires --latest | explicit |
| Update system | Docs miss the lowercase spelling | docs/interaction.md:152 only mentions NPM_CONFIG_REGISTRY; src/update.ts:84 and scripts/verify-update.mjs:112-117 both also support the lowercase npm_config_registry | explicit |
| Injected context | Display accounting | docs/architecture.md:107 and the root README.md:186 claim "plugin context injected into the system prompt is not listed separately in the UI"; src/components/LoadedContextPanel.tsx:82-88 actually renders context.contexts as a separate "runtime context" group | explicit (a precise fact: the panel shows this group on an empty transcript, while injected messages within the transcript still aren't shown) |
| /doctor | Storage-path mismatch | src/channel.ts:2118-2119 checks ~/.dsh-cc/sessions; the actual JSONL root is dshHomePath('sessions') (~/.dsh/sessions, cordis.patch.yml:149) | explicit |
| Theme | Docs claim colors is required | docs/themes.md:67 marks it required; src/customTheme.ts:175-178 makes an absent colors valid (an empty override) | explicit |
| Theme | StatusMetrics hardcodes color values | src/screens/StatusMetrics.ts:223-228 hardcodes success/warning/error with the comment "cc-tui dark theme values (theme.ts)"; none of the three values match src/theme.ts:132-134's dark-theme set, and they don't follow theme switching | explicit |
| Theme | ThemePicker sort comment | src/components/ThemePicker.tsx:46-49 claims "sorted by file name"; the code actually sorts by theme name via localeCompare (src/customTheme.ts:246) | explicit |
| Theme | Language-chain comment | Both src/plugin.ts:40-43 and src/index.ts:54-55's comments omit the OS-locale step (src/index.ts also omits config.lang); the code actually walks the full 5-tier chain consistently (src/i18n.ts:5-11) | explicit |
| Theme | Theme description path built from the display name | src/i18n.ts:243 builds the path from {{name}}, and ThemePicker passes spec.name; when the declared name differs from the file name, the displayed path doesn't exist (cosmetic only) | explicit |
| Model routing | ModelPicker comment is stale | src/components/ModelPicker.tsx:12-13 claims the model is fixed at creation and a selection needs a restart to take effect; it actually does an immediate switchModel live fork switch on Enter | explicit |
| Model routing | /config copy is stale | src/i18n.ts:153's doctor-route-hint claims /model only takes effect after a restart and that the route is decided by the llm-deepseek section; it actually does an immediate fork switch that persists, with the provider pinned in the cc-tui section (cordis.yml:15) | explicit |
| Model routing | /doctor mixes old and new sources | src/channel.ts:2106 reads the model from the mutable state.model but the provider from the startup config — after a /model switch, the display shows a mismatched pair; src/channel.ts:261's interface comment "Resolved model id (from the plugin config)" is likewise stale | explicit |
| Input | Listener-order comment is questionable | src/components/PromptInput.tsx:47-52's comment claims the Chat listener runs first; it's actually registered inside useEffect (children before parents), contradicting the comment; this can't be verified without running it, and the interruptSeq token makes a double delivery harmless anyway | strong indication (either account is self-consistent) |
| Input | README's image-paste claim | README.md:88 claims Ctrl+V pastes images; clipboard.ts only produces a path for FileDropList — a clipboard bitmap makes Get-Clipboard -Raw return empty, giving the "clipboard is empty" hint instead | explicit |
| Input | History-doc claim | docs/interaction.md:15 claims ↑/↓ "browse history"; ↑/↓ actually only covers the 50 entries within the session — only Ctrl+R can search the 200-entry on-disk history | explicit |
| Input | /rewind undocumented | /rewind is registered and appears in the / menu and the ? help; README.md / docs/interaction.md only document double-tap Esc | explicit |
| Input | steering filters a no-op condition | src/screens/Chat.tsx:727-728's comment claims it excludes steering-side questions (row.label === undefined), but nothing in src/ ever sets label on a user row — the filter condition is always true | explicit |
| Input | v0.4.1 tag ambiguity | The baseline HEAD b2f4087 (package.json 0.4.1) includes pr-55; the git tag v0.4.1 points at eeca418 (which doesn't); publish.yml publishes by tag==version, so the npm 0.4.1 package likely doesn't include pr-55/pr-61 (not verified offline against the registry) | explicit (tag position); unverified (npm contents) |
| Rendering | CI-mounting gap | The dev section of the root README.md:200-211 only briefly describes CI (Node 24/pnpm 11) without listing the CI steps for the verify-* scripts; ci.yml actually mounts (listing only the items relevant to this document): verify-teardown-exit (:41), verify-update (:45), verify-child-stderr (:63), verify-model-route (:67), verify-cjk-truncate (:71); verify-themes/verify-shrink/verify-scroll/verify-resticky/verify-tps are all not mounted in CI | explicit |
| Rendering | renderToScreen is dead code | src/ink/render-to-screen.ts:47-67 exports renderToScreen with a double-call flushSync for eager flushing; nothing in src/ calls it in production (a grep only hits the definition); whether the verify scripts use it is unconfirmed | explicit (no caller) |
| Rendering | The "4 sites" claim | `.github/workflows/ci.yml:68-70`'s comment claims 4 description sites handle terminal display width; the enumerable `truncateToWidth` call sites in the source are actually 3 (src/components/FileSuggestions.tsx:48, src/components/CommandSuggestions.tsx:57, src/components/MessageList.tsx:570) | explicit |
| Rendering | textWrap 'end'/'middle' are no-ops | src/ink/wrap-text.ts:46-79 only implements 'wrap', 'wrap-trim', and startsWith('truncate'); 'end'/'middle' fall through to a pass-through return; src/ink/styles.ts:68-69 still declares both values — whether this is an unimplemented feature or leftover styling is unconfirmed | strong indication |
| Rendering | Shrink-frame fix evolution | The five-commit chain a56b8e8→cb1a28b→18680e5→287a811→6a89566 fixes "ghosting after a shrink frame"; the main loop doesn't replay the animation frame by frame | Commits explicit; behavior unverified |
| MCP | Origin of the MCP SDK default | The StdioClientTransport stderr default of 'inherit' is only found in source comments and commit messages; node_modules isn't installed, so it can't be checked against the upstream @modelcontextprotocol/sdk | strong indication |
| MCP | cross-spawn behavior | "reads spawn from the CJS exports at call time" is only stated in a comment; the verify script replicates that access pattern but never actually loads cross-spawn | strong indication |
| MCP | Timing of the first spawn | Whether the dsh-mcp-client's first spawn in a real profile launch is guaranteed to happen after the cc-tui guard is installed depends on the external bundle's load order | unverified |
| MCP | Original content of issue #17 | Screenshots/repro steps are only paraphrased from commit messages and comments; the repo contains no issue body | unverified |
| Lifecycle | Composition-layer semantics | Whether a patch is a whole-row override or an overlay, and the dsh-base layer's final composed content (unreadable since node_modules isn't installed) — whether an override causes double-mounting depends on the dsh Loader's rules | unverified |
| Lifecycle | cordis.yml assembly constraints | The bare-composition docs claim assembly constraints (the cc-tui section's provider/model being half-pinned, etc.); the schema has no route default (issue #30) | explicit (schema); unverified (assembly effect) |
| Lifecycle | The bootstrap directory | src/bootstrap is a telemetry no-op stub (state.ts, see [lifecycle.md](lifecycle.md#the-bootstrap-directory)) and takes no part in the startup flow; the directory name comes from the original Claude Code telemetry module | explicit |
| Session | Injected-context display accounting / /doctor path / index.ts comment / resume API | See the table above and [session-context.md](session-context.md#conflicts) | — |

## Unverified items (no conflict, no confirming evidence)

### External/upstream behavior (outside this repo)

- Whether an SQLite row exists in the dsh-base layer's final composition; the
  dsh Loader's rules for a patch's whole-row override; the composed effect of
  "disabling base JSONL".
- The physical encoding of dsh-session-persistence-jsonl (zstd, packed chunk
  runs, etc. — only inferable indirectly from the migrate script's
  comments).
- The real writer of the request/header event structure's
  data.header.config.{provider,model}, which recordedModelRoute depends on
  (the dsh-agent loop).
- Whether the request/header for a new session created after a /model switch
  carries the new provider/model.
- Whether the LoadedContextPanel's tools group includes MCP tools (depends on
  upstream dsh-agent / dsh-system-prompt assembly).
- How the MCP subprocess and other services are reclaimed at teardown.
- The actual format of ~/.pi/agent/working-activity.json (activityPrefs.ts's
  comment claims it mirrors its frames key; the pi extension isn't in this
  repo).
- How the dsh launcher re-parses process.argv.slice(1) when replaying
  arguments to a restarted process.
- Whether the engine layer consumes the same i18n language mechanism (does
  /lang affect other plugins' copy).
- Upstream implementation details of the MCP SDK / cross-spawn (see the
  conflict table).

### Inside this repo, but statically unconfirmable

- The actual execution order of the Chat and PromptInput useInput listeners
  (the comment and React's effect semantics contradict each other).
- Terminal behavior when keystrokes keep firing during IME composition (some
  Linux IME configs).
- Whether Ctrl+Enter is recognized on older terminals that don't support
  kitty/modifyOtherKeys.
- Whether Ctrl+V works in an environment without PowerShell (a direct WSL
  launch/SSH Linux) (clipboard.ts hardcodes powershell, with no platform
  branch).
- Whether it's possible to roll back to before the compaction point after a
  compact (inferred to be impossible; no doc or test states this).
- Session-restore details after an update restart; the true runtime behavior
  of installedTuiVersion under a tsx source layout.
- Whether the 8 *_FOR_SUBAGENTS_ONLY keys and keys with no consumer such as
  rainbow_*/briefLabel* have any external consumer; the exact upstream file
  behind dark-ansi's "verbatim from the leak".
- Whether the design-system/ThemeProvider theme prop path (production passes
  null) has any caller at all.
- Whether the status bar follows the session record under the
  attach-existing branch (plugin.ts:368-370).
- Whether the renderToScreen dead code is used by the verify scripts; whether
  textWrap 'end'/'middle' are an unimplemented feature or leftover styling.
- The exact microtask timing of the waitUntilExit settlement.
- The session-store backend of an actual profile install (can't be verified
  by an actual run since node_modules isn't installed).
- The actual contents of the 0.4.1 tarball on the npm registry (the v0.4.1
  tag points at eeca418, which doesn't include pr-55/pr-61; the published
  artifact wasn't verified offline).

## Evidence-tier distribution

Every conclusion across the whole document set is traceable: explicit
evidence always gives a file:line-number (baseline b2f4087); strong
indication always states its paraphrase source (comment/commit message) and
its static self-consistency; items with no evidence are always marked
unverified, with no elevation beyond "unable to confirm". The summary
figures (282 entries classified, 69 topic keys, 215 i18n keys, 24 cordis
ids, 29+4 patch rows, 6 exports, 39 local commands) were all recomputed by
a programmatic script (see [origin.md](origin.md) for methodology and the
[README.md](README.md) audit-info table).

Related documents: [README.md](README.md) (index and audit info),
[origin.md](origin.md) (provenance and methodology),
[session-context.md](session-context.md) (JSONL/SQLite conflict details).
