#!/usr/bin/env node
/**
 * verify-legacy-rename.mjs — issue #120 rename-migration regression
 * (CC_TUI_* / DSH_CC_* prefixes → DSH_TUI_*, data dir ~/.dsh-cc →
 * ~/.dsh-tui). Uses a temp dir / injected env only; never touches the
 * real home. Covers three things:
 *   1. migrateLegacyDataDir: copies only when the old dir exists and the
 *      new one does not (copy, not move; old dir kept). Idempotent false
 *      when the target already exists;
 *   2. resume.txt dual-write contract: compiled lib/types/sessionHistory.js
 *      references both the new (~/.dsh-tui) and old (~/.dsh-cc) resume
 *      paths — dirs are not injectable, so this is a text assert on the
 *      build artifact, same as verify-update.mjs;
 *   3. detectLegacyEnv: reports only old names in RENAMED_ENV —
 *      DSH_CC_RESUME_SESSION is the legitimate half of the dual-read
 *      contract and must not be reported; every RENAMED_ENV new name
 *      starts with DSH_TUI_.
 *
 * Run: pnpm build && node scripts/verify-legacy-rename.mjs
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`)
  if (!ok) failures++
}

// paths.js's module-level constants (DATA_DIR etc.) resolve the real home,
// but everything below injects the directory/env via parameters instead —
// the real home is only ever read as a path string, never written to.
const { migrateLegacyDataDir, detectLegacyEnv, RENAMED_ENV } = await import('../lib/types/utils/paths.js')

// --- 1. migrateLegacyDataDir: first-run copy migration ----------------------
const tmp = mkdtempSync(join(tmpdir(), 'verify-legacy-rename-'))
const legacy = join(tmp, '.dsh-cc')
const target = join(tmp, '.dsh-tui')
mkdirSync(join(legacy, 'themes'), { recursive: true })
writeFileSync(join(legacy, 'theme.json'), '{"theme":"dark"}')
writeFileSync(join(legacy, 'themes', 'sakura.json'), '{"base":"dark","colors":{}}')

check('migrate: first call copies legacy → target', migrateLegacyDataDir(legacy, target) === true)
check(
  'migrate: target content matches legacy',
  readFileSync(join(target, 'theme.json'), 'utf8') === '{"theme":"dark"}'
    && readFileSync(join(target, 'themes', 'sakura.json'), 'utf8') === '{"base":"dark","colors":{}}',
)
check('migrate: legacy dir preserved (copy, not move)', existsSync(join(legacy, 'theme.json')))
check('migrate: second call is a no-op (target exists)', migrateLegacyDataDir(legacy, target) === false)
check('migrate: missing legacy is a no-op', migrateLegacyDataDir(join(tmp, 'no-such-dir'), join(tmp, 'other')) === false)

// --- 2. resume.txt dual-write contract (text assert on the build artifact) --
const history = readFileSync(join(root, 'lib', 'types', 'sessionHistory.js'), 'utf8')
check('resume dual-write: new path ~/.dsh-tui referenced', history.includes('.dsh-tui'))
check('resume dual-write: legacy path ~/.dsh-cc referenced', history.includes('.dsh-cc'))
check('resume dual-write: both RESUME_FILE and LEGACY_RESUME_FILE wired', history.includes('RESUME_FILE') && history.includes('LEGACY_RESUME_FILE'))

// --- 3. detectLegacyEnv / RENAMED_ENV ---------------------------------------
const found = detectLegacyEnv({
  CC_TUI_THEME: 'dark',
  DSH_CC_SESSION_ROOT: join(tmp, 'sessions'),
  DSH_CC_RESUME_SESSION: '00000000-1111-2222-3333-444444444444', // the legitimate half of the dual-read contract
  DSH_TUI_THEME: 'dark', // the new name, not a deprecated one
})
check('detectLegacyEnv: reports CC_TUI_THEME', found.includes('CC_TUI_THEME'))
check('detectLegacyEnv: reports DSH_CC_SESSION_ROOT', found.includes('DSH_CC_SESSION_ROOT'))
check('detectLegacyEnv: DSH_CC_RESUME_SESSION not reported (dual-read contract)', !found.includes('DSH_CC_RESUME_SESSION'))
check('detectLegacyEnv: new names not reported', !found.includes('DSH_TUI_THEME'))
check('RENAMED_ENV: CC_TUI_THEME → DSH_TUI_THEME', RENAMED_ENV.CC_TUI_THEME === 'DSH_TUI_THEME')
check('RENAMED_ENV: DSH_CC_SESSION_ROOT → DSH_TUI_SESSION_ROOT', RENAMED_ENV.DSH_CC_SESSION_ROOT === 'DSH_TUI_SESSION_ROOT')
check('RENAMED_ENV: every new name starts with DSH_TUI_', Object.values(RENAMED_ENV).every(name => name.startsWith('DSH_TUI_')))

rmSync(tmp, { recursive: true, force: true })
if (failures > 0) {
  console.error(`verify-legacy-rename: ${failures} check(s) failed`)
  process.exit(1)
}
console.log('verify-legacy-rename: OK ✅')
