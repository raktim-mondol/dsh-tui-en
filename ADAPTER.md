# Adapter Boundary and Upstream Contract

## Boundary Rule

Official `@deepseek-ai/*` packages may only be imported inside
`src/dsh-adapter/`. The UI layer (`screens/`, `components/`, `ink/`,
`hooks/`, `utils/`, `cc/`) touches upstream only indirectly, through the
adapter's facade (type re-exports from `src/dsh-adapter/types.ts`, runtime
services like `channel.ts`/`plugin.ts`).

Gate: `pnpm run verify:boundary` (scans the whole source tree; any
out-of-bounds import fails; wired into `build`).

## Upstream Contract

- Validated version line: `0.1.0-rc.6` (`src/dsh-adapter/contract.ts`)
- Blessed package list (harness packages validated by rc number, framework
  packages cordis/schemastery validated by major version)
- At startup: drift logs a warning; on CI, `pnpm run verify:contract` fails outright

## Patch Surface

`cordis.patch.yml`'s interventions on official rows are snapshotted to
`patch-surface.snapshot.json`:

- **disables**: 23 rows, aligned with official `@deepseek-ai/dsh-web-app`'s
  own patch (the structural disables from preset-ownership migration —
  official web does the same); TUI-specific disables: 0. Official web-app
  additionally disables one more row, `hmr` (which the TUI doesn't need)
- **config overrides**: 6 rows (system-prompt / llm-deepseek / agent-loop /
  sandbox-policy / approval / session-persistence-jsonl), all surface-level release config
- **inserts**: 8 rows (dsh-tui, working-activity, storage, storage-json,
  storage-domain, workspace, agent-presets, cordis-host-runner; the last 6
  are shared with official web-app)

If the patch surface changes after an upstream release, `pnpm run
verify:patch-surface` fails first in CI; after confirming the diff is
intentional, run `node --import tsx/esm scripts/verify-patch-surface.ts
--snapshot` to regenerate the snapshot.

## Upgrade Process

1. `pnpm add` each `@deepseek-ai/*` package to the new rc version
2. `pnpm run build` (typecheck + all three gates)
3. If patch-surface or contract warns: review the diff, update
   `contract.ts`'s validated version / regenerate the snapshot
4. Business UI code should need zero changes in principle; if a change is
   needed, it must land inside `src/dsh-adapter/`
