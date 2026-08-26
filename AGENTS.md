# AGENTS.md

dsh-tui-en is a DeepSeek Harness terminal UI plugin: zero core patches, a
Claude Code-style TUI mounted as a Cordis plugin
(`@deepseek-harness-tui/dsh-tui`). Agent, session, model, tool, persistence,
and policy domains belong to DeepSeek Harness; this package only consumes
them. Read [docs/contributing.md](docs/contributing.md) (the shared development
contract) and [ADAPTER.md](ADAPTER.md) (upstream boundary and contract) before
changing anything; overall structure is in
[docs/architecture.md](docs/architecture.md).

The user-facing command is `dsh-tui-en`. The DSH profile name remains
`dsh-tui`. After merging
[ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI), follow
[docs/upstream-sync.md](docs/upstream-sync.md). Do not strip every Chinese
string.

## Repository layout

```
src/index.ts        Public Cordis plugin entry, config schema, lazy hand-off to the runtime
src/plugin.ts       Runtime: TTY checks, service registration, agent create/resume, React tree
src/channel.ts      Session events → view projection + non-React actions (submit/steer/rewind/resume)
src/screens/        Chat.tsx interaction coordinator and status-bar presentation
src/components/     Feature components; design-system/ is theme-aware primitives
src/ui.ts           Preferred facade for the local renderer and themed Box/Text
src/ink/            Ported Ink renderer and terminal implementation — sensitive infrastructure
src/native-ts/      Ported Yoga layout engine used by the renderer
src/cc/             Claude Code-style terminal formatting helpers
src/dsh-adapter/    The only place official @deepseek-ai/* imports are allowed
src/*Prefs.ts       Persisted user prefs and session metadata under ~/.dsh-tui
skills/             Skills shipped with the npm package
presets/            Packaged preset (liangshen)
bin/dsh-tui.js      dsh-tui-en command entry
vendor/dsh-std      Vendored dependency (frozen lockfile build)
dsh-ecosystem-spec/ Ecosystem adapter spec submodule
cordis.patch.yml    Package overlay installed into the profile
cordis.yml          Full bare composition example for a direct Cordis/DSH launch
scripts/            Headless regressions, repros, probes; read the script header first
docs/               Docs kept off the root README; English is the primary copy
lib/                Generated from src/ — not committed, shipped on npm, never hand-edited
```

The full repository map and runtime path are in
[docs/contributing.md](docs/contributing.md).

## Commands

```sh
pnpm install --frozen-lockfile  # pnpm 11; Node ^22.19 || >=24 (CI uses Node 24)
pnpm compile                    # clean compile src/ → lib/types/ (deletes lib/ first)
pnpm build                      # compile + every build gate
pnpm verify:build               # build gates without recompiling
pnpm verify:package             # npm tarball surface + entry smoke import
pnpm smoke                      # generic headless screen-assembly smoke
```

There is **no root `test` or `lint` script** — do not claim you ran them.
The static gate is the TypeScript build; behavior is checked by focused
regression scripts and repros. Most scripts that import `lib/types/` need
`pnpm build` first; scripts that import TypeScript sources declare
`node --import tsx/esm <script>` in their header. Do not infer the input
layer from the file extension. `scripts/` also holds forensic/interactive
tools (heap analysis, PTY probes, replay capture, perf probes) that are not
bounded tests — do not run them as a suite.

- Pick verification by the surface you changed: shared rendering, `Chat`,
  prompt/questionnaire layout, tool cards, theme primitives, or `ink/` core
  require CI regressions. Narrow changes run the matching focused script;
  see the table in [docs/contributing.md](docs/contributing.md).
- Pure docs, workflow, or YAML changes do not need a rebuild unless TypeScript
  inputs changed too.

## Upstream boundary and contract

- Official `@deepseek-ai/*` packages may be imported only under
  `src/dsh-adapter/`. UI layers go through the adapter facade.
  `pnpm run verify:boundary` scans the tree and fails on violations.
- Validated version lines, peer ranges, and the blessed package list live in
  `src/dsh-adapter/contract.ts`. Local drift warns; CI `verify:contract` fails.
- `@deepseek-ai/*` framework packages referenced at runtime or in published
  types must be both peer and dev dependencies (`verify:manifest-deps`).
- Interventions in `cordis.patch.yml` against official rows are snapshotted
  in `patch-surface.snapshot.json` (`verify:patch-surface`).

## Conventions

- **Source vs artifacts**: edit `src/`, never `lib/`, and do not commit
  generated files under `lib/`.
- **Session log is truth**: do not insert optimistic assistant/tool facts that
  can diverge from persisted events.
- **Layering**: projection and TUI actions belong in `channel.ts`; interaction
  modes and key priority belong in `Chat.tsx`; terminal protocol, layout, and
  frame diffing belong in `ink/`. Do not reimplement DSH domain services in
  the TUI.
- **Registration is effectful**: clean up with `ctx.effect` or the existing
  single exit funnel. Restore terminal state on a clean exit.
- **Quiet rendering**: no `console.log` or stdout diagnostics while the TUI
  is active; use opt-in stderr/debug paths (`DSH_TUI_DEBUG`,
  `DSH_TUI_RENDER_LOG`).
- **TypeScript**: ESM only, relative imports use `.js` suffixes; prefer
  `import type`; do not introduce `any` because the ported Ink core is loose.
- **Terminal width is display-cell width**, not JS string length.
- **Docs are English**: keep README.md and the unsuffixed files under `docs/`
  in English. `docs/*.en.md` are upstream English counterparts kept to ease
  merges. The merge overlay is [docs/upstream-sync.md](docs/upstream-sync.md).
- **Secrets**: interactive launch reads `DEEPSEEK_API_KEY`; diagnostics may
  only report whether it is set.
- **Git safety**: stage explicit paths only; do not `git add .` / `git add -A`;
  do not commit, tag, push, or publish unless asked.

## Editing this file

`CLAUDE.md` is a symlink to `AGENTS.md`; edit the real file. Keep each rule
self-contained and link to the authoritative doc for detail.
