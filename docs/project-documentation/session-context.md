# Session persistence and context

This document covers three areas: the resume contract and multi-session
management (resume.txt, the /resume picker, MRU), the session-persistence
backend (the JSONL/SQLite documentation conflict), and loaded context and
the teardown split (issue #12). All line numbers are relative to the audit
baseline b2f4087.

## The resume contract

Contract summary (`src/sessionHistory.ts:1-9`): the TUI writes the selected
session id to `~/.dsh-cc/resume.txt`, and the launcher feeds it back via
the `DSH_CC_RESUME_SESSION` environment variable; **the session record
itself lives in the DSH persistence backend
(dsh-session-persistence-jsonl) — resume.txt only carries the id across
processes**.

```text
On exit (onUserExit, src/plugin.ts:199) and on a /resume selection (src/channel.ts:1449):
  writeResumeTarget(sessionId) writes ~/.dsh-cc/resume.txt (src/sessionHistory.ts:36-39,
  written as-is with no trailing newline)
  On /new, clearResumeTarget() writes an empty string to clear the marker (src/channel.ts:1568;
  src/sessionHistory.ts:42-48)
  -> Windows: dsh-cc.cmd --resume reads %USERPROFILE%\.dsh-cc\resume.txt,
     injects it into DSH_CC_RESUME_SESSION via set /p (dsh-cc.cmd:29-32), forwarding
     the rest of the args to @dsh --profile cc-tui (:40)
  -> cordis.yml:27 and cordis.patch.yml:203: the cc-tui row's
     sessionId: !!js process.env.DSH_CC_RESUME_SESSION ?? undefined
  -> src/plugin.ts:131-138: apply passes config.sessionId to resolveAgent
  -> src/plugin.ts:365-398: ctx.agents.resume (the preset takes the target log, and routing
     only allows a fully pinned override, see [model-route.md](model-route.md)); a missing
     artifact or an unmounted backend degrades to creating a new session
```

The resume command shown at exit (src/plugin.ts:477-489): `dsh-cc --resume
<id>` on win32, `DSH_CC_RESUME_SESSION=<id> dsh --profile <p>` on other
platforms; the package itself doesn't ship a dsh-cc bin.

## The /resume picker and MRU

```text
/resume -> channel.listSessions() (src/channel.ts:1854-1918):
  sessionPersistence.list() takes every header
  -> isolated exactly by cwd ("Claude Code's project dimension": only sessions
     launched from this session's directory are listed)
  -> readLastUsed() takes last-used.json for MRU ordering (falling back from
     updatedAt to createdAt; "DSH session headers carry only createdAt",
     hence the need to self-maintain it)
  -> the first 20 entries are loaded in full to take the first user/message as the title; a launch
     artifact with no user/message is dropped from the picker
  -> excludes the current session (agents.resume rejects a live session); notifies
     resume-none-in-cwd when empty
  -> Enter -> channel.resumeTo(session.id) (src/screens/Chat.tsx:954-965, notifies
     'Session resumed' on success)
  -> resumeTo (src/channel.ts:1349-1455): rejected while working -> composePreset
     (resolvePersistedPreset) composes against the target log -> agents.resume ->
     coalesceReplayEvents replays -> writeResumeTarget(sessionId) (refreshes
     resume.txt) -> touchSession(sessionId) (updates MRU)
```

touchSession's trigger points (every path that changes the active session;
channel.ts's comment: "The current session is being used — move it to the
MRU front (/resume sorts by last-used)"): submit(1151), steer(1160), a
requeue on interruptAndDeliver(1206), rewindTo's fork(1344),
resumeTo(1451), newSession(1570), switchModel's fork(1674).
Implementation (src/sessionHistory.ts:91-99): readLastUsed() merges and
writes back `{…lastUsed, [sessionId]: Date.now()}` to
~/.dsh-cc/last-used.json, best-effort and never throws.

## Session persistence backend and the JSONL/SQLite documentation conflict

### The config side (the code's current reality, all explicit evidence)

- `cordis.patch.yml:143-149`: the profile composition has exactly one
  session-persistence-jsonl override row — "Sessions live in the shared
  JSONL store (~/.dsh/sessions) — the same backend dsh web writes — so
  /resume here and the web session list see each other (#24)"; the root
  defaults to `dshHomePath('sessions')`, and the comment states this row
  comes from the dsh-base layer, with this override only changing the root
  when DSH_CC_SESSION_ROOT is set (test isolation). **The whole patch has
  no SQLite row and no "disable JSONL" row.**
- `cordis.yml:158-164`: the bare composition also mounts
  `@deepseek-ai/dsh-session-persistence-jsonl`, with root defaulting to
  `(USERPROFILE ?? HOME)/.dsh-cc/sessions` (:164).
- `scripts/migrate-sessions-to-jsonl.mts:1-16`: a one-time migration
  (#24) that copies the "retired cc-tui SQLite store"
  (~/.dsh-cc/sessions.sqlite) into the shared JSONL store (defaulting to
  $DSH_HOME/sessions ?? ~/.dsh/sessions); the source file is left
  untouched and the migration is idempotent and rerunnable.
- Commit 43f271f (#37/#24): the patch layer previously inserted sqlite
  itself and disabled the base JSONL; this commit "removes the disable
  row and the sqlite-insert row, letting the base layer's
  session-persistence-jsonl take effect"; 9017204 confirms the bundle
  layer inherits that row from dsh-base.
- `package.json:92-93`: both the jsonl and sqlite backend dependencies
  are in devDependencies (sqlite serves only the migration script).
- `scripts/run.ts:196`'s comment still says "inserts cc-tui front door +
  SQLite" (a stale comment that doesn't match the patch's actual
  contents).

### The doc side (the older account)

| Document | Claim |
| --- | --- |
| `docs/configuration.md:154-162` | The profile uses this package's SQLite `sessions` row, and disables base's JSONL persistence (avoiding a dual-write owner); the default file is ~/.dsh-cc/sessions.sqlite; a bare cordis.yml uses JSONL, defaulting to ~/.dsh-cc/sessions/; the two launch methods shouldn't share the same data directory |
| `docs/configuration.md:139` | DSH_CC_SESSION_ROOT is the SQLite database path under a profile install, and the JSONL root directory under a bare cordis.yml |
| `docs/architecture.md:77,85-86` | The persistence table lists ~/.dsh-cc/sessions.sqlite as the profile patch's default; DSH_CC_SESSION_ROOT rewrites the SQLite path |
| `docs/getting-started.md:71` | The patch overrides or inserts "SQLite session persistence" |

### Verdict and open questions

The current config is treated as authoritative: **both compositions
(cordis.yml and cordis.patch.yml) are JSONL, and the SQLite claim is
marked "documentation conflict / unconfirmed"**. The docs describe the
state before 43f271f (#37). Points that can't be confirmed from this repo
alone:

- Whether an SQLite row exists in the dsh-base layer's final composition
  (the base layer's content is in node_modules, which isn't installed and
  can't be read; a patch's semantics is a whole-row override, and whether
  an override causes double-mounting depends on the dsh Loader's rules).
- The documented semantics of DSH_CC_SESSION_ROOT (an SQLite path)
  directly conflicts with both implementations (a JSONL root override) —
  the implementation side is unambiguously consistent.

## Input-command history

`src/history.ts` manages **input-command history** (unrelated to session
history): `~/.dsh-cc/history.jsonl`, one {text, ts} JSON object per line
(:6-14); appendHistory appends, deduplicates adjacent repeats (CC's
behavior: resubmitting the same thing just advances the timestamp), and
truncates via slice(-200) (HISTORY_LIMIT=200, :45-68); loadHistory returns
it in reverse order (newest first, :70-85) for the Ctrl+R search box (see
[input-commands.md](input-commands.md#ctrlr-history-search)); historyEntryId
uses the first 12 characters of sha1(text) as the React key. All write
points are in PromptInput's five send paths (submit/steer/queue/interrupt/
slash, :238/263/281/327/351).

## Loaded context

### Snapshot assembly

The LoadedContext snapshot has five groups (src/channel.ts:226-244's
comment: "Snapshot of everything a fresh conversation for the current
agent will load"): ordered system-prompt sections, dynamic context
contexts, workspace instruction files files (the AGENTS.md family), skills
skills, and tools tools. `Channel.loadedContext` is "computed at boot and
on every agent swap" (src/channel.ts:320-327); it's undefined while the
snapshot hasn't been assembled yet, and the panel stays hidden.

```text
refreshLoadedContext (src/channel.ts:2165-2218):
  systemPrompt.assemble(assembleContextFor(target)) produces sections/contexts/tools
    (src/channel.ts:2175); each section is rendered through renderPrompt's strict
    interpolation, "keeping non-empty results" (src/channel.ts:2180-2192)
  -> dynamic context comes from renderContextSections(assembly) (src/channel.ts:2189-2192,
     an upstream dsh-system-prompt assembly artifact, not the TUI directly
     querying the tool registry)
  -> files comes from @deepseek-ai/dsh-agent-instructions's
     discoverBaselineInstructionFiles({cwd}), taking only displayPath (src/channel.ts:2194-2196)
  -> skills is read via serviceForAgent(ctx, target, 'skills') following the agent's scope chain
     (skills registered at the preset layer resolve too, src/channel.ts:2201-2210)
  -> race protection: after each async source finishes, it checks if (target !== agent) return, so
     a snapshot computed for a stale agent is discarded (src/channel.ts:2176,2195,2206,2212-2215); a total
     failure only logger.warns, and the panel never shows a broken snapshot
```

Trigger points: the end of createChannel (src/channel.ts:2244) + the four
agent-swap paths rewindTo(1342) / resumeTo(1447) / newSession(1567) /
switchModel(1672).

### The startup panel and `/context`

- The startup panel only shows when `channel.rows.length === 0 &&
  channel.loadedContext !== undefined`; it's collapsed to a one-line
  summary by default, Ctrl+P expands/collapses the grouped detail, and the
  whole panel disappears once the transcript's first row lands.
- `/context` outputs a local report to the current transcript once via
  `channel.pushLocal` on every invocation; it doesn't toggle any persistent
  state, and never enters the model context or the session's event log.
  Ctrl+T always only opens the session trajectory, and Ctrl+P only takes
  effect while the startup panel is on screen.
- A single text entry is capped at 800 characters
  (src/utils/loaded-context.ts:5, CONTEXT_ENTRY_MAX_CHARS);
  truncateContextText keeps only the head and appends a truncation marker;
  the comment states explicitly "model-visible text is the source of
  truth" — the local report only constrains its own rendering, and doesn't
  affect what the model actually receives; tool descriptions are truncated
  separately at 160 characters.
- summarizeLoadedContext concatenates only the non-empty groups into a
  one-line summary, returning '' when everything is empty, which hides the
  whole panel (src/utils/loaded-context.ts:26-34).

### The path context takes to reach the agent

deliverUserText (src/channel.ts:927-961): the sendChain FIFO →
expandMentions expands @ references into attachment blocks →
createUserMessage({content: blocks, source: {kind:'user'}}) (typed text is
always the first block) → agent.followup(message) (followup) or
agent.steer(message) (steer). There's no direct message channel between the
TUI and dsh-mcp-client (src/channel.ts:1988-2018: MCP tools appear in the
tool runtime under the public name `mcp__<server>__<tool>`, and /mcp status
lists them grouped by server) — context is assembled by the agent, and the
panel is only a read-only snapshot.

### The low-context warning

Fires once per session (gated by contextWarned), when remaining tokens
drop below 20_000: "Context low (X% remaining) · Run /clear or start a new
session" (src/channel.ts:788-789, 884-899,
CONTEXT_WARNING_BUFFER_TOKENS = 20_000).

## Teardown vs. the exit split (issue #12)

Root cause (commit 3f0aa69): after the DSH launcher starts, it always does
one whole-tree recompose; the plugin context's ctx.effect cleanup was
triggering instance.unmount() → waitUntilExit() settling →
handleExit → disposeRootAndExit(ctx, 0), exiting the process with code 0
— "flashing back to bash".

| Path | Behavior | Location |
| --- | --- | --- |
| A cordis-context teardown (launcher recompose) | `ctx.effect(() => () => { funnel.markTeardown(); instance?.unmount() })` — only unmounts the UI without exiting the process; after the recompose, the loader reruns apply/render to remount the TUI; doesn't write the resume marker and doesn't call disposeRootAndExit | src/plugin.ts:320-323 |
| A user exit (/exit, a double Ctrl+C/Ctrl+D) | onUserExit (src/plugin.ts:193-263): writeResumeTarget(channel.agentId) writes resume.txt → instance?.unmount() (restores the terminal cursor/raw mode/mouse tracking + a newline to avoid overlapping the prompt) → on error, disposeRootAndExit(ctx,1) + stderr "cc-tui crashed"; on success, prints the resume hint then disposeRootAndExit(ctx,0) | src/plugin.ts:172-180's comment: "Teardown only unmounts the UI; user exit runs the full leave sequence", "the two must not share a fate (issue #12)" |

createExitFunnel's implementation (src/plugin.ts:450-467): the teardown
flag makes handleExit return early, and the exited latch guarantees
onUserExit runs only once; "Exported for
scripts/verify-teardown-exit.tsx". disposeRootAndThen (src/plugin.ts:497-510):
ctx.root.fiber.dispose() reclaims the whole tree, with a 5-second fallback
timer (unref'd) guaranteeing the exit code doesn't hang.

Ctrl+C/Ctrl+D semantics (src/screens/Chat.tsx:1178-1192): while
working→channel.cancel(); while idle with text present→just clears the
input and disarms the exit; with empty input→requestExit() (a double-press
within a 3-second window, :221-245 "first press arms an exit, second press
exits"); Ctrl+D goes straight to the double-press exit regardless of input.
Ink is started with exitOnCtrlC: false (src/plugin.ts:303) — Ctrl+C is
handled entirely by the TUI itself (under Windows ConPTY, Ctrl+C arrives as
stdin data, with no SIGINT). The /exit local command calls onExit()
directly (src/screens/Chat.tsx:519-521).

Regression: scripts/verify-teardown-exit.tsx has 4 assertions (teardown
doesn't trigger onUserExit, teardown swallows the error path, a normal
handleExit runs exactly once, handleExit(error) forwards the error),
mounted in CI (.github/workflows/ci.yml:40-41).

## Conflicts

| Item | Both sides |
| --- | --- |
| JSONL vs SQLite session backend | See "Session persistence backend and the JSONL/SQLite documentation conflict" above — the config side is entirely JSONL, the doc side entirely claims SQLite; the config is treated as authoritative and it's marked "documentation conflict / unconfirmed" |
| Injected-context display accounting | docs/architecture.md:107 and README.md:186 claim "plugin context injected into the system prompt is not listed separately in the UI"; src/components/LoadedContextPanel.tsx:82-88 actually renders context.contexts as a separate Group ("runtime context") — the precise fact: the panel shows a runtime-context group on an empty transcript, but injected messages within the transcript still aren't shown |
| /doctor storage-path mismatch | src/channel.ts:2118-2119 checks ~/.dsh-cc/sessions; the actual JSONL root is dshHomePath('sessions') (~/.dsh/sessions, cordis.patch.yml:149) |
| index.ts's comment is stale | src/index.ts:2-3,84's comment claims the implementation lives in ./plugin.tsx; the repo has no such file — the implementation is actually in src/plugin.ts (React.createElement, pure TS) |
| The resume read/write API never formed an internal loop | Channel.setResumeTarget (src/channel.ts:421-423,1919-1921) and readResumeTarget (src/sessionHistory.ts:54-61) have no production caller anywhere in the repo — the actual loop is closed by dsh-cc.cmd reading the file directly |

## Unverified items

- Whether an SQLite row exists in the profile's final composition (the
  dsh-base layer is in node_modules, unreadable and unverifiable); the
  final composed effect of "disabling base's JSONL persistence" depends on
  the dsh Loader's override rules.
- Physical encoding details of dsh-session-persistence-jsonl (zstd, packed
  chunk runs, etc. — only inferable indirectly from the migrate script's
  comments).
- Whether the LoadedContextPanel's tools group includes MCP tools
  (mcp__server__tool) — depends on upstream dsh-agent/dsh-system-prompt
  assembly.
- How the MCP subprocess/other services are reclaimed at teardown (the
  teardown path only does markTeardown+unmount; subprocess lifecycle
  belongs to the upstream service).
- The exact microtask timing of the waitUntilExit settlement.
- The actual format of ~/.pi/agent/working-activity.json and the pi
  extension's behavior (activityPrefs.ts's comment claims it mirrors its
  frames key; the pi extension isn't in this repo).

Related documents: [lifecycle.md](lifecycle.md) (the exit funnel),
[model-route.md](model-route.md) (resume route tracking),
[input-commands.md](input-commands.md) (the /resume, /new commands),
[unknowns.md](unknowns.md) (the unverified-items list).
