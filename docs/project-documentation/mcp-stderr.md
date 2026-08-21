# MCP integration and subprocess stderr aggregation

This document covers the fix for issue #17: taking over an MCP subprocess's
raw writes to the terminal via stderr, aggregating/deduplicating them, and
presenting them as a controlled notification, plus where MCP servers are
declared and how /mcp displays status. All line numbers are relative to the
audit baseline b2f4087.

## The problem (issue #17)

MCP servers are spawned by the MCP SDK's `StdioClientTransport` under
`@deepseek-ai/dsh-mcp-client`, whose stderr defaults to `'inherit'`
(`stdio: ['pipe', 'pipe', server.stderr ?? 'inherit']`,
`src/childStderr.ts:4-13`). The inherited fd 2 is written directly to the
terminal device **by the child process** — those bytes never pass through
this process's patched `process.stderr.write` (the defense that intercepts
stray writes from config.ts/hooks/third-party deps,
`src/ink/ink.tsx:1614-1661`'s patchStderr), so they paint over the parked
cursor position and interleave with the diffed renderer's absolute-position
writes — exactly the overlapping garbage seen in issue #17's screenshots.

## The fix: a spawn-patching guard

`src/childStderr.ts` (added in commit 8c2429b, authored by FUSU123fusu,
2026-08-14, merged into main in commit 715b60f; 13 files changed: adds
childStderr.ts at 193 lines and verify-child-stderr.tsx at 140 lines, changes
plugin.ts +32, i18n.ts +2, ci.yml +4, plus the lib build output):

```text
installChildStderrGuard (src/childStderr.ts:87-117):
  replaces child_process.spawn with a patched version, returning a restore
  function (subprocesses already in flight when it's installed keep their
  already-redirected pipes)
  -> redirectInheritedStderr (:42-59): touches only fd 2 —
     the string 'inherit' as a whole -> ['inherit','inherit','pipe'] (keeps
       stdin/stdout inherited, :45-49)
     an array with stdio[2] === 'inherit', or a bare fd 2 -> 'pipe' (:50-58;
       a short array defaulting fd 2 is treated as already safe; every other
       form — default/'pipe'/'ignore'/an explicit stream — is left alone)
     stdin/stdout keep their original mode, so the MCP JSON-RPC channel is
     unaffected
  -> drainLines (:61-79): splits into lines on \n and hands them to the sink;
     flushes an unterminated tail on the stream's 'end'; silently swallows
     'error' events (a broken pipe must not take down the TUI)
```

Reachability rationale (:21-27): the MCP SDK spawns via cross-spawn, and
cross-spawn reads child_process.spawn from the CJS exports object at call
time, so the patch can intercept it (an ESM named-import snapshot —
`import { spawn } from 'node:child_process'` — would bypass it, but nothing
in the dependency tree consumes it that way).

## Aggregation and deduplication

`createChildStderrReporter` (`src/childStderr.ts:146-193`), with default
parameters debounceMs=1500, cooldownMs=30_000, maxLineLength=200
(:124-131,150-152):

1. ANSI stripping (a CSI/OSC regex, :32-35) — "raw child output can't inject
   cursor moves or colors into the notification area";
2. trimming, dropping empty/whitespace-only lines;
3. truncating overly long lines with an ellipsis (a 200-character cap);
4. a groups Map keyed by the cleaned-up line: a repeated line increments
   count and resets the debounce timer; lines within a 1.5s quiet window are
   batched together;
5. flush: silent within the 30s cooldown window; uses
   'child-stderr-line-repeat' ("repeated N times") when count>1, otherwise
   'child-stderr-line';
6. finally calls `notify(text, { color: 'error', timeoutMs: 8000 })`
   (:161-186).

i18n copy (`src/i18n.ts:52-53`): 'Subprocess stderr: {{line}}' /
'Subprocess stderr: {{line}} (repeated {{count}} times)'.

**No config toggle**: the config schema (src/index.ts:64-80) has no
mcp/stderr keys at all; src/plugin.ts:102 calls createChildStderrReporter
without passing options, so everything runs on the defaults;
ChildStderrReporterOptions is API surface only. CC_TUI_DEBUG only controls
whether the raw line also goes into the debug log
(src/utils/debug.ts:7-11) — it's not a guard toggle.

## Install point and UI presentation

```text
plugin.apply (src/plugin.ts:93-115): installs the guard inside ctx.effect
  (installChildStderrGuard, whose sink feeds both logForDebugging and
  stderrReporter.push)
  — declared before agent resolution (resolveAgent, :131), so it covers any
  spawn during startup;
  notifications before the channel exists go into the stderrBacklog buffer
  -> once the channel is created, notifyStderr = channel.notify and the
     backlog is flushed (src/plugin.ts:166-171)
  -> channel.notify (src/channel.ts:1704-1720): pushes a NotificationItem
     (default timeoutMs 4000, 8000 for stderr notifications) + emit(),
     spliced out after the timeout
  -> src/screens/Chat.tsx:118 useSyncExternalStore(channel.subscribe, () =>
     channel.version) subscribes and re-renders
  -> PromptInput renders the latest notification: position=absolute,
     floating one line above the input box, right-aligned, taking zero
     layout height (src/components/PromptInput.tsx:798-839, "position=absolute
     takes zero layout height so the transcript never shifts")
```

Defense in depth (inline mode): an idle gap in stdin (>5s) triggers
requestViewportReanchor to repaint the viewport, self-healing row drift
caused by a third-party tty write (including an MCP subprocess's stderr)
(src/ink/ink.tsx:918-931, "a third-party tty write during the idle gap (an
MCP subprocess's stderr, issue #17) shifts every subsequent write by N
rows").

## MCP server declaration and /mcp

- **The repo's shipped cordis.yml and cordis.patch.yml contain no MCP rows
  at all** (a grep for mcp/MCP has zero matches); the declaration point is
  the user's profile patch layer — docs/configuration.md:102 says "insert
  into your user cordis.patch.yml", and i18n's mcp-insert-hint is more
  specific, naming `~/.dsh/profiles/cc-tui/cordis.patch.yml`.
- Empty-state guidance (src/channel.ts:2003-2012): when /mcp finds no
  mcp__ tools, it returns "No MCP servers configured" plus an example
  insert row (id: mcp-context7 / name: '@deepseek-ai/dsh-mcp-client' /
  config: { transport: stdio, serverName: context7, command: npx, args:
  ['-y', '@upstash/context7-mcp'] }).
- Once mounted (src/channel.ts:1988-2019): rows are grouped by
  dsh-mcp-client's naming contract `mcp__<server>__<tool>` using the regex
  `^mcp__([a-z0-9-]+)__(.+)$`; the /mcp command is presented via
  channel.pushLocal as local + local-output rows
  (src/screens/Chat.tsx:636-638).

## Verification

`scripts/verify-child-stderr.tsx` has 15 checks and is mounted in CI
(.github/workflows/ci.yml:63,
`node --import tsx/esm scripts/verify-child-stderr.tsx`):

1. Before takeover: an inherited child's stderr reaches fd 2 directly and
   child.stderr===null (reproducing the issue); the fixture calls spawn
   through the default-imported CJS exports object (:36-43, "this is the
   access pattern the patch must cover (cross-spawn does exactly this)");
2. After takeover with array-form stdio: raw output no longer reaches fd 2,
   and the line reaches the controlled sink;
3. The string-form 'inherit' is intercepted the same way;
4. Reporter unit tests: the same line fired 3 times in a row produces only
   one notification with "repeated 3 times"; silence during the cooldown;
   notifications resume once the cooldown ends; different lines each get
   their own notification; ANSI stripping; overly long lines truncated with
   an ellipsis; empty lines dropped.

## Conflicts and unverified items

| Item | Notes |
| --- | --- |
| Origin of the MCP SDK default | The StdioClientTransport stderr default of 'inherit' is only found in source comments and commit messages; node_modules isn't installed, so it can't be checked against the upstream @modelcontextprotocol/sdk source (strong indication rather than explicit upstream evidence) |
| cross-spawn behavior | "reads child_process.spawn from the CJS exports at call time" is only stated in a comment; the verify script replicates that access pattern but never actually loaded cross-spawn/dsh-mcp-client to confirm it |
| Timing of the first spawn | Whether dsh-mcp-client's first spawn in a real profile launch is guaranteed to happen after cc-tui's apply installs the guard (ctx.effect runs synchronously) depends on the external bundle's load order, which is outside this repo |
| Original content of issue #17 | Screenshots/repro steps are only paraphrased from commit messages and source comments; the repo contains no issue body |
| Wording mismatch (not substantive) | Commit 8c2429b's message describes rewriting "the 3rd position of the stdio array"; the code uses the index stdio[2] (0-based) — different phrasing, same meaning |

Related documents: [lifecycle.md](lifecycle.md) (assembly order),
[session-context.md](session-context.md) (context and tools),
[rendering.md](rendering.md) (idle re-anchor self-healing),
[unknowns.md](unknowns.md).
