# Overview

## Project positioning

dsh-cc-tui is a Cordis plugin that gives DeepSeek Harness agents a Claude
Code-style terminal TUI front door. The plugin's own self-description
(`src/plugin.ts:26-27`):

> Claude Code style interactive TUI front door for DeepSeek Harness agents.

It doesn't own the Agent, session, model, tool, persistence, or policy
domains — those are provided by DeepSeek Harness (DSH), and the TUI only
consumes them (`docs/contributing.md:18-21` says the same). The plugin
"attaches to (or creates) one agent, renders a chat transcript from the
agent's session log and live `session/event` records, and submits user
turns through `Agent.followup`" (`src/plugin.ts:29-33`), putting it in the
same client-driver front-door category as `dsh-jsonrpc`.

The plugin ships its own TUI, a local command surface, bundled skills, and a
ported Ink/Yoga renderer; the render kernel `src/ink/` is a port of Claude
Code's internal ink fork (provenance evidence in [origin.md](origin.md),
structure map in [ink-core.md](ink-core.md)).

## Runtime wiring

The main chain from config to terminal (file paths below are relative to
the source root):

```text
cordis.yml / cordis.patch.yml (composition layer)
  -> src/index.ts (plugin contract and schema; the entry point stays lightweight)
  -> src/plugin.ts (TTY check, language resolution, service assembly, agent create/resume, React mount, exit cleanup)
  -> DSH agent / session / tool services (official @deepseek-ai/dsh-* packages)
  -> src/channel.ts (projects session/event into the transcript; the submit/steer/resume/rewind/model action surface)
  -> src/screens/Chat.tsx (keyboard and mode orchestration, slash-command dispatch)
  -> src/components/* (views and the design system)
  -> src/ui.ts (themed renderer facade)
  -> src/ink/* + src/native-ts/yoga-layout (layout, terminal protocol, diffed output)
  -> ANSI terminal
```

This chain matches the older description in `docs/architecture.md:5-18` and
has been re-verified against the baseline code: the entry point
`src/index.ts` exports the plugin contract and dynamically delegates to
`src/plugin.ts`'s `apply` (see [lifecycle.md](lifecycle.md)).

## Layering and module boundaries

| Module | Ownership |
| --- | --- |
| `src/index.ts` | The Cordis plugin name (cc-tui), inject declarations, the Config interface and schema; keeps the entry point lightweight and lazy-loads the runtime |
| `src/plugin.ts` | TTY validation, language resolution, assembling userQuestions/skills/the stderr guard, agent create/resume, React mount, unified exit cleanup |
| `src/channel.ts` | Projects DSH's persisted events into the transcript; provides the submit, steer, resume, rewind, model/preset, etc. actions; never treats a local React array as the conversation's source of truth |
| `src/screens/Chat.tsx` | Modal priority, global keys, scroll/search/selection state, slash-command dispatch |
| `src/components/` | Feature components and the design system (`components/design-system/` theme-aware primitives, `components/messages/` transcript rows, `components/questions/` question-panel UI); never directly owns the agent or session's source of truth |
| `src/screens/StatusLine.tsx` and `src/screens/StatusMetrics.ts` | Bottom status-bar presentation and metric derivation |
| `src/ui.ts` | The themed `Box`/`Text`, render, selection, scrolling, etc. public facade |
| `src/ink/` | The ported Ink renderer, terminal protocol, events, selection, and Yoga bridge; sensitive low-level plumbing |
| `src/native-ts/yoga-layout/` | A pure-TypeScript yoga port (`src/native-ts/yoga-layout/index.ts:2`) |
| `src/cc/` | Terminal formatting and presentation helpers adapted for the Claude Code-style UI |
| `src/*Prefs.ts`, `src/customTheme.ts`, `src/sessionHistory.ts` | Persisted user preferences and local metadata under `~/.dsh-cc` |
| `src/commands.ts` | Local slash-command declarations (39 built in) and parsing helpers |
| `skills/*/SKILL.md` | Bundled skills shipped with the npm package, registered by `src/packaged-skills.ts` |
| `cordis.patch.yml` | The profile-bundle override layer (29 top-level overrides + 4 insert rows); row order, row IDs, and insert/override semantics all matter |
| `cordis.yml` | A bare-composition example for launching directly via `dsh --config` (24 service rows) |
| `scripts/` | Headless regressions, repro environments, probes, and diagnostics (10 repro / 18 verify, counted by glob prefix) |
| `lib/types/` | `tsc`'s committed build output (a build artifact; this audit did not read its contents) |

## Data flow: the session is the source of truth

`channel.ts` never treats a local React array as the conversation's source
of truth — every transcript row is derived from the persisted DSH session
event log (`src/channel.ts:110-114`):

> The DSH session log is the source of truth: rows are derived from
> `session/event` records (and the initial `agent.session.events` replay),
> never from optimistic local state.

The session event log carries: the initial history replay and incremental
streaming events, the association and sequence anchor between
assistant/reasoning/tool rows, rewind's turn boundaries, and reconstruction
after resume/export/compact/fork. The channel keeps only the projection
suited to the TUI: once a long session exceeds the window, older rows
collapse into short previews while the full content stays in the session
log; tool results are associated by `callId`, never guessed by array
position (`src/channel.ts:34-58`'s ToolRow structure).

## Source distribution

`src/` has 209 files in total (counted programmatically, grouped by
directory via glob): `src/ink/` 103 (the ported kernel, see
[ink-core.md](ink-core.md)), `src/components/` 53, `src/utils/` 14,
`src/cc/` 8, `src/screens/` 3, `src/native-ts/` 2 (yoga-layout),
`src/bootstrap/` 1, `src/hooks/` 1 (useBlink.ts), `src/types/` 1 (the
cc.d.ts type shim), and 23 at the src root. `scripts/` counted the same
way: 10 repro-* and 18 verify-* (matched by glob prefix). The npm package
has 6 exports (`.`, `./working-activity`, `./invariant`,
`./cordis.patch.yml`, `./package.json`, `./src/*`, package.json:9-25).

`src/bootstrap/` contains only a telemetry no-op stub (state.ts) and takes
no part in the startup flow (see
[lifecycle.md](lifecycle.md#the-bootstrap-directory)).

## Version and baseline relationship

- The current HEAD is `b2f4087` (git describe: v0.4.1-48-gb2f4087), i.e. 48
  commits after the v0.4.1 tag (eeca418).
- The v0.4.1 tag does not include pr-55 (the /rewind command + /new taking
  effect in one go) or pr-61 (MCP stderr takeover) — both landed after it,
  and the current baseline includes them.
- v0.3.5 (tag 9e563af) is a direct ancestor, differing from the baseline by
  184 files with no deletions (the older-version docs are used only as a
  reference lead in [unknowns.md](unknowns.md); their line numbers and
  continued existence were both re-verified).

Related documents: [lifecycle.md](lifecycle.md) (assembly and startup
order), [ink-core.md](ink-core.md) (the render kernel),
[origin.md](origin.md) (provenance), [unknowns.md](unknowns.md) (the
unverified-items list).
