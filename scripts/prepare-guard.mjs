#!/usr/bin/env node
/**
 * prepare pre-flight guard: a git tarball or a non-recursive clone leaves
 * the vendor submodule missing, so compilation is guaranteed to fail with
 * TS2307 across the board — better to fail fast here with the right
 * guidance (install the registry package, or clone recursively and
 * bootstrap) than let prepare blow up deep in the stack.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const probe = join(process.cwd(), 'vendor', 'dsh-std', 'packages', 'core', 'package.json')
if (!existsSync(probe)) {
  console.error('[prepare-guard] vendor/dsh-std submodule content is missing —')
  console.error('  this is a git tarball or a non-recursive clone, where `npm run compile`')
  console.error('  cannot succeed (every vendored import fails to resolve).')
  console.error('  - Installing as a plugin? Use the registry package instead:')
  console.error('      dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui')
  console.error('  - Building from source? Clone recursively, then re-run:')
  console.error('      git clone --recurse-submodules https://github.com/ccch1mneyyy/dsh-TUI')
  process.exit(1)
}
