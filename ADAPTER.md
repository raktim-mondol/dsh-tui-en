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

- Validated version line: primary `0.1.1-rc.2`, compatible with `0.1.1-rc.1`
  / `0.1.0-rc.8` / `0.1.0-rc.7` / `0.1.0-rc.6`
  (`UPSTREAM_VALIDATED_VERSIONS` in `src/dsh-adapter/contract.ts`; feature
  gating uses `installedMeetsVersion(pkg, 'x.y.z-rc.n')` for cross-family
  comparison, degrading gracefully on older installs)
- Peer range: `^0.1.0-rc.6 || ^0.1.1-rc.1` (allows installs from rc.6 onward
  and the 0.1.1 line; a version outside the contract logs a drift warning
  at startup)
- Blessed package list (harness packages validated by full version number,
  framework packages cordis/schemastery validated by major version)
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
- **inserts**: 14 rows (dsh-tui, working-activity, six plugin-interop rows,
  plus dsh-tui-storage, dsh-tui-storage-json, dsh-tui-storage-domain,
  dsh-tui-workspace, dsh-tui-agent-presets, dsh-tui-cordis-host-runner).
  The last 6 correspond to official web-app's host-plane services but use
  dsh-tui-scoped ids, and self-disable when they detect an official row
  with the same id/name already present, so they coexist safely
  (`dsh web` no longer hits a `duplicate loader entry id`)

If the patch surface changes after an upstream release, `pnpm run
verify:patch-surface` fails first in CI; after confirming the diff is
intentional, run `node --import tsx/esm scripts/verify-patch-surface.ts
--snapshot` to regenerate the snapshot. `pnpm run verify:web-coexistence`
composes the dsh-tui patch together with the official web-app patch under
include semantics, directly catching any loader-entry-id reuse.

## Upgrade Process

1. `pnpm add` each `@deepseek-ai/*` package to the new rc version
2. `pnpm run build` (typecheck + all three gates)
3. If patch-surface or contract warns: review the diff, update
   `contract.ts`'s validated version / regenerate the snapshot
4. Business UI code should need zero changes in principle; if a change is
   needed, it must land inside `src/dsh-adapter/`
