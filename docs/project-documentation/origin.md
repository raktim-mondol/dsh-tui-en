# Provenance audit report

This report answers "who wrote each file in the repo": official DeepSeek,
an open-source port, a leaked-source port, project-authored, generated, or
unable to confirm. Every conclusion is based on read-only evidence and
contains no speculation.

## Methodology and scope

The audit ran in four steps (WORKFLOW 2A-2D):

1. **Baseline review**: confirmed HEAD is `b2f4087`, branch main, a clean
   working tree, matching origin/main.
2. **Full-repo scan**: collected an "introducing commit" and provenance
   leads for every file (combining `git log --follow` with
   `--diff-filter=A`, avoiding the `--follow --reverse` git bug).
3. **Collection and synthesis**: 4 collection agents (ink/native-ts,
   components/screens/hooks/bootstrap, the src root+cc+utils+types,
   scripts/.github/skills/the launcher) read file by file and produced a
   verdict with evidence; the main loop re-reviewed key files and corrected
   8 of them.
4. **Adversarial verification**: 3 adversarial agents spot-checked 45 files
   (16%), citing exact line numbers for each, and overturned 10 verdicts (6
   downgrades, 4 upgrades — see the reclassification table), all of which
   are on record.

**Coverage**: 282 non-build-artifact entries (src 209, scripts 48, skills
7, .github 2, root 16). `lib/`'s 625 files are build output (`tsc`'s
output, `docs/contributing.md:105-106`) and were excluded; `node_modules`
isn't installed. The figures were recomputed programmatically by a script
(`apply-corrections.js`, all 18 overrides hit, totaling 282), not counted
by hand.

**Evidence files** (audit working directory `%TEMP%\dsh-docs-work\`):
`collect-tsv.txt` (282 rows of raw collection data, each row path / verdict
/ evidence), `collect-final.tsv` (the final version after the 18
reclassifications), `buckets-final.txt`, `adversarial-findings.txt`
(itemized adversarial evidence for the 45 files), `intro-commits.txt` (the
introducing-commit map for every file).

## Provenance category definitions

| Category | Criteria |
| --- | --- |
| Official DeepSeek | Can be positively shown to be written by official DeepSeek (this audit's conclusion: an empty bucket) |
| Leaked-source port, cc-port | The file itself explicitly states it originates from the leaked Claude Code source, or carries a hard marker (see below) |
| Open-source port, port-ink / port-pi / port-yoga | Explicitly states it's ported from the released Ink / the pi extension / open-source yoga-layout |
| Project-authored, project-self | An explicit self-authorship statement ("cc-tui ships/does/keeps…") or introduced by a feature commit + evidence of syncing from the author's own repo |
| Generated, generated | Build output with an embedded compiled sourcemap, lockfiles |
| Unable to confirm, unverified | Insufficient evidence: a file introduced by the initial commit with no explicit marker |

**cc-port hard markers** (the explicit-evidence category):

- An explicit header comment: "ported from the leaked Claude Code source",
  "the leak's X", "verbatim from the leak", "ported CC build";
- `import { c as _c } from "react/compiler-runtime"` (a React Compiler
  transform artifact);
- Reading a `CLAUDE_CODE_*` environment variable (a CC-internal variable);
- An internal `anthropic.slack.com` link.

**Does not count as evidence** (a rule the user explicitly tightened):
`import '@deepseek-ai/*'` only proves a dependency on an official package;
the absence of a "ported from" header comment doesn't imply
project-authored; a structural resemblance to Ink/Claude Code doesn't imply
a proven port; "in the CC … style" / "in the shape of the leak's X" is a
stylistic reference, not a porting statement.

## Final breakdown

Programmatically recomputed result (`buckets-final.txt`, baseline
b2f4087):

| Provenance | Count | Share |
| --- | --- | --- |
| Unable to confirm, unverified | 116 | 41.1% |
| Project-authored, project-self | 81 | 28.7% |
| Leaked-source port, cc-port | 57 | 20.2% |
| Open-source port, port-ink | 18 | 6.4% |
| Generated, generated | 5 | 1.8% |
| Open-source port, port-pi | 3 | 1.1% |
| Open-source port, port-yoga | 2 | 0.7% |
| Official DeepSeek, deepseek-official | 0 | 0% |

## Composition of the cc-port 57's markers

Programmatic classification (`bucket-breakdown.js`):

| Marker class | File count |
| --- | --- |
| An explicit "ported from the leaked/leak" header comment | 37 |
| A `react/compiler-runtime` import (React Compiler transform) | 12 |
| Reading a `CLAUDE_CODE_*` environment variable | 5 |
| A "ported CC build" self-statement | 2 |
| An internal `anthropic.slack.com` link | 1 |

Methodology note (the script `bucket-breakdown.js` actually produces 7
classes; this table merges them into 5 rows): 5 = 4 files marked purely by
`CLAUDE_CODE_*` + `src/ink/ink.tsx` (which co-occurs with "ported CC
build", so the same file is counted in both rows); 2 = 1 file marked purely
by "ported CC build" + `src/ink/ink.tsx` (double-counted the same way);
`src/cc/markdown.ts` doesn't match the script's case-sensitive regex
because its header comment capitalizes "Ported from the leaked Claude Code
source", so the script files it under "other" — semantically it belongs to
the explicit leaked-port marker, and the five classes sum to exactly the
correct 57.

Distribution by area:

- `src/cc/`: src/cc/figures.ts:2-3 ("ported from the leaked Claude Code
  source (`src/constants/figures.ts`)"), src/cc/markdown.ts:18-20,
  format.ts, terminal.ts;
- The `src/ink/` subsystem: src/ink/reconciler.ts:192/202 (reading
  CLAUDE_CODE_DEBUG_REPAINTS / CLAUDE_CODE_COMMIT_LOG),
  src/ink/termio/osc.ts:138/162 (an anthropic.slack.com link + internal
  iTerm2 knowledge), src/ink/render-to-screen.ts:74/90/92 ("ported CC
  build"), src/ink/Ansi.tsx:1/32 (compiler-runtime + the `_c(12)` effect
  slot), colorize.ts, the App/Box/Text components etc.,
  hooks/use-terminal-size.ts:7 ("ported from the leak"), dom.ts, ink.tsx;
- `src/screens/`: Chat.tsx:1410/1483/170/183/257 (multiple instances of
  "ported from the leak's/CC's X");
- `src/components/` and the design system: WorkingSpinner.tsx:11/65,
  StreamingMarkdown, Markdown, PromptInput, HelpMenu, Spinner/*, etc.;
- `src/theme.ts:261-263`: "(verbatim from the leak)"; the initial version
  809591d's header self-describes as "Claude Code theme, ported verbatim
  from the leaked source (`src/utils/theme.ts`)" (dual evidence,
  re-verified by the main loop via `git show 809591d:src/theme.ts`).

## Key reclassifications (10 from adversarial verification)

| File | Reclassification | Basis |
| --- | --- | --- |
| src/types/cc.d.ts | cc-port → project-self | L1-2 self-describes as "Typing shims"; L18-19 states explicitly that the leaked package has no global.d.ts, so this file is a self-authored supplement; compiler-runtime is only a `declare module` augmentation |
| src/components/HistorySearchDialog.tsx | cc-port → unverified | L12-13's "in the shape of the leak's X" is a shape reference; but it was introduced by the initial commit with no feature commit, so it doesn't qualify as project-self |
| src/components/SearchBox.tsx | cc-port → unverified | L6's "in the round-bordered box of the leak's SearchBox" is an appearance reference; the implementation is self-authored (IME avoidance) but it was introduced by the initial commit |
| src/components/Select.tsx | cc-port → unverified | L13's lead-in phrase "in the CC CustomSelect style (ported visual: …)" is itself a style reference; ported is limited to the visuals |
| src/components/shimmer.ts | cc-port → project-self | L33's "CC's original cadence" is a stylistic reference; the feature was introduced by 5ba1d01 (not the initial commit) |
| src/components/ActivityLine.tsx | port-pi (inferred) → unverified | No "ported from the pi" header comment; only a style reference; introduced by ac7833f, which itself admits porting the 200ms cadence |
| src/ink/constants.ts | port-ink (inferred) → unverified | A full 137-path check of unpkg ink@5.2.0 has no constants.js; the filename correspondence breaks down |
| src/ink/stringWidth.ts | port-ink (inferred) → unverified | No corresponding stringWidth.js; depends on Bun.stringWidth (a Bun-family lineage) but with no explicit marker |
| src/theme.ts | unverified → cc-port | The current L263 "verbatim from the leak" + the initial version 809591d's self-statement (dual evidence) |
| src/plugin.ts | unverified → project-self | `git log --diff-filter=A` shows the introducing commit is d55dc3b (synced from the author's own repo); 809591d is only a rename lineage picked up by --follow |

## Author-identity chain (the basis for the empty deepseek-official bucket)

A commit "synced from test-ccch1mneyyy" only proves a sync from the
author's private repo — it does not prove official DeepSeek authorship.
Threefold evidence:

1. `LICENSE:3`: "Copyright (c) 2026, chimney (ccch1mneyyy)";
2. Hardcoded local paths: both `scripts/perf-probe.cjs:6/10` and
   `scripts/leak-pty-stress.cjs:7/15` contain
   `D:/code/projects/test-ccch1mneyyy`;
3. `README.md` positions this repo as a community plugin that has been
   adopted by the official project.

On this basis, the 5 "official candidates" (index.ts,
utils/loaded-context.ts, components/LoadedContextPanel.tsx,
scripts/header-probe.tsx, scripts/probe.ts) are classified as
project-self.

## Key commits

| Commit | Content |
| --- | --- |
| 809591d | The initial commit: carries most of the ported tree (including the leaked ports of src/cc/ and src/ink, and the initial theme version) |
| d55dc3b | The cordis rescope: the entry point changed to index.ts + plugin.ts (dropping JSX), dependencies synced to @deepseek-ai/*; synced from test-ccch1mneyyy 21923a68 |
| 330087a / cee58dd | Syncs from the author's own repo (the loaded-context feature, the probe script family) |
| 5ba1d01 / ac7833f / 7b425de / 8c2429b / 0530a99 / 6868601 | Feature/fix commits (shimmer, ActivityLine, virtualization, the stderr guard, CJK truncation, perf-probe) |

## Evidence-tier notes

- Every conclusion in this report is either explicit evidence (a direct
  quote, a git commit hash) or downgraded to unverified per the rules;
  there is no speculative upgrade to strong indication anywhere.
- The bulk of the 116 unverified files are ones brought in by the initial
  commit 809591d with no explicit marker — the hard limit is that there's
  no way to diff them file-by-file against the leaked original (no means
  of comparison), not a lack of evidence-gathering effort.
- SPINNER_VERBS (`src/cc/spinnerVerbs.ts`, 187 verbs, counted
  programmatically) is highly suspected of being a leaked port: it's
  referenced by WorkingSpinner.tsx:11/65, which is explicitly marked as a
  leaked port, but the file itself carries no explicit attribution, so it
  stays unverified.

Related documents: [overview.md](overview.md) (source distribution),
[ink-core.md](ink-core.md) (the ink kernel's provenance),
[unknowns.md](unknowns.md) (the unverified-items list).
