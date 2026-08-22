# Plugin lifecycle and assembly

This document describes dsh-cc-tui's full assembly process as a Cordis
plugin, from config composition to process exit: the composition layer's
makeup, apply's startup order, command dispatch, and the split between the
exit funnel and teardown. All line numbers are relative to the audit
baseline b2f4087.

## The plugin contract and entry point

`src/index.ts` is a standard Cordis plugin surface (name / inject / Config
/ apply):

| Export | Location | Content |
| --- | --- | --- |
| `name = 'cc-tui'` | `src/index.ts:12-13` | The plugin name; `inject = ['agents']`, with agents as the only hard-inject dependency |
| The `Config` interface | `src/index.ts:19-62` | sessionId / provider / model / cwd / effort / activity / activityFrames / contextBar / fullscreen / lang / preset |
| The `Config` schema | `src/index.ts:64-80` | `Schema.object({...})`, **with no route default in the schema** — the comment states explicitly: "No schema defaults on the route... The defaults live at the end of the fallback chain in modelRoute.ts" (issue #30) |
| `apply` | `src/index.ts:89-92` | Delegates to `plugin.ts` via a dynamic `await import('./plugin.js')`, so entry-point scanning tools and the Loader resolve to a plain .ts module |

The Loader resolves the `dsh-cc-tui` row's entry point from
`package.json:7-8`'s `main: lib/types/index.js` and
`types: lib/types/index.d.ts` (tsc's output — see
[overview.md](overview.md)'s source distribution).

## The config composition layer

The profile assembly chain (npm package → profile composition → the
launch entry point):

```text
dsh plugin --profile cc-tui add dsh-cc-tui   (install.sh:22, initializes the profile, installs the dsh-base first layer, pnpm installs the package)
  -> the CLI reads package.json's dsh.bundle.patch metadata (package.json:103-107)
  -> appends cordis.patch.yml as a bundle composition layer (docs/getting-started.md:62)
  -> composition-layer order: dsh-base -> other bundles -> the dsh-cc-tui patch -> the user's profile patch -> the home patch
     (docs/getting-started.md:64-67; scripts/run.ts:208-215 uses the same order)
  -> launches via dsh --profile cc-tui (install.sh:24), and the Loader resolves the cc-tui row -> lib/types/index.js
```

`scripts/run.ts:183-215` is the workspace dev-launch path: it runs
loadOverlayPatches in the order base → working-activity → external plugins
→ cc-tui → the user's profile → the home patch, then calls
`boot('dsh', rootConfig, allPatches, ...)` (:249), and also does
healProfilesModuleFallback, installFailLoud, pins `DSH_HOME` to ~/.dsh-cc
(:17-19), sets `NODE_ENV=production` (:27, to avoid an OOM in the
react-reconciler dev build), and a heap watchdog gated by
`DSH_CC_HEAP_WATCH` (:56-81). This script bypasses the profile-directory
system (:5-9) and is used only for source-level development.

### cordis.yml (a bare-composition example, 24 service rows)

Counted programmatically (`grep -c '^\- id:'`) = 24: user-questions(9),
cc-tui(12), llm-deepseek(33), subprocess(42), bash(45), fs(53),
fs-policy(60), tool-fs(63), tool-todo(69), subagent(77),
subagent-spawn(80), subagent-fork(85), tool-subagent(90),
tool-subagent-fork(98), agent-spine(106), commands(126), plan-mode(132),
command-goal(141), working-activity(153), sessions(161),
session-query(167), session-checkpoints(170), token-meter(174),
compact(177).

There's no explicit deps field between rows — the dependency is
service-level. Key assembly constraints (all from inline comments):

| Constraint | Location |
| --- | --- |
| user-questions must sit at the root for the agent loop's tool execution to reach it | `cordis.yml:5-8` |
| The core `dsh-subagent` service must be mounted before any provider | `cordis.yml:74-77` |
| The commands registry must be mounted before the commands | `cordis.yml:123-127` |
| tool-todo's allowParallelInProgress is required (no schema default) | `cordis.yml:66-68` |
| The plan-mode section is required and must be non-empty; a bare mount fails validation and rolls back the whole tree | `cordis.yml:131-137` |
| The rc.6 schema key is `apiKeyEnv`, not `apiKey` (the old snapshot key is dropped by the loader) | `cordis.yml:30-32` |

The cc-tui row (`cordis.yml:12-27`): `provider: deepseek-official` is only
half-pinned (doesn't form a complete route, issue #67, see
[model-route.md](model-route.md)), `fullscreen: true` (:19, alt-screen
fullscreen), `effort: max` (:24),
`sessionId: !!js process.env.DSH_CC_RESUME_SESSION ?? undefined` (:27).

### cordis.patch.yml (the profile override layer)

`cordis.patch.yml:6-8`'s file-header comment defines the patch semantics:
**"A patch replaces the targeted row's whole config"** — a patch replaces
the config as a whole row, and an override row must restate every key.

- 29 top-level overrides: 23 `disabled: true` rows + 6 config rows
  (system-prompt:16, llm-deepseek:26, agent-loop:36, sandbox-policy:132,
  approval:139, session-persistence-jsonl:147).
- 1 insert block (:161-217) inserting 4 rows: agent-presets(170),
  cordis-host-runner(178), cc-tui(185), working-activity(214). The cc-tui
  row has `fullscreen: false` (:193, commented "off by default — inline
  mode lets the terminal's native selection/copy/scrollback take over",
  the opposite of the bare composition — see the intentional difference
  noted in [unknowns.md](unknowns.md)). The working-activity row has
  `publishIntervalMs: 500` (:217, tightened from a default of 2000ms to
  smooth out the status-bar timer).
- The agent-loop row has `agents: []` (:36-38, "no declarative agents are
  started at boot" — the TUI creates/resumes agents at runtime through a
  factory).
- `dsh.bundle.patch: "./cordis.patch.yml"` (package.json:103-107) is the
  metadata the CLI uses to recognize the patch layer.

### The preset priority chain

`config.preset` (an explicit value in cordis.yml/the patch) >
the `CC_TUI_PRESET` environment variable
(`cordis.patch.yml:202` `preset: !!js process.env.CC_TUI_PRESET ?? undefined`)
> the persisted /preset (readPresetPref) > the roster default `'standard'`
(`cordis.patch.yml:173` `config: { default: standard }`).
src/plugin.ts:160-163's comment: "cordis.yml `preset` over the persisted
`/preset` choice; undefined adopts the roster default"; the create path is
`composePreset(ctx, configuredPreset ?? readPresetPref())`
(src/plugin.ts:401).

Preset assembly implementation (`src/presets.ts`):

- `rosterOf` accesses it optionally via `ctx.get('agentPresets')`
  (`src/presets.ts:49-51`);
- `composePreset` returns `{ agentPreset, setup }`, with setup calling
  `presets.mount(agentCtx, resolvedId)` inside the agent factory's
  `setup(agentCtx)` hook (:74-93), degrading to a roster-less composition
  on a resolution failure (:80-85);
- `resolvePersistedPreset` reads `ctx.get('sessionPersistence').load(id)`
  and then goes through `resolveSessionPreset` — "the last
  agent-preset/selected event wins over the creation header" (:105-126);
- Persistence lives at `~/.dsh-cc/agent-preset.json`
  (`src/presetPrefs.ts:15-63`, best-effort read/write, with the id
  matched against the regex `^[a-z0-9][a-z0-9-]*$`).

## apply's startup order

`plugin.ts`'s apply order (`:35-330`):

```text
1. TTY check                src/plugin.ts:35-38    throws immediately on a non-interactive terminal
2. Language resolution      src/plugin.ts:44-45    DSH_TUI_LANG > config.lang > resolveStartupLang() > en
3. Update-marker validation src/plugin.ts:52-71    DSH_CC_UPDATED_FROM is validated then deleted
4. Service assembly         src/plugin.ts:82-91    userQuestions falls back to creating it + mounting toolAskUser
                                                    + registerPackagedSkills + registering the question-panel provider
                                                    + ctx.effect(rejectAll) ("All three must be in
                                                      place before the agent is resolved")
5. The stderr guard         src/plugin.ts:100-115  patches child-process spawn (issue #17)
6. Model routing            src/plugin.ts:117-129  resolveModelRoute(configuredRoute, readModelPref())
7. Channel creation         src/plugin.ts:144-165  mounts stderr notifications and flushes the backlog (:166-171)
8. The exit funnel          src/plugin.ts:193-264  createExitFunnel
9. React render              src/plugin.ts:267-303  the Chat + AlternateScreen fullscreen tree
10. Background version check src/plugin.ts:308-314  checkForTuiUpdate (silent on a 4s timeout)
11. The teardown effect      src/plugin.ts:320-323  only markTeardown + unmount
12. waitUntilExit             src/plugin.ts:330
```

Agent resolution (`resolveAgent`, `src/plugin.ts:352-429`):

- Resume takes priority: with a sessionId present, `ctx.agents.get(resumeId)`;
  if it's not running, `resolvePersistedPreset` + `composePreset` +
  `ctx.agents.resume` (:375-381), falling back to creating a new one on
  failure;
- Create: `validateModelRoute(llm, startupRoute)` (:410, falling the whole
  route back to the default when validation fails) → `ctx.agents.create`,
  with meta carrying `agentPreset` as the persisted header (:416-424);
- On failure, "Fail loud with the reason on stderr" (:425-432).

### The full set of environment-variable entry points

| Variable | Read at | Semantics |
| --- | --- | --- |
| DSH_TUI_LANG | `src/plugin.ts:44` | A language override (`en` / compatibility `zh`); UI strings stay English. Falls through to `en` (`src/i18n.ts`) |
| DSH_CC_UPDATED_FROM | `src/update.ts:12`, `src/plugin.ts:53-57` | Post-update restart validation, deleted after checking |
| DSH_CC_RESUME_SESSION | `cordis.yml:27`, `cordis.patch.yml:203`; generated by `src/plugin.ts:488` | The resume session id; fed in by `dsh-cc.cmd:29-32` from ~/.dsh-cc/resume.txt |
| DSH_CC_SESSION_ROOT | `cordis.yml:164`, `cordis.patch.yml:149` | Overrides the JSONL session root; defaults to ~/.dsh-cc/sessions under a bare cordis.yml, and to dshHomePath('sessions') (usually ~/.dsh/sessions) under the profile patch |
| CC_TUI_PRESET / CC_TUI_PERSONA | `cordis.patch.yml:202/17` | A preset override; persona defaults to 'You are a coding agent.' |
| CC_TUI_COMPACT_RATIO / CC_TUI_COMPACT_RETAIN | `cordis.yml:183-184` | Default '0.2' / '0.05' |
| CC_TUI_DISABLE_MOUSE | `src/utils/fullscreen.ts:10` | Disables mouse capture |
| CC_TUI_THEME | `src/components/design-system/ThemeProvider.tsx:55` | A theme override |
| CC_TUI_DEBUG | `src/utils/debug.ts:8` | The debug toggle |
| DSH_CC_RENDER_LOG | `src/ink/terminal.ts:215` | The render log |
| DSH_CC_WORKSPACE | `dsh-cc.cmd:16-17` | A workspace override |
| DSH_CC_HEAP_WATCH | `scripts/run.ts:56` | The dev-only heap watchdog |

No bin entry point (`src/plugin.ts:479-483`'s comment: "The package ships
no `dsh-cc` bin — resuming means feeding the session id through
`DSH_CC_RESUME_SESSION`"); `dsh-cc.cmd:1-41` is the Windows launcher this
repo ships (`@dsh --profile cc-tui %ARGS%`, with `--resume` reading
resume.txt).

## The command-dispatch chain

```text
src/components/PromptInput.tsx's useInput captures keystrokes (src/components/PromptInput.tsx:373)
  -> '/' triggers the filterCommands suggestion overlay (src/components/PromptInput.tsx:168-175)
  -> Enter -> tryRunCommand (src/components/PromptInput.tsx:337-354):
     starting with '/' -> parseCommandName (src/commands.ts:83-89, the regex
     /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/) -> checked against channel.commandList
     -> only enters history once handled successfully
  -> src/screens/Chat.tsx's runCommand, a large switch (src/screens/Chat.tsx:293-708)
```

Built-in commands go through a local branch:

| Command | Handling |
| --- | --- |
| /model | Opens ModelPicker (src/screens/Chat.tsx:463-473) |
| /rewind | Opens RewindPicker (src/screens/Chat.tsx:513-518) |
| /new | channel.newSession (src/screens/Chat.tsx:439-448) |
| /compact | channel.compact (src/screens/Chat.tsx:457-459) |
| /resume | The session picker (src/screens/Chat.tsx:494-512) |
| /exit | onExit (src/screens/Chat.tsx:519-521) |
| Skill commands | Sends the SKILL_PROMPTS activation prompt (src/screens/Chat.tsx:672-685) |

The default branch only goes through `channel.runExternalCommand` for
registry commands with `command.external`
(src/screens/Chat.tsx:691-704); an unknown name returns false and lets it
through to the model. External-command execution (`src/channel.ts:1962-1976`):
`commandService.execute(agent, "/" + name + rawInput, signal)`, with the
result text landing as a notification; `commandService` is an optional
service, `ctx.get('commands')` (src/channel.ts:879, the dsh-commands
registry). The channel's comment (:874-878): execute "logs the paired
command/run + command/done records" (which the plan-mode projection
depends on).

Command-list merging (`src/channel.ts:2226-2243`): starts from
`LOCAL_COMMANDS` (39 entries, `src/commands.ts:25-72`) as the base, and a
registry entry only `continue`s when `merged.some(...)` finds a name
collision (the local command is kept), plus mounting
`ctx.on('commands/change', refreshCommandList)`.

**An internal contradiction (on record)**: `src/commands.ts:6-8`'s module
comment claims "with the registry handler winning for names both sides
declare", which contradicts the adjacent JSDoc (:22-24 "locals win on name
collisions") and the actual behavior (src/channel.ts:2229-2230,
src/screens/Chat.tsx:293 — the built-in name hits the switch first) — the
actual behavior is that local commands win.

## The exit funnel and teardown

`src/plugin.ts:450-467`'s `createExitFunnel` provides `markTeardown`
(after which `handleExit` returns immediately) and the full user-exit
path:

| Path | Behavior |
| --- | --- |
| Teardown (triggered by a recompose, issue #12) | `ctx.effect(() => () => { funnel.markTeardown(); instance?.unmount() })` (src/plugin.ts:320-323) — only unmounts the UI without exiting the process. Comment: "Teardown only unmounts the UI; user exit runs the full leave sequence". Fixes the symptom of the DSH launcher's boot-time recompose flashing back to the shell |
| User exit (/exit, a double Ctrl+C, a render crash) | onUserExit (src/plugin.ts:193-264): writeResumeTarget writes ~/.dsh-cc/resume.txt (src/sessionHistory.ts:36-39) → unmount → update handoff (disposeRootAndThen → updateTuiAndRestart when updateRequested) or prints the resumeCommand hint → disposeRootAndExit(ctx, 0) (:259-262) |

The resume command shown at exit (`src/plugin.ts:484-489`): `dsh-cc
--resume <id>` on Windows, `DSH_CC_RESUME_SESSION=<id> dsh --profile
<name>` on other platforms.

## The bootstrap directory

`src/bootstrap/state.ts:1-14`'s module comment: "Interaction-time telemetry
stubs consumed by the ported Ink core" — all three functions are complete
no-ops (`flushInteractionTime`/`updateLastInteractionTime`/
`markScrollActivity`), imported only by `src/ink/ink.tsx:9`,
`src/ink/components/App.tsx:2`, `src/ink/components/ScrollBox.tsx:3`. The
"bootstrap" directory name comes from Claude Code's original telemetry
module — **it is not startup/bootstrapping code**.

## Unverified items

- How the dsh CLI Loader reads dsh.bundle.patch and layers the shipped
  `config/agent-presets/` root onto the agent-presets row, and the
  implementation of `dshHomePath()` — the dsh CLI and dsh-app-boot source
  isn't in this repo (`cordis.patch.yml:44-51` and
  `docs/getting-started.md:56-62` only describe the mechanism in comments/
  docs).
- dsh-agent-presets's internal roster behavior: includeUserRoot (appending
  ~/.dsh/.agent-presets), and the scope-chain details of
  mount/recompose/serviceFor (`src/presets.ts:35-43` only declares the
  minimal AgentPresetsLike interface).
- The dsh-commands registry's execute/list semantics
  (`src/channel.ts:879,1962-1976` only consumes the CommandRuntime
  interface).
- The actual registration result of the packaged skills: the skills/
  directory actually has 7 — audit/bug/practice/pr-comments/
  release-notes/review/vuln-check — but each SKILL.md's frontmatter fields
  weren't individually verified.

Related documents: [overview.md](overview.md) (overview and module
boundaries), [input-commands.md](input-commands.md) (the command and input
model), [model-route.md](model-route.md) (model routing),
[session-context.md](session-context.md) (resume and teardown),
[update.md](update.md) (the update pipeline), [unknowns.md](unknowns.md)
(the unverified-items list).
