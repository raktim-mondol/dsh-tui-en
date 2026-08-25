/**
 * i18n dictionary gate (part of verify:build). Catches three silent failures
 * types cannot express:
 *   1. English presence: every non-cmd-desc-* entry must have English
 *      (plain string, `{one,other}`, or `{ en }`). cmd-desc-* English lives
 *      in the command registry (see tOr in i18n.ts).
 *   2. Placeholders: a single-brace `{name}` is a `{{name}}` typo; t() will
 *      not substitute it. When both zh and en exist, their `{{name}}` sets
 *      must not be disjoint.
 *   3. Dead keys: no literal reference in src/ or scripts/, and not a
 *      runtime-concatenated prefix family.
 * Run: node --import tsx/esm scripts/verify-i18n.ts
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { i18nDict, type I18nText } from '../src/i18n.js'

// 运行时拼接的 key 前缀（新增拼接家族时在此登记，并附拼接点）：
//   cmd-desc-*    src/commands.ts        tOr(`cmd-desc-${command.name}`)
//   traj-sort-*   src/screens/TrajectoryScene.tsx  t(`traj-sort-${sort}`)
//   traj-proj-*   src/screens/TrajectoryScene.tsx  t(`traj-proj-${projection}`)
//   logo-drift-*  src/components/LogoV2.tsx        tOr(`logo-drift-${kind}`)
//   tree-filter-* src/screens/SessionTree.tsx      t(`tree-filter-${filter}`)
//   tree-kind-*   src/screens/SessionTree.tsx      t(`tree-kind-${entry.kind}`)
const DYNAMIC_PREFIXES = ['cmd-desc-', 'traj-sort-', 'traj-proj-', 'logo-drift-', 'tree-filter-', 'tree-kind-']

let failures = 0
function fail(msg: string) {
  failures++
  console.error(`  ✗ ${msg}`)
}

function forms(text: I18nText | undefined): string[] {
  if (text === undefined) return []
  return typeof text === 'string' ? [text] : [text.one, text.other]
}

function placeholders(text: I18nText | undefined): Set<string> {
  const names = new Set<string>()
  for (const form of forms(text)) {
    for (const m of form.matchAll(/\{\{(\w+)\}\}/g)) names.add(m[1]!)
  }
  return names
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (!b.has(x)) return false
  return true
}

function englishOf(entry: I18nText | { zh?: I18nText; en?: I18nText } | undefined): I18nText | undefined {
  if (entry === undefined) return undefined
  if (typeof entry === 'string') return entry
  if ('en' in entry || 'zh' in entry) return (entry as { en?: I18nText }).en
  return entry as I18nText
}

function zhOf(entry: I18nText | { zh?: I18nText; en?: I18nText } | undefined): I18nText | undefined {
  if (entry === undefined || typeof entry === 'string') return undefined
  if ('zh' in entry) return (entry as { zh?: I18nText }).zh
  return undefined
}

const singleBrace = /(?<!\{)\{(\w+)\}(?!\})/
for (const [key, entry] of Object.entries(i18nDict)) {
  const enText = englishOf(entry)
  const zhText = zhOf(entry)
  if (enText === undefined && !key.startsWith('cmd-desc-')) fail(`${key}: missing English`)
  for (const [lang, text] of [['en', enText], ['zh', zhText]] as const) {
    for (const form of forms(text)) {
      const m = singleBrace.exec(form)
      if (m) fail(`${key}.${lang}: single-brace {${m[1]}} — t() will not substitute; use {{${m[1]}}}`)
    }
  }
  const zh = placeholders(zhText)
  const en = placeholders(enText)
  if (enText !== undefined && zhText !== undefined && !isSubset(zh, en) && !isSubset(en, zh)) {
    fail(`${key}: placeholder names differ zh={{${[...zh].join(',')}}} en={{${[...en].join(',')}}}`)
  }
}

// ── 3：死 key（src/ 与 scripts/ 全量字面扫描 + 拼接前缀放行）──────────
const files = execSync('git ls-files src scripts', { encoding: 'utf8' })
  .trim().split('\n')
  .filter(f => /\.(ts|tsx|mjs|cjs|js)$/.test(f))
  .filter(f => f !== 'src/i18n.ts' && f !== 'scripts/verify-i18n.ts')
let corpus = ''
for (const f of files) corpus += readFileSync(f, 'utf8')
for (const key of Object.keys(i18nDict)) {
  if (DYNAMIC_PREFIXES.some(p => key.startsWith(p))) continue
  if (!corpus.includes(`'${key}'`) && !corpus.includes(`"${key}"`) && !corpus.includes(`\`${key}\``)) {
    fail(`${key}: dead key — no reference in src/ or scripts/ (register concatenated keys in DYNAMIC_PREFIXES)`)
  }
}

const total = Object.keys(i18nDict).length
if (failures > 0) {
  console.error(`verify-i18n: ${total} entries, ${failures} failure(s)`)
  process.exit(1)
}
console.log(`✓ verify-i18n: ${total} entries — English present, placeholders consistent, no dead keys`)
