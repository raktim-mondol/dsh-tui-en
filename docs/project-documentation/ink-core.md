# The ported Ink kernel architecture map

This document describes the render kernel formed by `src/ink/` (103 files)
and `src/native-ts/yoga-layout/`: its porting origin, the render pipeline,
layout and measurement, the input chain, the terminal protocol, and its
structural differences from released Ink 5.2.0. All line numbers are
relative to the audit baseline b2f4087.

## Porting origin and baseline

`src/ink/` is a **port of Claude Code's internal ink fork**, not the
vadimdemedes/ink open-source upstream. Threefold evidence:

1. `src/ink/ink.tsx:1464-1476` and elsewhere use `updateContainerSync`/
   `flushSyncWork`/`ConcurrentRoot`, which are react-reconciler 0.33
   conventions (package.json:97 declares `@types/react-reconciler`
   ^0.33.0, which the lockfile resolves to 0.33.0), yet that @types
   package has no such exports, requiring a "ported CC build" ts-ignore to
   mask it (src/ink/ink.tsx:260-261's own comment says "0.32.3 declares 11
   args", which contradicts :797's "react-reconciler 0.31" — the version
   number is taken from package.json's actual 0.33.0);
2. `src/ink/hooks/use-terminal-size.ts:7`'s comment: "Terminal dimensions
   from the Ink app shell (ported from the leak)";
3. `src/ink/termio/osc.ts:498-500`'s `supportsTabStatus()` gates on
   `process.env.USER_TYPE === 'ant'` — "ant" is Claude Code's internal
   codename.

Structural differences from released Ink 5.2.0 (explicit evidence,
checked directly against the repo):

| Difference | Evidence |
| --- | --- |
| No Static.tsx / Transform.tsx components | A repo-wide Glob/Grep finds only `src/ink/root.ts:127`'s comment mentioning "Static write" — the component files don't exist; that comment is a porting leftover |
| No use-stdout / use-focus hooks | None of the 14 files in hooks/ have either; focus is managed by the FocusManager class, and raw output goes through TerminalWriteContext |
| New ScrollBox / NoSelect / RawAnsi / AlternateScreen etc. components | See the component table below |
| The layout engine was swapped for a pure-TS yoga port | `src/native-ts/yoga-layout/index.ts:1-39`: "Pure-TypeScript port of yoga-layout (Meta's flexbox engine)", synchronous, no WASM |

## The render pipeline

```text
src/ink/root.ts wrappedRender (await Promise.resolve() holds the microtask boundary, src/ink/root.ts:121-135)
  -> Ink.render(): <App> wrapped in TerminalWriteProvider, then updateContainerSync + flushSyncWork
     (src/ink/ink.tsx:1464-1476, createContainer uses ConcurrentRoot, src/ink/ink.tsx:262)
  -> reconciler commit -> resetAfterCommit (src/ink/reconciler.ts:276-344)
     -> onComputeLayout: rootNode.yogaNode.setWidth(terminalColumns) + calculateLayout
        (src/ink/ink.tsx:239-258, layout at commit time)
  -> rootNode.onRender -> scheduleRender = throttle(deferredRender, FRAME_INTERVAL_MS=16ms,
     leading+trailing) (src/ink/ink.tsx:212-216; deferredRender is queueMicrotask(onRender))
  -> the onRender main pipeline (src/ink/ink.tsx:420-794):
     renderer() builds a Frame (src/ink/renderer.ts:44-121, reuses Output across frames, charCache persists)
       - invalid yoga dimensions -> an empty frame
       - in alt-screen, height = terminalRows, overflow clamped
       - prevScreen is set to undefined to block a blit when absoluteRemoved or prevFrameContaminated
     -> injects the selection/search overlay into the StylePool (src/ink/ink.tsx:539-549
        applySelectionOverlay/applySearchHighlight; search-hit highlighting via
        applyPositionedHighlight is in src/ink/render-to-screen.ts:230-249)
     -> full-damage determination: didLayoutShift || selActive || hlActive || prevFrameContaminated
     -> alt-screen CSI H anchoring
     -> log.render(prevFrame, frame): generates the diff as Patch[] (src/ink/log-update.ts:173-558)
     -> a 5-minute pool reset -> optimize(diff) (src/ink/optimizer.ts:45-95: merge cursorMove
        :44-52 / collapse cursorTo :54-58 / hyperlink dedup :70-77 / cancel matched pairs
        cursorShow-Hide :79-87)
     -> cursor parking (src/ink/ink.tsx:660-739)
     -> writeDiffToTerminal, a single buffered write (src/ink/terminal.ts:243-316)
```

The write-screen baseline: `buffer = (useSync ? BSU : '') + SGR_RESET +
link('')`, where BSU/ESU are the DECSET/DECRESET 2026 synchronized-output
sequences (`src/ink/terminal.ts:204`); `SYNC_OUTPUT_SUPPORTED` is
determined at module-load time: always false under tmux, and an allowlist
covering iTerm/WezTerm/Warp/ghostty/contour/vscode/alacritty/kitty/foot/
zed/WT/VTE≥6800 (`src/ink/terminal.ts:76-124`).

Frame diffing (`log-update.ts`): `LogUpdate.render()` uses DECSTBM hardware
scrolling (shiftRows + setScrollRegion + csiScrollUp/Down +
RESET_SCROLL_REGION + CURSOR_HOME, :228-251); a shrink/re-anchor uses
`repaintViewportInPlace` (:285-337, fixing #38/#39/#19's duplicated UI);
rows above viewportY are skipped (:369-376 computes it, :445-447 does the
actual skipping); a "steady-state scrollback check removed" comment
(:292-297); fullResetSequence_CAUSES_FLICKER is defined at (:594-604); the
non-TTY `renderPreviousOutput_DEPRECATED` only emits [NEWLINE] (:92-98).

## Layout and text-measurement chain

```text
commitUpdate/markDirty walks up the parent chain, marking only ink-text/ink-raw-ansi leaves dirty, once each
(src/ink/dom.ts:569-589)
  -> calculateLayout(width, undefined, Direction.LTR) (src/ink/layout/yoga.ts:90-92)
  -> native-ts's pure-TS single-pass flexbox: a generation counter + roundLayout;
     a 4-slot LRU cacheWrite: "Clean nodes' old entries stay" hit across generations
     (src/native-ts/yoga-layout/index.ts:1387-1508; the scroll hot path sees 499 clean-message
     cache hits)
  -> Text measurement:
     src/ink/dom.ts:445-549's incremental MeasureWrapCache (a WeakMap; when text.startsWith(cached.text),
       only the tail is rewrapped and only the completed lines are committed, carrying headHeight)
     measure-text.ts's single pass: height += (w===0 ? 1 : ceil(w/maxWidth))
     line-width-cache.ts caches stringWidth per line, with detachString (a Buffer round-trip)
       breaking off a SlicedString
     wrap-text.ts's truncate uses sliceFit's wide-character retry + '…'
  -> the render-time CharCache (src/ink/output.ts:64-120): MAX_CACHEABLE_LINE=500, 16384 entries,
     a 100k-character cap, caching tokenize + grapheme clustering per line
```

Boundaries of the yoga port (`src/native-ts/yoga-layout/index.ts:1-39`):
aspect-ratio / content-box / RTL are unimplemented; `loadYoga()` keeps an
async-API compatibility stub (a comment in layout/yoga.ts confirms it's
synchronous with no WASM); `getYogaCounters` exposes visited/measured/
cacheHits/live for performance analysis (:1508).

The screen model (`src/ink/screen.ts`): a packed typed-array, 2×Int32 per
cell (word0=charId, word1=styleId[31:17] | hyperlinkId[16:2] | width[1:0])
+ BigInt64Array bulk fill + a noSelect bitmap + a per-row softWrap flag +
damage regions; the `CellWidth` enum has Narrow/Wide/SpacerTail/SpacerHead
(:356-367); diffEach scans within the damage rect, unioned with
prev.damage (:1283-1367).

The output layer (`src/ink/output.ts`) is completely rewritten: an
Operation queue (write/clip/unclip/blit/clear/noSelect/shift) +
intersectClip nested clipping + a CharCache; flushBuffer precomputes
styleId+hyperlink per style run and filters OSC 8 (:703-737), using
`getGraphemeSegmenter().segment` (:729); writeLineToScreen's hot loop
handles tab expansion / skipping CSI-OSC-DCS / zero-width characters /
SpacerHead wide-at-edge / setCellAt (:750-914).

## The input chain

```text
stdin 'readable' -> App.handleReadable (src/ink/components/App.tsx:434-474):
    a >5s gap triggers onStdinResume to re-assert terminal mode (STDIN_RESUME_GAP_MS=5000)
  -> processInput -> parseMultipleKeypresses(keyParseState, input)
  -> the tokenizer (x10Mouse) + regex table (src/ink/parse-keypress.ts:23-65):
     CSI_U_RE (kitty CSI u), MODIFY_OTHER_KEYS_RE, SGR_MOUSE_RE,
     DECRPM/DA1/DA2/XTVERSION/DECXCPR response parsing
  -> an incomplete escape sequence is flushed on a 500ms/50ms timer, gated by IN_PASTE
  -> every key is wrapped in reconciler.discreteUpdates(processKeysInBatch)
     (src/ink/components/App.tsx:410-417, guards against "Maximum update depth exceeded")
  -> processKeysInBatch's dispatch (src/ink/components/App.tsx:550-630):
     response -> querier.onResponse
     mouse -> handleMouseEvent (SGR 1-indexed converted to 0-indexed, multi-click detection,
       a hyperlink opens after a 500ms delay and can be canceled by a double-click, yielding to xterm.js's Cmd+click)
     FOCUS_IN/OUT -> TerminalFocusEvent
     ctrl+z -> handleSuspend (SIGSTOP/SIGCONT recovery)
     otherwise InputEvent.emit + dispatchKeyboardEvent
  -> the Dispatcher's two-phase capture/bubble (src/ink/events/dispatcher.ts:46-79, react-dom-style
     unshift/push), with getEventPriority mapping keydown/keyup/click/focus/blur/paste
     -> Discrete, and resize/scroll/mousemove -> Continuous (src/ink/events/dispatcher.ts:122-138)
  -> DOM onKeyDown handlers + FocusManager's Tab cycle (src/ink/focus.ts:105-179,
     focusStack MAX 32 + collectTabbable)
```

`parseKey` (src/ink/events/input-event.ts:31-194) produces the Key boolean
flags (including wheelUp/wheelDown/super), with meta compatible with
escape/option; CSI u, modifyOtherKeys, and app-keypad sequences are all
converted to key names to avoid leaking fragments like `'[57358u'` and
`'[27;...'` (src/ink/parse-keypress.ts:316-418's keyName table / 503-557's
keycodeToName PUA key names; :84-170 is the DECRPM/DA1/DA2/XTVERSION
response-parsing area).

## Terminal-capability probing and mode assertion

```text
setRawMode(true) (use-input's useLayoutEffect runs synchronously, src/ink/hooks/use-input.ts:45-93)
  -> App.handleSetRawMode 0->1: writes EBP(2004) + EFE(1004) +
     (when supportsExtendedKeys) the kitty keyboard CSI >1u + modifyOtherKeys CSI >4;2m
     (src/ink/components/App.tsx:281-368)
  -> a setImmediate-delayed XTVERSION probe (querier.send(xtversion())+flush, works over SSH
     via the pty) -> isXtermJs() (src/ink/components/App.tsx:327-350)
  -> win32/WT_SESSION takes the hasCursorUpViewportYankBug workaround (src/ink/terminal.ts:195-197)
```

The DEC constants include the 2026 synchronized-output sequences
(src/ink/termio/dec.ts:47-74); `supportsTabStatus()` gates on
`USER_TYPE === 'ant'` (src/ink/termio/osc.ts:498-500, ant-only while the
spec is unstable).

## Component and hooks map

| Component | Semantics |
| --- | --- |
| App = InternalApp (src/ink/components/App.tsx:138's displayName) | The root provider set: TerminalSize/App/Stdin/TerminalFocus/Clock/CursorDeclaration/ErrorOverview |
| Box | `like <div style=display:flex>`, with tabIndex/autoFocus/onClick/onFocus/onKeyDown/onMouseEnter/onMouseLeave; Box/Text/Button are compiled by the React Compiler (`import { c as _c } from "react/compiler-runtime"`) |
| Link | An OSC 8 hyperlink (auto id=osc8Id(url), src/ink/termio/osc.ts:432-446) |
| Newline | Must be inside `<Text>` |
| RawAnsi | A single Yoga leaf + constant-time measure |
| ScrollBox | overflow:scroll + an imperative ScrollBoxHandle (scrollToElement is deferred to render time to read getComputedTop, with viewport culling and stickyScroll) |
| NoSelect | A fenced gutter (a noSelect bitmap) |
| AlternateScreen | Enters/leaves the alt-screen via useInsertionEffect (an insertion effect rather than a layout effect: it writes ENTER_ALT_SCREEN before resetAfterCommit's first onRender, otherwise the first frame is written to the main screen and residue is left behind on exit) |

| Hooks | Semantics |
| --- | --- |
| use-input | useLayoutEffect synchronously opens raw mode + useEventCallback holds a stable listener on the internal_eventEmitter's 'input' event, gated by isActive (src/ink/hooks/use-input.ts:45-93) |
| use-stdin / use-app | Just useContext |
| use-terminal-size | Throws outside App; commented "ported from the leak" (src/ink/hooks/use-terminal-size.ts:7) |
| use-terminal-title | OSC 0, using process.title on win32 |
| use-tab-status | OSC 21337, fired conditionally per supportsTabStatus and wrapped via wrapForMultiplexer (src/ink/termio/osc.ts:510-527) |
| use-terminal-focus | DECSET 1004 terminal focus |

## Terminal-protocol output

`src/ink/termio/osc.ts`: the key OSC constants (0/2/8/52/99/133/21337,
:249-269); osc() terminates with ST under kitty, BEL otherwise (:23-26);
wrapForMultiplexer does DCS passthrough for tmux/STY (:43-52); setClipboard
has three paths (native pbcopy/wl-copy/xclip/clip.exe tried first → tmux
load-buffer -w → tmux DCS OSC52 or raw, with iTerm2 dropping -w to avoid
crash #22432, :154-174); CLEAR_ITERM2_PROGRESS (:473); tabStatus()
(:510-527).

## Conflicts

| Item | Both sides |
| --- | --- |
| OSC 21337 gating vs. the comment's promise | `src/ink/termio/osc.ts:498-500` only supports it when USER_TYPE==='ant'; `src/ink/termio/osc.ts:488-494`'s comment claims it can be fired unconditionally and safely, with broad terminal support — ordinary users never receive tab-status at all |
| react-reconciler version mismatch | The source is written against 0.33 (updateContainerSync/flushSyncWork/ConcurrentRoot), but `@types/react-reconciler` ^0.33.0 (package.json:97, lockfile resolves to 0.33.0) has none of those exports, masked with a "ported CC build" ts-ignore — the types and actual runtime may not agree; the code's own comments even disagree on the version number (src/ink/ink.tsx:260-261 says 0.32.3, :797 says 0.31) |
| Leftover Static-component semantics | src/ink/root.ts:127's comment mentions "the subsequent Static write overwrites scrollback", but the component file doesn't exist — the comment is a porting leftover |

## Unverified items

- How the public API surface is exposed (ink.tsx's export table / index.ts's
  public API — the export list wasn't read).
- The Bun.stringWidth runtime dependency: `src/ink/stringWidth.ts:213-216`
  prefers Bun.stringWidth when Bun is present, falling back to JS
  otherwise — whether the project requires a Bun runtime can't be
  confirmed (node_modules isn't installed, and running it is disallowed).
- The internal scroll state machine in render-node-to-output.ts
  (scrollClampMin/Max, stickyScroll restoration) wasn't confirmed line by
  line.
- The payload fields of events/'s click-event/focus-event/resize-event/
  terminal-event/paste-event weren't read individually (their shape is
  inferred from dispatcher/App usage).

Related documents: [overview.md](overview.md) (layering and source
distribution), [rendering.md](rendering.md) (render performance and
ghosting fixes), [input-commands.md](input-commands.md) (the app-layer
input model), [origin.md](origin.md) (the ink kernel's provenance
evidence), [unknowns.md](unknowns.md).
