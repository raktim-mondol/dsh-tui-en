# Input handling, IME avoidance, and the command system

This document covers the input model (a single value+cursor, edit
keybindings, in-session history), the keyboard pipeline, IME pinyin-preedit
avoidance, the dual paste channels, and the slash-command system
(/rewind, /new, /compact, etc.). All line numbers are relative to the
audit baseline b2f4087.

## The input model

PromptInput holds a single value string + integer cursor as its two pieces
of state (no selection-range API,
`src/components/PromptInput.tsx:123-124`); setInput clamps the cursor:
`setCursor(Math.max(0, Math.min(cursorOffset, next.length)))` (:356-359).

The full set of inline editing operations
(`src/components/PromptInput.tsx:582-658`):

| Key | Behavior |
| --- | --- |
| ←/→ | Moves one character |
| Ctrl+←/→ | Word boundary (readline's alt+b/alt+f semantics, via the helpers wordBoundaryLeft/Right :18-32) |
| backspace/delete | Deletes a character |
| Home/End, Ctrl+A/Ctrl+E | The logical line's start/end |
| Ctrl+U / Ctrl+K | Deletes to the start/end of the line |
| Ctrl+W | Deletes the previous word |

Multi-line support: Shift+Enter inserts '\n' at the cursor (:476-483);
↑/↓ move by row while multi-line, clamped to the target row's length
(cursorColumn :362-371); once visual lines exceed MAX_VISIBLE_LINES=5, the
window scrolls to keep the cursor's row visible (:45,741-754).

In-session history (:15,141-142,539-580): ↑/↓, while not multi-line and no
overlay is open, walk history.current, a ring array (a submit pushes the
trimmed text, capped at HISTORY_LIMIT=50, ↑ goes back, ↓ goes forward,
going out of bounds returns an empty string); **this array starts out
empty and is never loaded from the on-disk history file**. Persisted
history (`src/history.ts`): history.jsonl, one JSON object (text+ts) per
line, capacity HISTORY_LIMIT=200, appendHistory only bumps the timestamp
on an immediately adjacent repeat and skips bad lines; historyEntryId uses
the first 12 characters of sha1(text) as the React key; only Ctrl+R can
search the on-disk history (see below).

## The keyboard pipeline

```text
App.handleReadable reads stdin (src/ink/components/App.tsx:434-474)
  -> processInput -> parseMultipleKeypresses (a tokenizer splitting text/sequence,
     the IN_PASTE state machine, src/ink/parse-keypress.ts:225-314)
  -> parseKeypress translates a sequence into name/ctrl/shift/meta (src/ink/parse-keypress.ts:631-805;
     the keyName table :316-418: '\r'→return, '\t'→tab, '\b'/0x7f→backspace,
     a single byte s<=0x1a→ctrl+letter, CSI u=ESC[13;2u etc., xterm modifyOtherKeys
     ESC[27;m;k~, FN_KEY_RE decoding the modifier bit: shift1/meta2/ctrl4/super8)
  -> processKeysInBatch: a terminal response→querier, FOCUS→focus state,
     Ctrl+Z→suspend, everything else builds an InputEvent and emits('input') plus
     dispatchKeyboardEvent (src/ink/components/App.tsx:550-630)
  -> InputEvent.parseKey folds it into the Key boolean-flag set+input text
     (src/ink/events/input-event.ts:31-194, 16 flags: upArrow/return/escape/ctrl/shift/meta/
     super etc.; ctrl+space is corrected to ' '; unknown F13-style sequences and ESC-less SGR mouse
     fragments are swallowed to avoid leaking as text; uppercase input sets shift=true)
  -> use-input's handleData receives the event, gated by Ctrl+C before calling the handler
     (src/ink/hooks/use-input.ts:72-93)
  -> Chat's useInput handles global keys first (a working-state Esc, Ctrl+R/T/O/L/E, Shift+↑ selection,
     search state, etc., src/screens/Chat.tsx:848-1201); PromptInput's useInput handles editing keys
     (src/components/PromptInput.tsx:373-736)
```

Listener-registration details (src/ink/hooks/use-input.ts:45-93):
useLayoutEffect (rather than useEffect) synchronously opens raw mode (the
terminal can't be in cooked mode before the next event-loop tick); the
listener is registered inside useEffect, and handleData keeps a stable
reference via useEventCallback — the comment notes that a stable
registration point is what guarantees the stopImmediatePropagation
ordering. EventEmitter.emit walks rawListeners in registration order, and
nothing runs after the first listener that calls
stopImmediatePropagation (src/ink/events/emitter.ts:27-50).

The raw-mode initialization order (src/ink/components/App.tsx:294-318):
stopCapturingEarlyInput → stdin.setRawMode(true) → EBP (DEC 2004) → EFE
(DECSET 1004) → when supportsExtendedKeys() writes
ENABLE_KITTY_KEYBOARD (CSI >1u) + ENABLE_MODIFY_OTHER_KEYS (CSI >4;2m)
(making Ctrl+Shift+letter distinguishable from Ctrl+letter).

## IME avoidance: parking the physical cursor

The whole repo has **no compositionstart/update/end or beforeinput
composition-event listener at all** (a grep only hits comments);
behavior during IME composition is delegated entirely to the terminal:

- The terminal renders the IME preedit at the physical cursor position
  (src/ink/components/App.tsx:116-120's comment: "Enables IME composition
  at the input caret"; src/ink/ink.tsx:653-699: cursorDeclaration is
  resolved to absolute coordinates at the end of the frame and emits a CUP
  cursor-positioning sequence).
- useDeclaredCursor (src/ink/hooks/use-declared-cursor.ts:5-12,42-62):
  unconditionally re-declares it on every commit, to counter
  sibling-handoff and unmount cleanup races.
- Visual columns rather than character indices
  (src/components/PromptInput.tsx:756-773): a CJK character occupies two
  terminal columns, so a raw character count would park the physical
  cursor mid-character, causing Windows Terminal to paint the pinyin
  preedit over the surrounding text; caretVisualCol computes this via
  stringWidth.
- An empty input deliberately renders no placeholder
  (src/components/PromptInput.tsx:34-41): the app receives no input
  events at all during composition (Windows Terminal suppresses key
  events during TSF composition), so a blank empty line is the only way
  to guarantee nothing is in the preedit's way; an empty input instead
  renders an inverse-video block cursor on a blank cell
  (`<Text inverse> </Text>`, src/components/PromptInput.tsx:908-916).
  SearchBox uses the same avoidance (src/components/SearchBox.tsx:5-11,
  38,68-76): an inverse-video blank block at the line's start + a
  right-side dim-aligned placeholder ("kept off the caret's cell").

## The dual paste channels

| Channel | Pipeline | Location |
| --- | --- | --- |
| Bracketed paste | Raw mode writes EBP (DEC 2004); the terminal wraps it in CSI 200~...201~; the parser sets IN_PASTE and accumulates the token, calling createPasteKey on PASTE_END (isPasted=true, the whole chunk as input); PromptInput checks `event?.isPasted && input.length > 0` first, then insertAtCaret after CRLF→LF | src/ink/termio/csi.ts:364-368, src/ink/parse-keypress.ts:243-257, src/components/PromptInput.tsx:386-392 |
| Ctrl+V (Windows) | `key.ctrl && input === 'v'` (clipboardBusyRef prevents re-entry) → execFile powershell Get-Clipboard: tries FileDropList first (an Explorer file copy → FILE: path lines), otherwise -Raw text output via base64 (TEXT64:, keeping multi-line and CJK safe); retries after 150ms up to 3 times, a 3s timeout, child.unref; formatClipboardInsert: quotes a file path containing whitespace, joins with spaces, converts text CRLF→LF; notifies 'input-clipboard-empty' on null | src/components/PromptInput.tsx:394-409, src/utils/clipboard.ts:15-93 |

A comment (src/ink/parse-keypress.ts:249-254) claims even an empty paste
fires a key (for macOS clipboard image handling), but isPasted's only
consumer is src/components/PromptInput.tsx:389, which requires
input.length>0 — an empty-paste key has no downstream consumer.

## The external editor (Ctrl+G)

`key.ctrl && input === 'g'` (src/components/PromptInput.tsx:496-522)
triggers an editor round trip with readline's edit-and-execute-command
semantics:

- **Resolution order**: `$VISUAL` → `$EDITOR` (readline's convention,
  supporting `EDITOR="code --wait"` with whole-line quote splitting,
  src/utils/externalEditor.ts:94-100); with neither set, it returns
  `unavailable` — **deliberately no vi fallback** (dropping a user into a
  vi session they can't exit is worse than an error), notified via
  'input-editor-unavailable'.
- **Round-trip semantics**: the draft is written to a temp file → the
  terminal hands off to the editor (Ink's alt-screen handoff) → if the
  saved text changed, `setInput` writes it back. Failures map to an
  outcome: edited / unchanged / non-zero exit / launch failure
  ('input-editor-failed').
- **The busy lock**: `editorBusyRef` stays true for the whole round trip
  (an early-exit guard at :412), with catch/finally guaranteeing a
  rejected promise never kills the process and the lock is always
  released — otherwise Ctrl+G would lock up permanently.
- **A reserved shortcut slot**: `ctrl+g` is in the plugin-negotiated
  reserved-keys list (src/dsh-adapter/shortcuts.ts:115), with
  ctrl+shift+g rejected as a superset; `ctrl+x` has already been released
  for plugin use.
- **Regression gate**: scripts/verify-external-editor.mjs (parsing +
  round trip, no TTY needed), scripts/repro-external-editor.tsx
  (an xterm-headless TTY-handoff smoke test).

## Delivery while working and Esc semantics

| Key | Behavior while working | Location |
| --- | --- | --- |
| Enter | STEER: injects a next-step boundary into the running turn (Codex/pi semantics) | src/components/PromptInput.tsx:254-266 |
| Tab | Queues a follow-up | :272-284 |
| Ctrl+Enter | Interrupts and delivers immediately (comment: Windows Terminal sends CSI 13;5u / 13;1;5u) | :309-329 |
| Alt+Up | Recalls the last pending item (via channel.removePending, an official inbox.remove withdrawal, rejected on failure) | :291-303 |

Esc semantics, tiered (src/components/PromptInput.tsx:659-722): closes
help → closes the command menu (clears it) → closes only the current @
token menu (fileEscRef) → while working with something pending, interrupts
and delivers immediately → clears non-empty input → a double-tap Esc: an
empty input opens rewind / a non-empty input clears; not repeated within
3s disarms it. Chat also handles a working-state Esc separately at
:1149-1162 (delivering pending or channel.cancel) and calls
stopImmediatePropagation.

Enter debouncing (:159-160,419-425): the cmd pipeline can split a single
Enter into two events, \r+\n, so a repeated Enter within an 80ms window
(lastEnterAtRef) is coalesced; the whole-line-input rule: when input
contains \n or \r, a pure CR/LF is treated as Enter, otherwise value+input
are merged and matched uniquely against a command→run, otherwise submitted
(:449-469, comment: "Windows ConPTY pipelines deliver whole lines with the
Enter key lost").

## The command system

Command parsing (src/commands.ts:83-89): parseCommandName's regex
`^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])` takes the first token, with
rawInput keeping the text after the name as-is (`/plan off` → plan + '
off'); tryRunCommand requires the text start with '/' and the name be in
channel.commandList (39 local + merged plugins, see
[lifecycle.md](lifecycle.md#the-command-dispatch-chain)), clearing the
input and writing history only once handled successfully.

The command menu (src/components/PromptInput.tsx:168-175):
`value.startsWith('/')` triggers filterCommands (the prefix is the whole
text after '/', trimmed+lowercased, matched via name.startsWith);
overlayOpen also requires !helpOpen && !selectionActive &&
!value.includes('\n'). While the command menu is open, Enter runs the
selected item (never sends '/mo' literally); Tab completes to `/<name> `;
Shift+Tab is handled before the Tab branch (the parser reports backtab as
key.tab+key.shift), cycling reasoning effort (:491-494, "dsh parity").

### /rewind (issue #43, pr-55)

/rewind is registered in LOCAL_COMMANDS (src/commands.ts:31), with
runCommand's case 'rewind' reusing the double-Esc openRewind() picker
(src/screens/Chat.tsx:513-518). The rewindTo mechanism has existed since
0.1.0 (809591d) (src/channel.ts:372-375's interface comment: "CC's
double-Esc rewind": forks the session, swaps in a new agent, returns the
editable text) — **pr-55 only added the command entry point**.

```text
/rewind (or a double Esc) -> openRewind (src/screens/Chat.tsx:736-750):
   candidate rows = channel.rows filtered for kind==='user' && label===undefined, reversed;
   with no candidates, notify 'Nothing to rewind yet'
  -> src/components/RewindPicker (src/screens/Chat.tsx:1363-1371): Enter selects -> Enter again in the confirm state runs
     performRewind (:1101-1105)
  -> channel.rewindTo(row) (src/channel.ts:1219-1348):
     while working, cancel + waitForTurnEnd (30s)
     -> scans backward for turn/start to set boundary = event.seq - 1 (the DSH event sequence is
        turn/start→user/message→…→turn/end, with the message's own seq inside the turn —
        forking here would hit OPEN_TURN)
     -> sessions.fork(agent.session, boundary) to get the seed
     -> agents.create for a new child (childId=randomUUID; meta records parentSession /
        seedLength / agentPreset; agentOptions carries over the currently active provider/model —
        "a /model switch must survive it (issue #30)", so a rewind doesn't restore the older model)
     -> the reset block: clears rows / todos / goal / sessionTitle / tokens /
        lastUserText / spinner, then replays via coalesceReplayEvents(seed)
     -> bindAgent / refreshCommandList / refreshLoadedContext /
        touchSession(childId) / disposes the old handle
  -> returns row.text -> setHistoryFill (src/screens/Chat.tsx:754-758, notifies 'Rewound —
     edit and press Enter to resend') -> PromptInput's fillText effect
     (:147-153) writes it back into the input box, and the user edits then presses Enter to resend
```

### /new taking effect in one go (issue #25, pr-55)

- Introduced: bfc46fb (08-06) added a CC-style confirmation to runCommand's
  case 'new' — when hasContent and newConfirmRef isn't armed, it sets the
  flag, notifies 'Press /new again to confirm', and returns true (without
  calling newSession); auto-disarmed after 4 seconds.
- Root cause: with a session that has user/assistant rows, the first /new
  always just arms it, requiring a second press within 4 seconds to
  actually run.
- Fix: 6aa8598 (pr-55) removed newConfirmRef and the whole gate, with case
  'new' calling `void channel.newSession()` directly
  (src/screens/Chat.tsx:439-448); the rationale: newSession is
  non-destructive — the old session stays persisted in the JSONL session
  store and /resume can recover it, "the second confirmation was pure
  friction".
- Merged: dc678d8 (Merge pr-55); channel.newSession()'s implementation was
  unchanged (the diff on src/channel.ts between 715b60f..dc678d8 is
  empty).
- newSession (src/channel.ts:1456-1574): rejected while working;
  composePreset (configuredPreset ?? readPresetPref) +
  resolveModelRoute+validateModelRoute → agents.create → the reset block →
  clearResumeTarget → touchSession → disposes the old handle.

### /compact

Dispatch: case 'compact' (src/screens/Chat.tsx:457-459) →
channel.compact() (src/channel.ts:1922-1961): resolves the dsh-compaction
service via serviceForAgent; notifies 'Compaction unavailable' when the
service is missing; rejected while working; compactNow(agent, signal)
compacts asynchronously. Rendering (:2491-2534): a checkpoint
user/message (source {kind:'plugin', plugin:'compact'}) → a 'Conversation
compacted' notice + a kind 'compact' summary row, immediately resetting
contextSegments/tokens.input/lastUsage/contextWarned.

Relationship with rewind: both depend on the persisted session log
(cordis.yml:158-160: "Durable session log... /resume and rewind both rely
on this backend"); compact replaces the log's history with a summary →
the user messages before the compaction point disappear from the log; the
rewind picker only lists user rows, and a checkpoint renders as a
notice/compact row, not a user row → **there's no way back to before the
compaction point once compacted** (inferred; no doc or test states this
explicitly).

### Command visibility

Registering in LOCAL_COMMANDS makes a command automatically visible: the
'/' suggestion overlay uses filterCommands(value, channel.commandList)
(src/components/PromptInput.tsx:168-172); the '?' help menu uses
<HelpMenu commands={channel.commandList} /> (:844). /rewind's registration
made it appear in both places automatically (confirmed by commit
53016e8's message).

## Ctrl+R history search

Chat captures `key.ctrl && input === 'r' && !helpOpen`
(src/screens/Chat.tsx:1128-1135): loadHistory() reads history.jsonl
reversed (newest first); filtered by a case-insensitive substring match
(:722-725). The dialog's keyboard handling lives in Chat (:1048-1097):
↑/↓ or a repeated Ctrl+R moves focus, Enter fills it in, Esc/Ctrl+C/Ctrl+D
cancels, every other key edits the query; HistorySearchDialog itself has
no useInput (:11-17's comment: "Keyboard handling lives in the caller
(Chat)"). setHistoryFill(entry.text) → PromptInput's fillText effect
replaces the input and places the cursor at the end
(src/components/PromptInput.tsx:146-153, deduplicated via a lastFill ref).
While the dialog is open, PromptInput ignores every key because of
promptSelectionActive (which covers historyOpen and every other modal
state).

## Conflicts

| Item | Both sides |
| --- | --- |
| Listener-order comment is questionable | src/components/PromptInput.tsx:47-52's comment claims "Chat's useInput listener runs BEFORE this component's (EventEmitter registration order)"; but listeners are registered inside useEffect (children commit before parents), so PromptInput (a child) should register — and thus run — first, contradicting the comment. This can't be verified by running it; even if the order were reversed, interruptAndDeliver's interruptSeq token would discard a duplicate request, so the absence of a double-delivery can't be used to infer the order |
| README's image-paste claim | README.md:88 claims Ctrl+V "a file/image copied from Explorer → inserts the file path"; the code only produces a path for FileDropList — a bitmap copied from within a browser is neither a file nor text, so Get-Clipboard -Raw returns empty → the "clipboard is empty" hint fires |
| History-doc claim | docs/interaction.md:15 claims ↑/↓ "browse history" without noting the scope; in the code, ↑/↓ only covers the 50 entries within the session, and only Ctrl+R can search the persisted 200-entry history |
| /rewind undocumented | /rewind is registered and appears in the / menu and the ? help, but README.md / docs/interaction.md only document the double-Esc rewind entry point; no doc commit followed dc678d8 |
| steering filters a no-op condition | src/screens/Chat.tsx:727-728's comment claims it excludes steering-side questions (row.label === undefined), but nothing in src/ ever sets label on a user row — the filter condition is always true |
| v0.4.1 tag ambiguity | The baseline HEAD b2f4087 (package.json 0.4.1) includes pr-55; the git tag v0.4.1 points at eeca418 (which doesn't include dc678d8). publish.yml only publishes when tag==package.json version, so the npm 0.4.1 package published against the tag likely doesn't include these two changes (not verified offline against the registry) |

## Unverified items

- The actual execution order of the Chat and PromptInput useInput
  listeners (the comment and React's effect semantics contradict each
  other; static analysis alone can't prove either account, and there's no
  test that settles it).
- The behavior of a terminal that keeps firing key events normally during
  IME composition (some Linux IME configs).
- Whether Ctrl+Enter can still be recognized on a terminal that supports
  neither kitty nor modifyOtherKeys (parse-keypress has no legacy-terminal
  fallback mapping).
- Whether Ctrl+V still works in an environment without PowerShell (a
  direct WSL launch or an SSH Linux terminal) (clipboard.ts hardcodes the
  powershell executable name, with no platform branch).
- Whether it's possible to roll back to before the compaction point after
  a compact (inferred from the code to be impossible; no doc or test
  states this).
- The session-store backend of an actual profile install (see
  [session-context.md](session-context.md)).

Related documents: [lifecycle.md](lifecycle.md) (the command-dispatch
chain), [rendering.md](rendering.md) (input-related rendering),
[model-route.md](model-route.md) (the /model command),
[ink-core.md](ink-core.md) (the underlying keyboard parsing),
[unknowns.md](unknowns.md).
