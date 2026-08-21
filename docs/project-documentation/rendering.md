# The render pipeline and performance

This document covers two areas: the render pipeline (two-tier throttling,
virtualization, ghosting fixes, TPS computation) and the CJK
text-measurement system (stringWidth, wrapping/truncation, display-width
caching). All line numbers are relative to the audit baseline b2f4087.

## Two-tier 16ms throttling

Rendering a streaming chunk goes through two tiers of throttling:

| Tier | Location | Behavior |
| --- | --- | --- |
| The channel's frame-aligned emit | `src/channel.ts:1114-1125` | `emitStream`: `version` increments synchronously, but listeners fire at most once per 16ms trailing window (a setTimeout 16ms + timer.unref); when it fires, foldRows(MAX_ROWS=600) runs before notifying |
| Ink's scheduleRender | `src/ink/ink.tsx:212-216` | `throttle(deferredRender, FRAME_INTERVAL_MS=16, {leading:true,trailing:true})`; deferredRender is `queueMicrotask(onRender)` — the microtask delay makes onRender run after layout effects commit, so the hardware cursor tracks with no keystroke lag |

Event-dispatch split (`src/channel.ts:2942-2945`): assistant/chunk (one
event per token) goes through the frame-aligned emitStream path; every
other event emits synchronously. Scroll-drain frames are scheduled with a
plain setTimeout at `FRAME_INTERVAL_MS >> 2` (4ms, roughly 250fps)
(`src/ink/ink.tsx:750-764`), with onRender clearing any pending drainTimer
at the top to prevent a double render.

The streaming end-to-end pipeline:

```text
An assistant/chunk event (src/channel.ts:2944)
  -> ensureStreaming(event.seq).text accumulates in place (src/channel.ts:2572-2573)
  -> emitStream: version+=1 synchronously, fires on the 16ms trailing edge (src/channel.ts:1114-1125)
  -> src/screens/Chat.tsx:118 useSyncExternalStore(channel.subscribe, () => channel.version)
  -> React commit -> resetAfterCommit (src/ink/reconciler.ts:276-344, calls onRender
     at :333)
  -> onComputeLayout: a full-tree Yoga calculateLayout (src/ink/ink.tsx:239-258)
  -> MessageList's window computation -> MemoRow skips unchanged rows -> StreamingMarkdown re-parses only the tail block
  -> scheduleRender (the 16ms throttle) -> microtask onRender
  -> renderNodeToOutput -> Output.get() -> LogUpdate diffing -> optimize -> writeDiffToTerminal
  -> after the frame, a useLayoutEffect measures height into the cache, advances base, setClampBounds (src/components/MessageList.tsx:214-247)
```

## Message-list virtualization

Layout-level virtualization (commit 7b425de, 2026-08-06, root cause = pure-JS
Yoga re-laying-out the whole tree on any commit, O(whole session) →
O(visible window)):

| Mechanism | Location | Behavior |
| --- | --- | --- |
| The render cap | `src/components/MessageList.tsx:28-30` | MAX_RENDERED_ROWS=300 (the equivalent of CC's MAX_MESSAGES_WITHOUT_VIRTUALIZATION), older rows collapse behind a Divider, expanded via Ctrl+E |
| Virtualization constants | `src/components/MessageList.tsx:32-43` | OVERSCAN_LINES=8, DEFAULT_ROW_HEIGHT=2 (the fallback before the first measurement), DEFAULT_HEADER_LINES=14 (a cold-start header estimate, corrected after the first layout measurement); off-screen rows render as fixed-height placeholders, with their subtree excluded from Yoga layout |
| The height cache | `src/components/MessageList.tsx:114-134` | HEIGHTS_CACHE_MAX=5000, evicted FIFO (row ids grow monotonically and foldRows never deletes rows, so with no cap every row would grow the cache forever); cleared on a width change |
| Window computation | `src/components/MessageList.tsx:159-178` | Mounts the union of "committed positions ∪ the in-flight pending range" + overscan; while sticky, end=all rows and the tail rows stay force-mounted — this prevents an underestimated height from unmounting everything → content collapsing → scrollTop getting yanked to 0, a self-sustaining ping-pong |
| Padding | `src/components/MessageList.tsx:186-188,264-273` | topPad/bottomPad preserve scroll geometry (total height/sticky tracking/scrollbar); there's also a load-earlier Divider from foldRows at the top |
| Post-commit measurement | `src/components/MessageList.tsx:211-247` | A useLayoutEffect measures mounted rows' Yoga height into the cache, derives base from the first mounted row's getComputedTop(), and setClampBounds clamps the render-time scrollTop to the mounted coverage range (preventing a fast scroll into an empty placeholder area) |
| MemoRow | `src/components/MessageList.tsx:320-328,573` | Flattens an in-place-mutable row into raw props: the channel mutates text/status in place, and row-object identity never changes, so only changed rows get an O(1) shallow-compare re-render — before the fix, every streaming chunk re-rendered every mounted row and reran the whole markdown pipeline |

## resticky: recovering the at-bottom state

Commits 49cc660 / 113ff7d (2026-08-14): "fullscreen streaming whitespace
jitter + the new-messages pill not disappearing when scrolled to the
bottom".

```text
Scrolling up with the wheel (src/screens/Chat.tsx:858-861) calls handle.scrollBy(-3) — imperative, no React re-render
  -> src/ink/components/ScrollBox.tsx:140-151: el.stickyScroll=false, pendingScrollDelta just accumulates,
     scrollMutated (markDirty+markCommitStart+notify+microtask scheduleRenderFrom)
  -> src/ink/render-node-to-output.ts:876-895 drains pendingScrollDelta (capped at innerHeight-1;
     a 4ms drain frame)
  -> two re-stick points when reaching the bottom:
     1. src/ink/render-node-to-output.ts:921-936: once the drain settles for the frame, a manual
        scroll landing exactly at the bottom restores sticky immediately
        (stickyScroll===false && pending is empty && scrollTop>=maxScroll)
     2. src/ink/render-node-to-output.ts:830-853: a positional check on a no-growth frame — if the
        position is already at prevMaxScroll and content hasn't grown, tracking is restored too
        (clears the pill on a wheel-down landing exactly at the bottom)
  -> the re-stick guard: the sticky flag must have been explicitly interrupted (===false) and
     scrollTopBeforeFollow >= prevMaxScroll (:847-853)
  -> the onStickyRestore notification: defined at src/ink/dom.ts:95-101 (when the renderer restores
     it on its own, it notifies through this so useSyncExternalStore subscribers re-read the
     snapshot — otherwise the pill would never disappear); src/ink/components/ScrollBox.tsx:216-223
     sets el.onStickyRestore = notify at mount
  -> src/screens/Chat.tsx:193-198's useSyncExternalStore re-reads isSticky -> the header/pill flips
```

The shrink-frame freeze (`src/ink/render-node-to-output.ts:806-823`): a
transient shrink caused by virtualization (a tail unmount + a stale
height-cache placeholder) is a measurement artifact, not real content
loss, so that frame freezes the position, isn't clamped to the shrunken
maxScroll, and only checks at-bottom against the trusted maxScroll
(scrollPrevMax) (the same root cause as opentui #709: a content-size
change must never reset manual scroll state).

The pill count (`src/screens/Chat.tsx:200-219`): Chat anchors the "seen"
position by row id (unaffected by a loadOlder prepend, unlike a
rows.length index); MessageList computes the count of new rows still
below the viewport's bottom edge and reports it, decrementing to 0 and
disappearing as the user scrolls down.

Regression: `scripts/verify-resticky.mjs:74-107` has 6 assertions (initial
at-bottom, scrollBy(-10) breaking it, scrollBy(999) landing at maxScroll,
re-sticking at the bottom on a no-growth frame, notifyCount>0 subscriber
notifications, a partial scroll-down must not re-stick), simulating
Chat's useSyncExternalStore via handle.subscribe.

## Shrink-frame ghosting fixes

Evolution of commits: `a56b8e8` (dropped ESC[2J+3J for a row-skipping diff,
"ConPTY testing showed 675→0 screen clears over a 40s stream")
→ `cb1a28b` (switched to CSI 10000S scroll-to-top + a full repaint)
→ `18680e5` (an in-place viewport repaint on a shrink frame, issue
#38/#39/#19) → `287a811` (idle re-anchoring on a stdin gap, issue #16 #17)
→ `6a89566` (a merged trio of inline-ghosting fixes, #59).

The current mechanism (`src/ink/log-update.ts`):

```text
A content shrink frame (a thinking-block fold/tool-card unmount/streaming wind-down):
frame.screen.height gets smaller, detected via isShrinking + nextFitsViewport (src/ink/log-update.ts:272-273)
  -> when prevHadScrollback and the shrink fits inside the viewport: repaintViewportInPlace rebuilds the viewport in place
     (:285-290, zero scroll, zero scrollback deposited)
  -> when content is still taller than the viewport (common: 1-2 lines shrink per turn): an in-place repaint while cursorAtBottom
     (:311-337, "park the row → to the viewport top → ED clear → repaint the frame's tail window"); only falls back to
     fullResetSequence_CAUSES_FLICKER('offscreen') when the cursor isn't where expected
  -> a steady-state frame: rows in scrollback (y < viewportY) skip the diff (:292-297's comment,
     :378-391's clipping, :445-447's actual skip), no longer triggering an ESC[2J+3J screen clear
     just because a scrollback row changed (clearing scrollback jumps the viewport to the top on
     Windows Terminal, claude-code #35580)
```

Idle re-anchoring (`src/ink/log-update.ts:64-84`): requestViewportReanchor
does a one-shot main-screen repaint (blindly rebuilding the viewport at the
physical cursor position), triggered by a stdin-gap re-assertion (a
keystroke after >5s idle), fixing contamination from third-party tty
writes (issue #16 #17).

Regression: `scripts/verify-shrink.mjs:103-141` has byte-level assertions
(no CSI n S, no ESC[2J/3J) + @xterm/headless rebuilds terminal-semantics
assertions (the marker on the last content row, zero residue on old rows
40-59, visible rows contiguous and unique, ending at 39). The script's
header (:9-14) records the evolution: the old approach was a full reset
(CSI 10000S screen clear + a full frame repaint), copying the entire UI
into scrollback every time (the accumulated cause of #38/#39/#19's
"scrolling up shows a duplicated render").

## Idle re-anchoring and fullscreen anchoring

- CSI H resets the physical cursor every frame + a tail-park patch (iTerm2
  cursor guidance, src/ink/ink.tsx:568-651); on resize, ERASE_SCREEN is
  wrapped inside a BSU/ESU atomic block to prevent an 80ms blank flash.
- The repaint API trio (src/ink/ink.tsx:812-861): repaint() resets the
  double frame buffer; forceRedraw() (Ctrl+L) does SGR_RESET+
  ERASE_SCREEN+CURSOR_HOME followed by a full repaint;
  invalidatePrevFrame() marks full damage once (unmounting a tall overlay
  prevents ghosting — the blit fast path would otherwise copy stale cells,
  leaving a ghost title/divider behind).
- Search-side rendering (src/ink/ink.tsx:1083-1123): scanElementSubtree
  paints the main tree's existing DOM subtree directly to a new Screen —
  no second React root, no context bridge, roughly 1-2ms of pure painting.

## TPS computation

`src/channel.ts`'s TPS folding chain (the mechanism
`scripts/verify-tps.mjs` corresponds to):

```text
turn/start (:2747-2760): tpsTurnDecodeMs=0, DecodeTokens=0, tpsBeforeTurn=state.tps
  -> step/start (:2557-2566): creates a new tpsStep{firstTokenTime: undefined, outputChars: 0}
  -> assistant/chunk (:2568-2595): on an isTokenDelta, firstTokenTime ??= event.time,
     outputChars += tokenDeltaChars; a live estimate once elapsedMs>500
  -> assistant/message settlement (:2632-2652): usageOutputTokens(usage) ??
     ceil(outputChars/4); tpsTurnDecodeMs += event.time - firstTokenTime
  -> turn/end (:2762-2782): a weighted fold writes turnTps into state.tps and pushes
     tpsSamples({tps, at: event.time}, capped at 500); falls back to tpsBeforeTurn when there's no sample
  -> displayed via src/screens/StatusLine.tsx:57-70's tps readout (a live estimate is used when
     channel.working and there's no completed sample) + renderTpsGauge
```

`scripts/verify-tps.mjs:103-189` covers: folding a two-step turn excluding
a 51s tool gap via Σtokens/ΣdecodeMs, establishing the first-token
boundary from reasoning/tool-call deltas, the live chars/4 estimate,
settling against provider usage, a retry-style delay staying within the
same step's decode span, falling back to chars/4 when usage is missing,
and durable replay deriving the same value from event.time.

## The CJK text-measurement system

### stringWidth (the core)

`src/ink/stringWidth.ts`:

- The Bun branch (:211-231): resolves Bun.stringWidth once at module scope
  (a typeof guard prevents a deopt, given roughly 100k calls/frame on the
  hot path); the Bun path passes `{ ambiguousIsNarrow: true }`.
- The JS fallback (:13-19): more accurate than the string-width package,
  correcting U+26A0 (the warning sign) from being misreported as width 2;
  ambiguous characters are treated as narrow (width 1) (the Unicode
  standard's recommendation for a Western context).
- A three-tier path (:20-104): a pure-ASCII fast path (excluding control
  characters); ESC-containing strings get stripAnsi'd first; simple
  Unicode goes per code point through
  eastAsianWidth(ambiguousAsWide:false), skipping isZeroWidth; complex
  strings go through Intl.Segmenter for grapheme-level emoji and ligature
  handling.
- A known divergence (:205-209, explicitly commented): the Devanagari
  ligature क्ष renders as a single ligature but occupies 2 terminal cells,
  where Bun.stringWidth=2 matches the terminal, but the JS fallback's
  grapheme count of 1 falls out of sync with the terminal.

### Caching and measurement

| Component | Location | Behavior |
| --- | --- | --- |
| line-width-cache | `src/ink/line-width-cache.ts` | Caches stringWidth per line (a finished line is immutable during streaming, cutting calls roughly 50x per token); bounded (an OOM fix, commit 2f60c33): a 4096-entry / 100k-character budget / lines over 500 characters are never cached (a growing streaming tail row would mint a fresh key with zero reuse every frame) / the whole table is cleared once the budget is exceeded; detachString copies the key through a Buffer round-trip, avoiding a V8 SlicedString pinning the entire streaming parent string (measured: a 10KB line × 3000 frames went from 1.15GB retained to 2.3MB) |
| measure-text | `src/ink/measure-text.ts:22-45` | A single-pass measurement: loops splitting on '\n', taking the max width from each line's lineWidth(line); noWrap must be checked before the loop (the Math.ceil(w/Infinity)=0 trap); when not noWrap, each line's height is Math.ceil(w/maxWidth), with w===0 counted as 1; an empty string returns 0 |
| measureTextNode | `src/ink/dom.ts:447-483` | The entry point where display width feeds into Yoga layout: expandTabs (assuming worst-case 8 spaces) → measureText for width/height → when too wide, rewraps via textWrap's wrapText and re-measures; with an embedded \n and Undefined mode, uses max(width, the natural width) to prevent an inflated height |
| The incremental cache | `src/ink/dom.ts:485-546` | When the same node has the same width and wrap mode and the text is a growing prefix, only the tail line is re-wrapped (O(the current line) rather than O(the whole text)), with completed logical lines committed into headHeight |

### Wrapping and truncation

| Component | Location | Behavior |
| --- | --- | --- |
| wrap-text | `src/ink/wrap-text.ts:47-81` | Dispatch: 'wrap' → wrapAnsi(trim:false, hard:true), 'wrap-trim' → wrapAnsi(trim:true, hard:true), startsWith('truncate') → truncate(), everything else passed through as-is |
| truncate | `src/ink/wrap-text.ts:15-38` | columns<1 returns an empty string, columns===1 returns just the ellipsis; the start position → ELLIPSIS+sliceFit's tail segment; the middle position → sliceFit's head and tail sandwiching ELLIPSIS; the default end position → sliceFit's head segment+ELLIPSIS |
| sliceFit | `src/ink/wrap-text.ts:8-13` | sliceAnsi can pull in a width-2 CJK character sitting at end-1 whole, overshooting by 1 column; re-checked via stringWidth and retried once with the width tightened by one column |
| The wrapAnsi dual backend | `src/ink/wrapAnsi.ts:9-28` | Uses Bun.wrapAnsi when available, otherwise falls back to the npm wrap-ansi package |
| sliceAnsi | `src/utils/sliceAnsi.ts:35-89` | Advances by display cell rather than code unit: ansi/control counts as 0, fullWidth counts as 2, otherwise stringWidth(token.value); a trailing zero-width character attaches to the preceding base character, and a zero-width character at the start boundary is skipped |
| truncateToWidth | `src/ink/truncateToWidth.ts:8-18` | The shared truncation helper (commit 0530a99): iterates for...of by code point, accumulating cells via each character's stringWidth, breaking once the limit is exceeded, and never splitting a wide character in half; requires ANSI-free input as a precondition (:3-7's comment: "callers pass plain text") |

**truncateToWidth's three call sites** (ci.yml:69's comment claims "4
description sites handle terminal display width", but the enumerable
truncation sites are actually 3 — see the conflict noted below):

| Call site | Location | Behavior |
| --- | --- | --- |
| FileSuggestions (@ file suggestions) | `src/components/FileSuggestions.tsx:38-49` | descriptionWidth = Math.max(0, columns - 24); description is only the literal 'directory'/'file'; the filename column is padded by display width (`' '.repeat(Math.max(1, 20 - stringWidth(name)))`, :46) |
| CommandSuggestions (/ command suggestions) | `src/components/CommandSuggestions.tsx:26-58` | descriptionWidth = Math.max(0, columns - nameWidth - tagWidth - 4), with nameWidth capped at 40% of the terminal width |
| MessageList's compactPreview | `src/components/MessageList.tsx:565-571` | Defaults to limit=60 terminal cells; over the limit, truncateToWidth(flat, limit-1) + '…', with the comment noting CJK wide characters count as two columns and are never split |

Fix history: 0530a99 (added truncateToWidth; fixed FileSuggestions issue
#34 and MessageList's compactPreview — "a 60-character CJK summary
actually occupies 120 columns and must wrap"; deliberately left
CommandSuggestions alone to avoid conflicting with PR #45) → 0f18eb5 (PR
#45 had since been closed by its author, and the same bug in
CommandSuggestions was still unfixed, so it was switched onto the shared
helper) → 74c307e (mounted verify-cjk-truncate into CI, issue #41).

Regression: `scripts/verify-cjk-truncate.tsx` has unit assertions (pure CJK
at limit ∈ {0,1,2,3,4,5,7,8} truncates to stringWidth ≤ limit; limit=3
keeps only '你'; mixed Chinese/English 'ab中cd' truncated to 4 columns =
'ab中'; a wide character straddling the boundary 'a中b' truncated to 2
columns = 'a') + @xterm/headless COLS=28 narrow-terminal rendering of
FileSuggestions, asserting every row's stringWidth ≤ 28 with an ellipsis
present.

### Render-time wrap determination

`src/ink/render-node-to-output.ts:604-626`: `maxWidth =
Math.min(getMaxWidth(yogaNode), output.width - x)` (comment: upstream Ink's
unclamped getMaxWidth drops off-screen characters), with
`widestLine(plainText) > maxWidth` deciding whether wrapping is needed;
wrapWithSoftWrap wraps each input line individually and marks soft-wrap
continuations (:362-394, truncate mode produces no new lines so softWrap is
undefined).

`output.ts`'s write-screen clipping: vertical clip decides the whole block
via `widestLine(text)` (:533); horizontal clip determines `to` via
`stringWidth(line)`, slices with sliceAnsi, and retries once with the
width tightened by one column when a wide character straddles the boundary
(:548-564); flushBuffer derives each cell's width from per-grapheme-segment
stringWidth (:729-736); softWrap's contentEnd comes from
writeLineToScreen's tab-expansion-aware value, while `x+stringWidth(line)`
treats a tab as width 0 (:596-619).

Other display-width consumers: MarkdownTable
(src/components/MarkdownTable.tsx)'s column width/alignment/padAligned,
src/ink/render-border.ts:45's border-text width,
src/components/design-system/Divider.tsx:56's title width, the
shimmer/Spinner segment width, src/components/messages/MessageMetadata.tsx:31,
src/components/messages/AssistantToolUseMessage.tsx:235,
src/ink/tabstops.ts:46's expandTabs column advancement.

## Conflicts

| Item | Both sides |
| --- | --- |
| CI-mounting gap | None of the four render-verification scripts (verify-resticky/verify-scroll/verify-shrink/verify-tps) are mounted in CI (none of ci.yml's 12 regression steps on lines 27-71 include them); commit 113ff7d's claimed "verify-resticky 6/6, verify-scroll 6/6" was a manual verification; docs/contributing.md:129-136's claim that CI only runs 3 commands doesn't match reality |
| renderToScreen is dead code | `src/ink/render-to-screen.ts` exports renderToScreen (building its own LegacyRoot + updateContainerSync, commented "Used for search: render ONE message"), but nothing in src/ calls it; the actual search path is src/ink/ink.tsx:1093-1123's scanElementSubtree (painting the main tree's existing DOM subtree directly) — renderToScreen is a leftover from a superseded approach (its export survives only in the lib build output) |
| verify-shrink's description omits a layer | The script's header calls the old approach "a full reset (CSI 10000S screen clear + a full frame repaint)", but the commit history shows an even earlier ESC[2J+3J stage (a56b8e8) — the script only describes the most recent old approach |
| The "4 sites" claim | `.github/workflows/ci.yml:68-70`'s comment claims "4 description sites handle terminal display width", but the enumerable truncation call sites are only 3 (src/components/FileSuggestions.tsx:48, src/components/CommandSuggestions.tsx:57, src/components/MessageList.tsx:570) |
| textWrap 'end'/'middle' are no-ops | src/ink/styles.ts:68-69's type union declares textWrap: 'end'\|'middle', and src/ink/components/Text.tsx:73-84 maps them too, but src/ink/wrap-text.ts:66-80's dispatch doesn't handle either value — the type is valid but the behavior is a no-op ('truncate-end' works via startsWith('truncate')) |
| The cli-truncate comment's paraphrase | src/ink/render-node-to-output.ts:368's comment describes truncate mode as "cli-truncate is whole-string"; this repo has no cli-truncate dependency, and truncation is implemented locally by sliceFit/sliceAnsi — the comment is an upstream-provenance paraphrase, though it holds up behaviorally |

## Unverified items

- Whether renderToScreen is still used by a consumer outside lib/
  (package.json's exports doesn't include that path, but an external deep
  import can't be ruled out).
- The actual React commit frequency under real ConPTY and the 16ms
  throttle's hit rate (commit-interval stats are only emitted when
  CLAUDE_CODE_COMMIT_LOG is set, src/ink/reconciler.ts:279-304).
- The concrete value DEFAULT_HEADER_LINES=14's cold-start estimate gets
  corrected to after the first measurement, and the estimation bias of the
  5000-entry FIFO height cache when deep-scrolling a very long session
  (needs an actual TUI run to measure).
- The actual degree of layout desync on a non-Bun runtime caused by Bun
  and Node disagreeing on Devanagari grapheme width
  (src/ink/stringWidth.ts:205-209's comment acknowledges the divergence,
  with no Node-side compensation verified).
- sliceAnsi's behavior when a position's start lands on a wide character's
  second cell has no unit-test coverage.
- Whether scripts like verify-cjk-truncate.tsx actually pass in the
  current environment wasn't verified (a read-only audit forbids
  installing dependencies/running scripts; the assertion logic was
  cross-checked against the code line by line instead).

Related documents: [ink-core.md](ink-core.md) (the render kernel's
structure), [input-commands.md](input-commands.md) (input and scroll
keybindings), [unknowns.md](unknowns.md) (the unverified-items list).
