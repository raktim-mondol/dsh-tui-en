# Model routing and the status bar

This document covers model routing's atomic-resolution model, /model's fork
switch, /resume's status-bar tracking (fix 4d48eb6), and /new's routing
semantics. All line numbers are relative to the audit baseline b2f4087.

## The atomic routing model

`ModelRoute` is a `{ provider, model }` pair treated as a single whole
(`src/modelRoute.ts:1-23`), whose comment states explicitly: "The
`(provider, model)` pair is a single value: every source either supplies
the WHOLE route or is skipped". There's no centralized "session→model"
mapping table; the route is resolved at the time of the session event.

Priority chain (`src/modelRoute.ts:40-61` `resolveModelRoute`):

```text
A complete cordis.yml route (both halves pinned) wins as a whole pair
  > the persisted /model choice in ~/.dsh-cc/model.json wins as a whole pair
  > DEFAULT_MODEL_ROUTE wins as a whole pair (src/modelRoute.ts:19-23:
    provider 'deepseek-official' / model 'deepseek-v4-flash')
```

A half-pinned config is ignored entirely and never spliced together with
another source (issue #67): `explicitModelRoute` (:27-38) only returns a
route when both halves are non-empty, "A half-pinned config counts as
unset here so it cannot override half of the persisted preference". This
repo's own `cordis.yml:12-15` is exactly a half-pinned case (only
`provider: deepseek-official`, no model key).

The motivation for the schema having no default (`src/index.ts:64-71`,
issue #30): ".default() here would make an unset key indistinguishable
from an explicit cordis.yml choice and the persisted `/model` preference
could never win".

Persistence (`src/modelPrefs.ts`): `~/.dsh-cc/model.json` (:16-22), written
as { provider, model } JSON; parseModelPref requires both halves to be
non-empty strings, and any exception/missing half/non-object always
returns undefined (:24-41, a best-effort read).

## Startup route resolution

```text
src/plugin.ts:129  startupRoute = resolveModelRoute(configuredRoute, readModelPref())
  -> resolveAgent (src/plugin.ts:352-429):
     the resume branch (:363-391) route: resumeRoute ?? recordedModelRoute(...)
     the create branch (:400-433) validateModelRoute checks the catalog, falling back the whole pair on rejection
  -> displayRoute = createdRoute ?? startupRoute passed into createChannel
     (src/plugin.ts:143-147)
  -> ChannelState.model/provider initialized from options (src/channel.ts:1055-1062)
  -> StatusLine's left group renders channel.model as its first field (src/screens/StatusLine.tsx:91-94; :57-87
     is the TPS readout area)
```

## The /model command pipeline

```text
/model -> src/screens/Chat.tsx case 'model' (:463-473): opens the picker, channel.listModels()
  pulls the full provider catalog, with initial focus aligned to the current provider/model
  -> listModels walks llm.listProviders() and flattens the concurrent listModels calls
     (src/channel.ts:1827-1838, returns an empty array when there's no llm service)
  -> ModelPicker's Enter -> channel.switchModel(model.provider, model.id)
     (src/screens/Chat.tsx:979-990, first notifies 'Switching model to …')
  -> switchModel (src/channel.ts:1575-1686):
     rejected while working
     -> forks the whole log with no boundary (continuing the session)
     -> creates a new agent with agentOptions: { provider, model }
     -> resets and replays history; explicitly sets state.model = model / state.provider = provider
     -> touchSession(childId) makes the switched-to fork the MRU
     -> writeModelPref persists it (:1677-1684's comment: "Persist the choice so the
        next boot and `/new` start on it (same contract as /preset and
        Shift+Tab effort; issues #14/#30)"; a write failure only warns and doesn't block the live switch)
  -> after state.emit(), StatusLine re-renders showing the new channel.model
```

This pipeline **never calls resolveModelRoute** — the switch assigns
directly, and resolution only happens at startup / /new / resume.

## /resume status-bar tracking (fix 4d48eb6)

Behavior before the fix (per the commit message): resumeTo never reset
state.model/state.provider, and the request/header replay only consumed
reasoningEffort, so after resuming a session with a different route, the
status bar kept showing the stale route from startup resolution,
mismatched with the actual request route.

Two paths after the fix:

```text
The startup --resume path:
  resolveAgent's resume branch returns route: resumeRoute ?? recordedModelRoute(
  resumed.agent.session.events) (src/plugin.ts:386-391)
  -> displayRoute lands on the session's record

The in-session /resume path:
  resumeTo (src/channel.ts:1371-1426):
  resumeRoute = explicitModelRoute(configured) (:1382-1385, only a complete cordis.yml
    route can override the session's record)
  -> agents.resume takes resumeRoute?.provider/model as agentOptions (:1387-1391)
  -> resumedRoute = resumeRoute ?? recordedModelRoute(handle.agent.session.events)
     (:1422)
  -> state.provider/state.model are written from resumedRoute (:1423-1426); an
    empty log (a turn that was never started) records undefined, keeping
    the existing display (best effort)
```

recordedModelRoute (`src/modelRoute.ts:63-87`): walks the session's durable
event log backward and takes the (provider, model) from the first
request/header's data.header.config it finds — "the last request/header
snapshot carries the call config the agent loop builds its requests from,
so it IS the route a resume continues on". The request/header replay
branch only consumes reasoningEffort and header.system, and never
reads/writes provider/model (src/channel.ts:2816-2828); the fix relies on
an explicit assignment rather than the replay.

## /new routing semantics

`newSession` (src/channel.ts:1456-1573):

```text
newResolved = resolveModelRoute(configured, readModelPref(),
  {provider: options.provider, model: options.model}) (:1487-1491)
  — the just-switched /model preference has already been written by
  writeModelPref and is read back by readModelPref, so /new follows the
  current model; the startup route acts as the defaults fallback
  -> validateModelRoute's catalog check falls back the whole pair to the startup route and warns on rejection (:1492-1508)
  -> agents.create takes route as agentOptions (:1510-1520)
  -> state.model/provider = route (:1548-1549)
```

## validateModelRoute

`src/modelRoute.ts:89-114`, a best-effort catalog check: when the model
can't be found in a non-empty catalog, the whole pair falls back to
fallback; with no llm service / an empty catalog / a failed query, the
route is always trusted and startup is never blocked — "a stale persisted
choice surfaces at startup instead of as a server-side model-name error".

## Regression

`scripts/verify-model-route.mjs`: 9 scenarios, 16 assertions, asserting
directly against the compiled output lib/types/modelRoute.js (requires
`pnpm build` first); runs after the build in CI, exiting non-zero on
failure (.github/workflows/ci.yml:67). Covers: a provider-only config +
a complete pref → the pref wins as a whole pair; a complete config wins
as a whole pair; a model-only half-pin → the pref wins; both absent →
the default route; a half-pin with no pref → the default pair; an empty
string is treated as unset; /new's semantics = the startup route acting
as the defaults fallback; validateModelRoute falls back the whole pair on
catalog rejection / trusts the route on an empty catalog or a failed
query; recordedModelRoute's last request/header wins, a bare log returns
undefined, a malformed header is skipped.

## Conflicts

| Item | Both sides |
| --- | --- |
| ModelPicker's comment is stale | `src/components/ModelPicker.tsx:12-13`'s comment claims the model is "fixed at creation time, so a selection notifies restart to apply"; it actually calls switchModel immediately on Enter for a live fork switch ("switch the live model by forking the conversation at its current end"), and no restart-to-apply notification exists anywhere in the code path |
| /config copy is stale | i18n's doctor-route-hint (`src/i18n.ts:153`) claims /model only takes effect after a restart and that the route is decided by the llm-deepseek section; it actually does an immediate fork switch that persists (taking effect on the next start//new); and the llm-deepseek section (cordis.yml:33-39) only has apiKeyEnv/baseURL/thinking/reasoningEffort — the provider is pinned in the cc-tui section (cordis.yml:15) |
| /doctor mixes old and new sources | `src/channel.ts:2106`: the model comes from the mutable state.model, but the provider comes from the startup config options.provider — after a /model switch, the display shows a mismatched provider/model pair; the Channel interface's comment "Resolved model id (from the plugin config)" (src/channel.ts:261) also doesn't match the fact that model can be rewritten by resume/new/switch |

## Unverified items

- The real writer of the request/header event structure's
  data.header.config.{provider,model}, which recordedModelRoute depends on
  (the dsh-agent loop — this repo only consumes it and never writes it;
  the commit message and comment's claim is strong indication rather than
  explicit evidence).
- Whether the status bar tracks the session's record under
  src/plugin.ts:368-370's attach-existing branch (ctx.agents.get(existing)
  returns directly, with no route field) is unconfirmed.
- Whether the request/header produced by a new session after a /model
  switch carries the new provider/model (depends on how dsh-agent consumes
  agentOptions).

Related documents: [lifecycle.md](lifecycle.md) (startup order and agent
resolution), [input-commands.md](input-commands.md) (the /model command
entry point), [session-context.md](session-context.md) (the /resume
contract), [unknowns.md](unknowns.md).
