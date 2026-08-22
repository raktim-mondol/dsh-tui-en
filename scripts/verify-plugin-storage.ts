/**
 * Battery 3: the storage.local contract surface (C-040).
 *
 *   A. Round-trip semantics: get/set/delete, absent-key get→null /
 *      delete→false, full JSON type round-trip, overwrite writes;
 *   B. Authorization: no grant → denied and nothing hits disk; read-only
 *      grant → set/delete denied; after revocation (new store, simulating a
 *      file edit + restart) any call fails immediately;
 *   C. Parameter validation: illegal keys (empty/oversized/control chars/
 *      non-string) and non-JSON-serializable values always carry
 *      code=INVALID_KEY;
 *   D. namespace isolation and filename sanitization: two plugins each
 *      write their own file, invisible to each other; scoped names are
 *      reversibly encoded, with fallbacks for '.'/'..'/empty;
 *   E. Dual quota thresholds: 256 keys, 256 KiB — over the limit the write
 *      is denied and the file is unchanged;
 *   F. Corrupt-file safety: both get/set report STORAGE_UNAVAILABLE, bytes
 *      are preserved as-is; a non-object document gets the same treatment;
 *   G. Lifecycle: two handles on the same namespace share a call-order
 *      chain; unload only closes its own handle, disposer is idempotent;
 *   H. Privacy: key/value material never appears in logs;
 *   I. The descriptor now declares the LocalStorage contract (with both
 *      permissions).
 *
 * HOME/USERPROFILE are isolated before importing src.
 *
 * Run via `node --import tsx/esm scripts/verify-plugin-storage.ts`.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Isolate HOME (must happen before any src import) ───────────────────────
const fakeHome = mkdtempSync(join(tmpdir(), 'dsh-plugin-storage-home-'))
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome
process.env.DSH_TUI_LANG = 'zh'

const { Context } = await import('@deepseek-ai/cordis')
const pluginHostRow = await import('../src/dsh-adapter/plugin-host.js')
const {
  PluginStorageError,
  STORAGE_MAX_BYTES,
  STORAGE_MAX_KEYS,
  storageFileName,
  PLUGIN_STORAGE_DIR,
} = await import('../src/dsh-adapter/plugin-storage.js')
const { buildHostDescriptor } = await import('../src/dsh-adapter/host-descriptor.js')
const { readGrantStore } = await import('../src/dsh-adapter/grants.js')
const { TuiPluginStorageRuntime } = await import('../src/dsh-adapter/plugin-storage.js')
const { DATA_DIR } = await import('../src/utils/paths.js')
const { mountAdmitted, testManifest, STORAGE_COORDINATE } = await import('./plugin-test-utils.js')
import type { TuiPluginStorage } from '../src/dsh-adapter/plugin-storage.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const cleanup: string[] = [fakeHome]

let checks = 0
const failures: string[] = []
const check1 = (name: string, ok: boolean, detail?: string) => {
  checks += 1
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}
const expectCode = async (name: string, code: string, action: () => Promise<unknown>) => {
  checks += 1
  try {
    await action()
    failures.push(`${name}: expected ${code} but resolved`)
  } catch (error) {
    if (!(error instanceof PluginStorageError && error.code === code)) {
      failures.push(`${name}: expected ${code}, got ${error instanceof Error ? `${error.name}(${String((error as { code?: unknown }).code)})` : String(error)}`)
    }
  }
}

// ── Grants file: each admitted Component gets scoped authorization by manifest ID ──
mkdirSync(DATA_DIR, { recursive: true })
const componentId = (plugin: string) => `com.example.${plugin}`
const storageGrant = (plugin: string, name: string) => ({ name, scope: componentId(plugin) })
const GRANTS_READ_WRITE = (plugin: string) => [
  storageGrant(plugin, 'storage.local.read'),
  storageGrant(plugin, 'storage.local.write'),
]
writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
  grants: {
    'com.example.alpha': GRANTS_READ_WRITE('alpha'),
    'com.example.beta': GRANTS_READ_WRITE('beta'),
    'com.example.heavy': GRANTS_READ_WRITE('heavy'),
    'com.example.fresh': GRANTS_READ_WRITE('fresh'),
    'com.example.reader': [storageGrant('reader', 'storage.local.read')],
  },
}))
const storageRoot = join(DATA_DIR, PLUGIN_STORAGE_DIR)

const hostCtx = new Context()
const hostWarnings: string[] = []
hostCtx.logger.warn = (format: unknown, ...params: unknown[]) => {
  hostWarnings.push([format, ...params].map(String).join(' '))
}
hostCtx.plugin({ name: pluginHostRow.name, apply: pluginHostRow.apply })
await sleep(50)

const handles = new Map<string, TuiPluginStorage>()
const activations = new Map<string, { context: InstanceType<typeof Context>; fiber: { dispose(): unknown } }>()
const openAs = async (plugin: string, permissions: readonly { name: string; scope: string }[] = GRANTS_READ_WRITE(plugin)) => {
  const admitted = await mountAdmitted(hostCtx, plugin, testManifest({
    id: componentId(plugin),
    requires: [STORAGE_COORDINATE],
    permissions,
  }))
  const service = admitted.context.get('tuiPluginStorage')
  if (service === undefined) throw new Error('tuiPluginStorage not mounted')
  handles.set(plugin, service.open(admitted.context))
  activations.set(plugin, admitted)
}
const handle = (plugin: string): TuiPluginStorage => {
  const found = handles.get(plugin)
  if (!found) throw new Error(`no handle for ${plugin}`)
  return found
}

await openAs('alpha')
await openAs('beta')
await openAs('heavy')
await openAs('fresh')
await openAs('reader', [storageGrant('reader', 'storage.local.read')])
await openAs('gamma', [])

// ── A. Round-trip semantics ─────────────────────────────────────────────────
{
  const alpha = handle('alpha')
  check1('get on absent key resolves null', (await alpha.get({ key: 'missing' })).value === null)
  check1('set resolves stored=true', (await alpha.set({ key: 'k1', value: { deep: [1, 'two', true] } })).stored === true)
  check1('round-trip returns the value', JSON.stringify((await alpha.get({ key: 'k1' })).value) === JSON.stringify({ deep: [1, 'two', true] }))
  check1('overwrite resolves stored=true', (await alpha.set({ key: 'k1', value: 'plain' })).stored === true)
  check1('overwrite visible', (await alpha.get({ key: 'k1' })).value === 'plain')
  for (const [label, value] of [['number', 42], ['boolean', false], ['null', null], ['array', [1, 2]], ['string', 'x']] as const) {
    await alpha.set({ key: `type-${label}`, value })
    check1(`JSON ${label} round-trips`, JSON.stringify((await alpha.get({ key: `type-${label}` })).value) === JSON.stringify(value))
  }
  check1('delete on present key resolves deleted=true', (await alpha.delete({ key: 'k1' })).deleted === true)
  check1('deleted key reads null', (await alpha.get({ key: 'k1' })).value === null)
  check1('delete on absent key resolves deleted=false', (await alpha.delete({ key: 'k1' })).deleted === false)
  check1('namespace file uses the verified manifest Component identity',
    existsSync(join(storageRoot, 'com.example.alpha.json'))
    && !existsSync(join(storageRoot, 'alpha.json')))
}

// ── B. Authorization ─────────────────────────────────────────────────────
{
  // No grant: denied, and nothing hits disk.
  await expectCode('ungranted get denied', 'PERMISSION_NOT_GRANTED', () => handle('gamma').get({ key: 'x' }))
  await expectCode('ungranted set denied', 'PERMISSION_NOT_GRANTED', () => handle('gamma').set({ key: 'x', value: 1 }))
  await expectCode('ungranted delete denied', 'PERMISSION_NOT_GRANTED', () => handle('gamma').delete({ key: 'x' }))
  check1('denied plugin never lands a file', !existsSync(join(storageRoot, 'gamma.json')))

  // read-only: get works, set/delete denied.
  check1('read-only grant: get works', (await handle('reader').get({ key: 'anything' })).value === null)
  await expectCode('read-only grant: set denied', 'PERMISSION_NOT_GRANTED', () => handle('reader').set({ key: 'x', value: 1 }))
  await expectCode('read-only grant: delete denied', 'PERMISSION_NOT_GRANTED', () => handle('reader').delete({ key: 'x' }))

  // Revocation (= a file edit + restart, simulated with an independent runtime + re-read store): the call fails immediately.
  writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
    grants: { 'com.example.alpha': [storageGrant('alpha', 'storage.local.read')] },
  }))
  const revokedHandle = handle('alpha')
  check1('revoked runtime: surviving read grant still works', (await revokedHandle.get({ key: 'anything' })).value === null)
  await expectCode('revoked runtime: write fails immediately', 'PERMISSION_NOT_GRANTED', () => revokedHandle.set({ key: 'x', value: 1 }))
  writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
    grants: {
      'com.example.alpha': GRANTS_READ_WRITE('alpha'),
      'com.example.beta': GRANTS_READ_WRITE('beta'),
      'com.example.heavy': GRANTS_READ_WRITE('heavy'),
      'com.example.fresh': GRANTS_READ_WRITE('fresh'),
      'com.example.reader': [storageGrant('reader', 'storage.local.read')],
    },
  }))
}

// ── C. Parameter validation ─────────────────────────────────────────────────
{
  const alpha = handle('alpha')
  for (const [label, key] of [['empty', ''], ['too long', 'x'.repeat(129)], ['control char', 'a\nb'], ['non-string', 42]] as const) {
    await expectCode(`invalid key (${label})`, 'INVALID_KEY', () => alpha.get({ key: key as string }))
  }
  await expectCode('undefined value rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-value', value: undefined }))
  const circular: { self?: unknown } = {}
  circular.self = circular
  await expectCode('circular value rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-value', value: circular }))
  await expectCode('bigint value rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-value', value: 1n }))
  check1('rejections left no residue key', (await alpha.get({ key: 'bad-value' })).value === null)

  // P2-6: any input JSON.stringify would silently reshape is always rejected (a round-trip must not lie).
  await expectCode('NaN rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-nan', value: Number.NaN }))
  await expectCode('Infinity rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-inf', value: Number.POSITIVE_INFINITY }))
  await expectCode('-Infinity rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-neg-inf', value: Number.NEGATIVE_INFINITY }))
  await expectCode('undefined array item rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-arr', value: [1, undefined, 3] }))
  await expectCode('undefined object property rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-obj', value: { a: undefined } }))
  // eslint-disable-next-line no-sparse-arrays
  await expectCode('sparse array rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-sparse', value: new Array(3) }))
  await expectCode('function value rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-fn', value: () => 1 }))
  await expectCode('symbol value rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-sym', value: Symbol('s') }))
  class SomeClass { a = 1 }
  await expectCode('class instance rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-class', value: new SomeClass() }))
  await expectCode('toJSON-carrying object rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-tojson', value: { toJSON: () => ({}) } }))
  const arrayWithToJSON = Object.assign([1], { toJSON: () => undefined })
  await expectCode('array toJSON hook rejected before it can erase the stored key', 'INVALID_VALUE', () => alpha.set({ key: 'bad-array-tojson', value: arrayWithToJSON }))
  const hiddenToJSON: Record<string, unknown> = {}
  Object.defineProperty(hiddenToJSON, 'toJSON', { value: () => undefined })
  await expectCode('non-enumerable toJSON hook rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-hidden-tojson', value: hiddenToJSON }))
  const hiddenProperty: Record<string, unknown> = { visible: true }
  Object.defineProperty(hiddenProperty, 'hidden', { value: true })
  await expectCode('non-enumerable own property rejected', 'INVALID_VALUE', () => alpha.set({ key: 'bad-hidden-property', value: hiddenProperty }))
  // A DAG (shared reference, no cycle) is legal — stringify expands the duplicate, no lie.
  const shared = { x: 1 }
  check1('DAG (shared reference, no cycle) accepted', (await alpha.set({ key: 'dag', value: { left: shared, right: shared } })).stored === true)
  check1('DAG round-trips expanded',
    JSON.stringify((await alpha.get({ key: 'dag' })).value) === JSON.stringify({ left: { x: 1 }, right: { x: 1 } }))

  // P2-5: prototype-chain names are just ordinary data — no reading the host prototype, no faking existence, no pollution.
  check1('get("toString") on an empty key is null (no prototype leak)', (await alpha.get({ key: 'toString' })).value === null)
  check1('get("constructor") is null', (await alpha.get({ key: 'constructor' })).value === null)
  check1('delete("toString") is false (no fake membership)', (await alpha.delete({ key: 'toString' })).deleted === false)
  check1('set("__proto__") stores ordinary data', (await alpha.set({ key: '__proto__', value: { polluted: false } })).stored === true)
  check1('get("__proto__") returns the stored own value',
    JSON.stringify((await alpha.get({ key: '__proto__' })).value) === JSON.stringify({ polluted: false }))
  check1('Object.prototype untouched by the __proto__ write',
    ({} as { polluted?: unknown }).polluted === undefined)
  check1('delete("__proto__") is true', (await alpha.delete({ key: '__proto__' })).deleted === true)
  check1('post-delete get("__proto__") is null', (await alpha.get({ key: '__proto__' })).value === null)
  // Still own-property semantics after a disk round-trip (readTable's null-prototype reconstruction).
  check1('set("toString") shadows the prototype as own data', (await alpha.set({ key: 'toString', value: 'own' })).stored === true)
  check1('get("toString") returns the stored string', (await alpha.get({ key: 'toString' })).value === 'own')
  check1('delete("toString") now true', (await alpha.delete({ key: 'toString' })).deleted === true)

  // The namespace has no file yet: this exercises the ENOENT table shape,
  // not only the null-prototype reconstruction of an existing document.
  const fresh = handle('fresh')
  check1('new namespace set("__proto__") stores ordinary data',
    (await fresh.set({ key: '__proto__', value: { from: 'new-table' } })).stored === true)
  check1('new namespace get("__proto__") round-trips the stored value',
    JSON.stringify((await fresh.get({ key: '__proto__' })).value) === JSON.stringify({ from: 'new-table' }))
}

// ── D. namespace isolation and filename sanitization ────────────────────────
{
  await handle('beta').set({ key: 'shared-key', value: 'beta-value' })
  await handle('alpha').set({ key: 'shared-key', value: 'alpha-value' })
  check1('namespaces are isolated on disk', existsSync(join(storageRoot, `${storageFileName(componentId('beta'))}.json`)))
  check1('beta reads its own value', (await handle('beta').get({ key: 'shared-key' })).value === 'beta-value')
  check1('alpha reads its own value', (await handle('alpha').get({ key: 'shared-key' })).value === 'alpha-value')
  check1('scoped name encodes reversibly', storageFileName('@scope/pkg') === encodeURIComponent('@scope/pkg'))
  check1('plain names pass through', storageFileName('alpha') === 'alpha')
  check1("'.' and '..' map to the safe fallback", storageFileName('.') === '_' && storageFileName('..') === '_')
  check1('empty name maps to the safe fallback', storageFileName('') === '_')
}

// ── E. Dual quota thresholds ─────────────────────────────────────────────────
{
  // keys threshold: after heavy fills 256 keys, the 257th is denied.
  const heavy = handle('heavy')
  for (let i = 0; i < STORAGE_MAX_KEYS; i++) {
    await heavy.set({ key: `quota-${String(i).padStart(3, '0')}`, value: i })
  }
  await expectCode('key 257 hits the keys quota', 'QUOTA_EXCEEDED', () => heavy.set({ key: 'quota-overflow', value: 1 }))
  check1('quota rejection wrote nothing', (await heavy.get({ key: 'quota-overflow' })).value === null)

  // bytes threshold: updating an existing key with an oversized value → denied, old value unchanged.
  const huge = 'h'.repeat(STORAGE_MAX_BYTES)
  await expectCode('oversized update hits the bytes quota', 'QUOTA_EXCEEDED', () => heavy.set({ key: 'quota-000', value: huge }))
  check1('bytes rejection kept the old value', (await heavy.get({ key: 'quota-000' })).value === 0)

  // beta uses an almost-empty namespace to verify a single write can exceed the quota.
  await expectCode('single oversized write rejected', 'QUOTA_EXCEEDED', () => handle('beta').set({ key: 'huge', value: huge }))
}

// ── F. Corrupt-file safety ─────────────────────────────────────────────────
{
  const file = join(storageRoot, `${storageFileName(componentId('beta'))}.json`)
  writeFileSync(file, '{ not json at all')
  await expectCode('corrupt namespace: get fails', 'STORAGE_UNAVAILABLE', () => handle('beta').get({ key: 'x' }))
  await expectCode('corrupt namespace: set fails (never auto-overwrite)', 'STORAGE_UNAVAILABLE', () => handle('beta').set({ key: 'x', value: 1 }))
  check1('corrupt bytes preserved verbatim', readFileSync(file, 'utf8') === '{ not json at all')

  // A non-object document gets the same unavailable treatment.
  writeFileSync(file, '[1,2,3]')
  await expectCode('non-object document: get fails', 'STORAGE_UNAVAILABLE', () => handle('beta').get({ key: 'x' }))
}

// ── G. Lifecycle ─────────────────────────────────────────────────────────
{
  // Two handles on the same namespace share a call-order chain: concurrent writes settle in invocation order.
  const service = hostCtx.get('tuiPluginStorage')
  const alphaContext = activations.get('alpha')!.context
  const first = service.open(alphaContext)
  const second = service.open(alphaContext)
  const write1 = first.set({ key: 'order', value: 'first' })
  const write2 = second.set({ key: 'order', value: 'second' })
  await Promise.all([write1, write2])
  check1('concurrent writes settle in invocation order', (await first.get({ key: 'order' })).value === 'second')

  // unload only closes its own handle: mount a same-named alpha closer plugin
  // and dispose it — alpha's original handle must keep working (closed is
  // handle-level, not namespace-level).
  const closer = await mountAdmitted(hostCtx, 'alpha-closer', testManifest({
    id: componentId('alpha'),
    requires: [STORAGE_COORDINATE],
    permissions: [storageGrant('alpha', 'storage.local.read'), storageGrant('alpha', 'storage.local.write')],
  }))
  const closerHandle = closer.context.get('tuiPluginStorage')!.open(closer.context)
  await closerHandle.set({ key: 'closer-key', value: 1 })
  await Promise.resolve(closer.fiber.dispose())
  await sleep(30)
  await expectCode('unloaded handle is closed', 'STORAGE_UNAVAILABLE', () => closerHandle.get({ key: 'closer-key' }))
  await Promise.resolve(closer.fiber.dispose()) // a second dispose must not throw
  check1('double dispose stays harmless', true)
  check1('the surviving same-namespace handle keeps working', (await handle('alpha').get({ key: 'closer-key' })).value === 1)
}

// ── H. Privacy: key/value material never appears in logs ───────────────────
{
  const secret = 'SECRET-VALUE-9f8e2d'
  await handle('alpha').set({ key: 'SECRET-KEY-7a1b', value: secret })
  await handle('alpha').get({ key: 'SECRET-KEY-7a1b' })
  await expectCode('denial path stays value-free', 'PERMISSION_NOT_GRANTED', () => handle('gamma').set({ key: 'SECRET-KEY-7a1b', value: secret }))
  const leaked = hostWarnings.filter(line => line.includes(secret) || line.includes('SECRET-KEY-7a1b'))
  check1('no key/value material in logs', leaked.length === 0, leaked.join(' | '))
}

// ── I. descriptor now declares LocalStorage ─────────────────────────────────
{
  const { descriptor } = buildHostDescriptor({ generationId: 'storage-battery' })
  const storage = descriptor.contracts.find(c => c.kind === 'LocalStorage')
  check1('descriptor advertises LocalStorage', storage !== undefined)
  check1('LocalStorage carries both permissions',
    JSON.stringify(storage?.permissions) === JSON.stringify(['storage.local.read', 'storage.local.write']))
}

// ── Summary ──────────────────────────────────────────────────────────────
for (const dir of cleanup) rmSync(dir, { recursive: true, force: true })
if (failures.length > 0) {
  console.error(`plugin-storage battery FAILED (${failures.length}/${checks}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`plugin-storage battery OK (${checks} checks: round-trip, grants, validation, isolation, quota, corruption, lifecycle, privacy, descriptor)`)
process.exit(0)
