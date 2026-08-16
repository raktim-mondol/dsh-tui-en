#!/usr/bin/env node
/**
 * verify-cordis-approval.mjs — approval-service config regression
 * (issue #49 leftover).
 *
 * Covers approval-config consistency across the two launch entries
 * (bare-combo cordis.yml and profile cordis.patch.yml):
 *   - the bare combo must mount the @deepseek-ai/dsh-user-approval row
 *     (without it the approval/request waterfall has no service, so a
 *     sandbox_permissions escalate fail-closes as unavailable — the
 *     #49 repro root cause on the dev path)
 *   - both entries evaluate the policy expression to the same value in
 *     each scenario (entry semantics must not drift):
 *       linux + default (workspace-write)     → 'ask'
 *       linux + DSH_PERMISSION_MODE full-allow → 'never' (nothing left to ask)
 *       win32                                  → 'never' (no sandbox — the terminal's trust model)
 *
 * Introduces no YAML-parsing dependency: extracts the !!js expression text
 * per this repo's documented fixed line layout, and evaluates it against a
 * mock process (platform/env). A layout change that breaks extraction FAILs
 * rather than silently skipping — that's exactly the regression this guards.
 *
 * Run: node scripts/verify-cordis-approval.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

/** Extract the `policy: !!js "..."` expression text from an approval row. */
function extractPolicy(text, withName) {
  const pattern = withName
    ? /- id: approval\n\s+name: '@deepseek-ai\/dsh-user-approval'\n\s+config:\n\s+policy: !!js "([^"\n]+)"/
    : /- id: approval\n\s+config:\n\s+policy: !!js "([^"\n]+)"/
  return pattern.exec(text)?.[1]
}

/** Evaluate a !!js policy expression against a mocked process. */
function evalPolicy(expr, platform, permissionMode) {
  const process = { platform, env: permissionMode === undefined ? {} : { DSH_PERMISSION_MODE: permissionMode } }
  return new Function('process', `return (${expr})`)(process)
}

const SCENARIOS = [
  ['linux default (workspace-write)', 'linux', undefined, 'ask'],
  ['linux danger-full-access', 'linux', 'danger-full-access', 'never'],
  ['win32 default', 'win32', undefined, 'never'],
  ['win32 danger-full-access', 'win32', 'danger-full-access', 'never'],
]

const bare = readFileSync(join(root, 'cordis.yml'), 'utf8')
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

const barePolicy = extractPolicy(bare, true)
check('bare cordis.yml mounts the @deepseek-ai/dsh-user-approval row', barePolicy !== undefined)
const patchPolicy = extractPolicy(patch, false)
check('profile cordis.patch.yml keeps an approval policy row', patchPolicy !== undefined)

for (const [name, platform, mode, expected] of SCENARIOS) {
  if (barePolicy !== undefined) {
    const got = evalPolicy(barePolicy, platform, mode)
    check(`bare policy: ${name} -> ${expected}`, got === expected, `got ${got}`)
  }
  if (patchPolicy !== undefined) {
    const got = evalPolicy(patchPolicy, platform, mode)
    check(`profile policy: ${name} -> ${expected}`, got === expected, `got ${got}`)
  }
}

if (barePolicy !== undefined && patchPolicy !== undefined) {
  const drift = SCENARIOS.filter(([, platform, mode]) =>
    evalPolicy(barePolicy, platform, mode) !== evalPolicy(patchPolicy, platform, mode))
  check('bare and profile policies agree in every scenario', drift.length === 0,
    drift.map(([name]) => name).join(', '))
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all approval config checks passed')
