#!/usr/bin/env node
/**
 * verify-workspaces-degrade.mjs — tuiWorkspaces service optionality
 * regression (issue #183).
 *
 * The dsh CLI reads the bundle's cordis.patch.yml from "whichever copy the
 * install anchor hits first" (usually the global launcher), but loads
 * plugin modules from the profile's copy; when the two copies are on
 * mismatched versions, the older patch is missing the dsh-tui-workspaces
 * row. This script locks down the degradation contract to prevent
 * regressions:
 *
 *   - the code-level inject must never require tuiWorkspaces again (a hard
 *     inject there means startup deadlocks)
 *   - both consumers (plugin/channel) must carry the
 *     createLocalWorkspaceRuntime fallback
 *   - exactly one diagnosable warn when a profile launch is missing the
 *     service; a bare embed stays silent
 *   - the bundle patch keeps the service row + row-level inject ordering
 *     guarantee (a normal install never degrades)
 *   - the local-fallback runtime's own behavior: absolute paths/file URLs
 *     resolve, a provider URI returns undefined (triggering the existing
 *     fail-loud error), and list always includes at least the current directory
 *
 * Run: pnpm build && node scripts/verify-workspaces-degrade.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalWorkspaceRuntime } from '../lib/types/dsh-adapter/workspaces.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => readFileSync(join(root, rel), 'utf8')

const entry = read('lib/types/dsh-adapter/index.js')
const injectMatch = entry.match(/export const inject = \[([^\]]*)\]/)
assert.ok(injectMatch, 'compiled entry exports an inject list')
assert.match(injectMatch[1], /'agents'/, 'code-level inject keeps agents')
assert.doesNotMatch(
  injectMatch[1],
  /tuiWorkspaces/,
  'code-level inject must NOT hard-require tuiWorkspaces (stale patch = boot deadlock, #183)',
)

for (const rel of ['lib/types/dsh-adapter/plugin.js', 'lib/types/dsh-adapter/channel.js']) {
  const compiled = read(rel)
  assert.match(compiled, /createLocalWorkspaceRuntime/, `${rel} carries the local-only fallback`)
  assert.match(compiled, /get\('tuiWorkspaces'\)/, `${rel} reads the service optionally via ctx.get`)
}

const plugin = read('lib/types/dsh-adapter/plugin.js')
assert.equal(
  [...plugin.matchAll(/tuiWorkspaces service is not mounted/g)].length,
  1,
  'the degraded-boot warning exists exactly once',
)
assert.match(
  plugin,
  /resolveDshProfileName\(\) !== undefined/,
  'the warning is gated on profile launches (bare embedders stay silent)',
)

const patch = read('cordis.patch.yml')
assert.match(
  patch,
  /- id: dsh-tui-workspaces\n\s+name: '@deepseek-harness-tui\/dsh-tui\/workspaces'/,
  'bundle patch still mounts the workspaces row',
)
assert.match(
  patch,
  /- id: dsh-tui\n\s+name: '@deepseek-harness-tui\/dsh-tui'\n[\s\S]{0,240}inject: \[[^\]]*\btuiWorkspaces\b[^\]]*\]/,
  'row-level inject keeps tuiWorkspaces as the mount-ordering guarantee',
)
assert.ok(
  patch.indexOf('- id: dsh-tui-workspaces') < patch.indexOf("- id: dsh-tui\n"),
  'the workspaces row precedes the dsh-tui row',
)

// Local-fallback runtime behavior: covers the three input shapes for startup workspace-target resolution.
const fallback = createLocalWorkspaceRuntime()
const byPath = await fallback.resolve(process.cwd())
assert.equal(byPath?.kind, 'local', 'absolute path resolves to a local target')
assert.equal(byPath?.badge, 'LOCAL')
const byFileUrl = await fallback.resolve(`file://${process.cwd()}`)
assert.equal(byFileUrl?.cwd, byPath?.cwd, 'file URL resolves to the same local target')
assert.equal(
  await fallback.resolve('ssh://example.invalid/work'),
  undefined,
  'provider URIs stay unresolved so the caller fails loud',
)
const listed = await fallback.list(process.cwd())
assert.ok(
  listed.some(target => target.cwd === byPath?.cwd),
  'list always offers the current directory',
)
assert.equal(fallback.commands().length, 0, 'no provider commands without providers')
await assert.rejects(() => fallback.rename(process.cwd(), 'x'), /unavailable/, 'rename fails loud without the registry')

console.log('verify-workspaces-degrade: OK')
