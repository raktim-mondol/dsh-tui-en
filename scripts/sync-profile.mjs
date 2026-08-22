#!/usr/bin/env node
/**
 * sync-profile.mjs — syncs the current worktree's build output into the
 * active dsh-tui profile, so running `dsh-tui` directly runs this repo's
 * code (edit, then test).
 *
 * Sync scope = package.json's `files` list (bin/, lib/, cordis.patch.yml,
 * dsh-ecosystem-spec/{registry,protocols,schemas}, presets, skills),
 * identical to the published package. Compares each file's hash and copies
 * only the ones that differ; does not remove extra dependency files already
 * in the profile (node_modules etc. are managed by dsh plugin).
 *
 * Usage:
 *   node scripts/sync-profile.mjs            # compare and sync (prints the change list)
 *   node scripts/sync-profile.mjs --check    # compare only, no changes (exit code 2 = differences found)
 *
 * Profile location: $DSH_HOME/profiles/dsh-tui (platform default when unset:
 *   Windows %USERPROFILE%/.dsh-cc, elsewhere ~/.dsh) — matches bin/dsh-tui.js.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const PACKAGE = '@deepseek-harness-tui/dsh-tui'
const PROFILE = 'dsh-tui'

const checkOnly = process.argv.includes('--check')

function sha256(file) {
  const hash = createHash('sha256')
  hash.update(readFileSync(file))
  return hash.digest('hex')
}

/** Collect every relative file path under a `files` entry. */
function collectFiles(entry, base, out = []) {
  const full = join(base, entry)
  if (!existsSync(full)) return out
  if (statSync(full).isFile()) {
    out.push(entry)
    return out
  }
  for (const child of readdirSync(full)) {
    collectFiles(join(entry, child), base, out)
  }
  return out
}

const dshHome = process.env.DSH_HOME
  ? resolve(process.env.DSH_HOME)
  : process.platform === 'win32'
    ? join(process.env.USERPROFILE ?? homedir(), '.dsh-cc')
    : join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', PROFILE)
const installed = join(profileDir, 'node_modules', PACKAGE)

if (!existsSync(join(installed, 'package.json'))) {
  console.error(`[sync-profile] profile not installed: ${installed}`)
  console.error(`  (first run: launch dsh-tui to let it bootstrap, or manually:`)
  console.error(`   dsh plugin --profile ${PROFILE} add ${PACKAGE}@${pkg.version})`)
  process.exit(1)
}

const profileVersion = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version
if (profileVersion !== pkg.version) {
  console.log(`[sync-profile] version mismatch: worktree=${pkg.version} profile=${profileVersion} (files still sync from the worktree; the launcher will print an alignment hint)`)
}

const rels = (pkg.files ?? []).flatMap(entry => collectFiles(entry, root))
// package.json isn't in `files`, but its version must track the worktree —
// otherwise the launcher prints an alignment hint on every startup
// (profile older than the launcher).
if (!rels.includes('package.json')) rels.push('package.json')
const changed = []
for (const rel of rels) {
  const src = join(root, rel)
  const dst = join(installed, rel)
  const same = existsSync(dst) && sha256(src) === sha256(dst)
  if (!same) changed.push(rel)
}

console.log(`[sync-profile] ${PACKAGE}@${pkg.version}`)
console.log(`[sync-profile] worktree: ${root}`)
console.log(`[sync-profile] profile:  ${installed}`)
console.log(`[sync-profile] compared ${rels.length} published files, ${changed.length} differ`)

if (changed.length === 0) {
  console.log('[sync-profile] profile already matches the worktree ✅')
  process.exit(0)
}

if (checkOnly) {
  for (const rel of changed) console.log(`  ! ${rel}`)
  console.error('[sync-profile] differences found (--check)')
  process.exit(2)
}

for (const rel of changed) {
  const src = join(root, rel)
  const dst = join(installed, rel)
  mkdirSync(dirname(dst), { recursive: true })
  copyFileSync(src, dst)
  console.log(`  → ${rel}`)
}
console.log('[sync-profile] Sync complete. Restart dsh-tui to pick it up.')
