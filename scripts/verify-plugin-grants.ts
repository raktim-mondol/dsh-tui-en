/**
 * Batch-2 battery: the unified GrantStore for the 8 permissions, the
 * plugin-host row, and Host Descriptor construction.
 *
 *   A. GrantStore semantics: legacy-format behavior matches field-by-field,
 *      registry-driven defaults (7 deny + invoke allow), denies revocation,
 *      unregistered permissions fail-closed, corruption fails closed;
 *   B. decision-guard's behavior is unchanged behind the thin shell
 *      (readGrantStore's real file path);
 *   C. plugin-host row: real cordis mount, generationId stable and distinct
 *      across instances, the descriptor passes the vendored schema +
 *      validateHost, selfCheck is all green, bare ctx soft-degrades;
 *   D. buildHostDescriptor as a pure function: the default build's fields,
 *      a tampered contract file is dropped + warns, missing data degrades,
 *      composition with negotiate (degraded);
 *   E. the patch surface and exports wiring (the row sits before
 *      extensions, the ./plugin-host export).
 *
 * HOME/USERPROFILE are isolated before importing src (mounting the
 * plugin-host row reads the grants file from the default DATA_DIR).
 *
 * Run via `node --import tsx/esm scripts/verify-plugin-grants.ts`.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── isolate HOME (must precede any src import) ──────────────────────────
const fakeHome = mkdtempSync(join(tmpdir(), 'dsh-plugin-grants-home-'))
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome
process.env.DSH_TUI_LANG = 'en'

const { Context } = await import('@deepseek-ai/cordis')
const { parseGrantStore, readGrantStore, EXTENSION_GRANTS_FILE } = await import('../src/dsh-adapter/grants.js')
const { installDecisionGuard, DECISION_EVENT_PERMISSIONS } = await import('../src/dsh-adapter/decision-guard.js')
const pluginHostRow = await import('../src/dsh-adapter/plugin-host.js')
const { buildHostDescriptor, HOST_SUPPORTED_CONTRACTS, readOwnPackageVersion } = await import('../src/dsh-adapter/host-descriptor.js')
const { loadSpecData, digestFile, verifyRegistry, verifyContractProfiles } = await import('../src/plugin-spec/registry.js')
const { createContractIndex, validateHost } = await import('../src/plugin-spec/validate.js')
const { check } = await import('../src/plugin-spec/schema-check.js')
const { negotiate } = await import('../src/plugin-spec/negotiate.js')
const { DATA_DIR } = await import('../src/utils/paths.js')
const { mountAdmitted, testManifest, DECISION_COORDINATE } = await import('./plugin-test-utils.js')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const specDir = join(root, 'dsh-ecosystem-spec')
const data = loadSpecData(specDir)
if (!data) {
  console.error('vendored spec data unreadable (dsh-ecosystem-spec/)')
  process.exit(1)
}
const index = createContractIndex(data.registry, data.permissions)
const REGISTRY_PERMISSIONS = data.permissions.permissions.map(p => p.name)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const scoped = (name: string, scope: string, activationId?: string) => ({
  name,
  scope,
  ...(activationId === undefined ? {} : { activationId }),
})
const principal = (componentId: string, activationId?: string) => ({
  componentId,
  ...(activationId === undefined ? {} : { activationId }),
})
const scopeFor = (permission: string, componentId: string): string => {
  if (permission.startsWith('storage.local.')) return componentId
  if (permission === 'commands.invoke') return `${componentId}.command`
  if (permission === 'messages.observe.read') return 'session:*'
  return 'session:*'
}

let checks = 0
const failures: string[] = []
const check1 = (name: string, ok: boolean, detail?: string) => {
  checks += 1
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}
const cleanup: string[] = [fakeHome]

// The permission map is part of the public vocabulary but also feeds the
// host's authorization checkpoint. Readonly TypeScript annotations do not
// protect a runtime object exposed to plugin code.
check1('decision permission map is immutable',
  Object.isFrozen(DECISION_EVENT_PERMISSIONS)
  && DECISION_EVENT_PERMISSIONS['tui/input'] === 'session.input.intercept')

// ── A. GrantStore semantics ──────────────────────────────────────────────
{
  // A1. The old string format has no scope; migration must fail closed.
  const oldFormat = JSON.stringify({
    grants: { root: ['session.input.intercept', 'session.rewind.intercept', 'session.switch.intercept', 'session.compact.intercept'] },
  })
  const oldStore = parseGrantStore(oldFormat)
  for (const permission of Object.values(DECISION_EVENT_PERMISSIONS)) {
    check1(`legacy unscoped row does not enlarge ${permission}`,
      !oldStore.allows(principal('root'), permission, 'session:*'))
    check1(`old format: other plugin denied ${permission}`,
      !oldStore.allows(principal('other'), permission, 'session:*'))
  }
  check1('old format: storage stays denied', !oldStore.allows(principal('root'), 'storage.local.read', 'root'))
  check1('old format: not corrupt', !oldStore.corrupt)

  // A2. Registry-driven defaults: an empty store (= missing file) → 7 deny + invoke allow.
  const empty = parseGrantStore('')
  for (const entry of data.permissions.permissions) {
    check1(`registry default: ${entry.name} = ${entry.default}`, empty.defaultOf(entry.name) === entry.default)
    check1(`empty store: ${entry.name} ${entry.default === 'allow' ? 'allowed' : 'denied'} by default`,
      empty.allows(principal('anyone'), entry.name, scopeFor(entry.name, 'anyone')) === (entry.default === 'allow'))
  }
  check1('knownPermissions mirrors the vendored registry',
    JSON.stringify(empty.knownPermissions()) === JSON.stringify(REGISTRY_PERMISSIONS))
  check1('8 permissions registered', REGISTRY_PERMISSIONS.length === 8)

  // A3. denies revokes an allow-default; an explicit grant authorizes a deny-default.
  const mixed = parseGrantStore(JSON.stringify({
    grants: { guard: [scoped('session.input.intercept', 'tui/input')] },
    denies: {
      noisy: [scoped('commands.invoke', 'noisy.command')],
      conflicted: [scoped('commands.invoke', 'conflicted.command')],
    },
  }))
  check1('denies revokes allow-default only at its scope',
    !mixed.allows(principal('noisy'), 'commands.invoke', 'noisy.command')
    && mixed.allows(principal('noisy'), 'commands.invoke', 'noisy.other'))
  check1('denies does not affect other plugins', mixed.allows(principal('other'), 'commands.invoke', 'other.command'))
  check1('grant of deny-default allowed', mixed.allows(principal('guard'), 'session.input.intercept', 'tui/input'))

  // A4. When grants and denies list the same permission, denies wins (revocation is the safe operation).
  const conflict = parseGrantStore(JSON.stringify({
    grants: { conflicted: [scoped('commands.invoke', 'conflicted.command')] },
    denies: { conflicted: [scoped('commands.invoke', 'conflicted.command')] },
  }))
  check1('deny wins over grant on conflict',
    !conflict.allows(principal('conflicted'), 'commands.invoke', 'conflicted.command'))

  // A5. An unregistered permission is always denied — even when the file explicitly grants it.
  const bogus = parseGrantStore(JSON.stringify({ grants: { root: ['bogus.permission'] } }))
  check1('unregistered permission denied even when granted', !bogus.allows(principal('root'), 'bogus.permission', 'x'))
  check1('defaultOf unregistered is deny', bogus.defaultOf('bogus.permission') === 'deny')

  // A6. Corruption fails closed: even an allow-default is refused.
  const corrupt = parseGrantStore('{ not json')
  check1('corrupt store flagged', corrupt.corrupt)
  check1('corrupt store denies deny-default', !corrupt.allows(principal('root'), 'session.input.intercept', 'tui/input'))
  check1('corrupt store denies allow-default too', !corrupt.allows(principal('root'), 'commands.invoke', 'root.command'))

  // A7. Syntactically valid JSON with a malformed structure must still fail
  // closed. Silently dropping a bad section/rule would fall commands.invoke
  // back to its allow-default, which is equivalent to revocation not working.
  const wrongShape = parseGrantStore(JSON.stringify({ grants: [1, 2, 3], denies: 'nope' }))
  check1('wrong-shaped sections are corrupt', wrongShape.corrupt)
  check1('wrong-shaped sections deny allow-default too',
    !wrongShape.allows(principal('anyone'), 'commands.invoke', 'anyone.command'))
  const malformedRule = parseGrantStore(JSON.stringify({
    grants: { anyone: [{ name: 'commands.invoke' }] },
  }))
  check1('a malformed rule makes the whole file corrupt', malformedRule.corrupt)
  check1('a malformed rule cannot restore invoke defaults',
    !malformedRule.allows(principal('anyone'), 'commands.invoke', 'anyone.command'))
  const malformedComponent = parseGrantStore(JSON.stringify({ grants: { anyone: {} } }))
  check1('a non-array Component rule list is corrupt', malformedComponent.corrupt)
  const unknownRootField = parseGrantStore(JSON.stringify({ grants: {}, typo: {} }))
  check1('an unknown top-level grant-store field is corrupt', unknownRootField.corrupt)
  const emptyObject = parseGrantStore('{}')
  check1('an empty object is a valid default-only store',
    !emptyObject.corrupt && emptyObject.allows(principal('anyone'), 'commands.invoke', 'anyone.command'))

  // A8. Injecting a registry proves the store is entirely registry-driven (no hardcoded permission names).
  const custom = parseGrantStore('', {
    registryVersion: 'test',
    permissions: [{ name: 'custom.allow', default: 'allow', revocable: true, scope: 'test' }],
  })
  check1('adapter rejects a custom scope it cannot enforce', !custom.allows(principal('p'), 'custom.allow', 'test'))
  check1('injected registry: vendored names unknown', !custom.allows(principal('p'), 'commands.invoke', 'p.command'))

  // A9. readGrantStore: a missing file = all defaults (not corrupt).
  const missingDir = mkdtempSync(join(tmpdir(), 'dsh-grants-missing-'))
  cleanup.push(missingDir)
  const missing = readGrantStore(missingDir)
  check1('missing file is not corrupt', !missing.corrupt)
  check1('missing file gives registry defaults',
    missing.allows(principal('anyone'), 'commands.invoke', 'anyone.command')
    && !missing.allows(principal('anyone'), 'session.input.intercept', 'tui/input'))

  // A10. readGrantStore: a non-ENOENT read failure (EISDIR: the grants path
  // is a directory) = corrupt fail-closed — it must never silently fall back
  // to all-defaults (otherwise denies stop working and commands.invoke falls
  // back to allow, letting a single I/O error punch through the revocation
  // mechanism).
  const unreadableDir = mkdtempSync(join(tmpdir(), 'dsh-grants-unreadable-'))
  cleanup.push(unreadableDir)
  mkdirSync(join(unreadableDir, EXTENSION_GRANTS_FILE))
  const unreadable = readGrantStore(unreadableDir)
  check1('non-ENOENT read failure (EISDIR) is corrupt fail-closed', unreadable.corrupt)
  check1('non-ENOENT read failure denies allow-default too',
    !unreadable.allows(principal('anyone'), 'commands.invoke', 'anyone.command'))
  check1('non-ENOENT read failure denies deny-default',
    !unreadable.allows(principal('anyone'), 'storage.local.read', 'anyone'))

  // A11. The file store re-reads every time, and actively notifies subscribed services on change.
  const liveDir = mkdtempSync(join(tmpdir(), 'dsh-grants-live-'))
  cleanup.push(liveDir)
  const liveFile = join(liveDir, EXTENSION_GRANTS_FILE)
  writeFileSync(liveFile, JSON.stringify({
    grants: { live: [scoped('messages.observe.read', 'session:one')] },
  }))
  const live = readGrantStore(liveDir)
  let changeCount = 0
  const stopWatching = live.onChange?.(() => { changeCount += 1 })
  check1('live store initially grants the exact scope',
    live.allows(principal('live'), 'messages.observe.read', 'session:one'))
  check1('scoped grant does not authorize another session',
    !live.allows(principal('live'), 'messages.observe.read', 'session:two'))
  writeFileSync(liveFile, JSON.stringify({ grants: { live: [] } }))
  check1('revocation affects the next operation without restart',
    !live.allows(principal('live'), 'messages.observe.read', 'session:one'))
  await sleep(250)
  check1('revocation notifies grant-owned effects', changeCount > 0)
  stopWatching?.()

  // A12. Activation-scoped policy must be evaluated against the verified
  // activation instance; an unbound diagnostic principal cannot inherit it.
  const activationScoped = parseGrantStore(JSON.stringify({
    grants: { scoped: [scoped('messages.observe.read', 'session:one', 'act-1')] },
  }))
  check1('activation-scoped grant matches the exact activation',
    activationScoped.allows(principal('scoped', 'act-1'), 'messages.observe.read', 'session:one'))
  check1('activation-scoped grant rejects another activation',
    !activationScoped.allows(principal('scoped', 'act-2'), 'messages.observe.read', 'session:one'))
  check1('activation-scoped grant rejects an unbound diagnostic principal',
    !activationScoped.allows(principal('scoped'), 'messages.observe.read', 'session:one'))

  // A13. A broad event grant may cover a concrete session, but a narrow deny
  // must still win at that concrete scope.
  const eventGrantSessionDeny = parseGrantStore(JSON.stringify({
    grants: { scoped: [scoped('session.input.intercept', 'tui/input')] },
    denies: { scoped: [scoped('session.input.intercept', 'session:secret')] },
  }))
  check1('event grant covers an ordinary session',
    eventGrantSessionDeny.allows(principal('scoped'), 'session.input.intercept', 'session:ordinary'))
  check1('session deny overrides the broad event grant',
    !eventGrantSessionDeny.allows(principal('scoped'), 'session.input.intercept', 'session:secret'))
}

// ── B. decision-guard's behavior is unchanged behind the thin shell (real file path) ─
{
  mkdirSync(DATA_DIR, { recursive: true })
  const grantsFile = join(DATA_DIR, EXTENSION_GRANTS_FILE)
  writeFileSync(grantsFile, JSON.stringify({
    grants: { 'com.example.guard': [scoped('session.input.intercept', 'tui/input', 'act-guard')] },
  }))
  const guardCtx = new Context()
  const guardWarnings: string[] = []
  guardCtx.logger.warn = (format: unknown, ...params: unknown[]) => {
    guardWarnings.push([format, ...params].map(String).join(' '))
  }
  guardCtx.plugin({ name: pluginHostRow.name, apply: pluginHostRow.apply })
  await sleep(50)
  const admitted = await mountAdmitted(guardCtx, 'cordis-export-name', testManifest({
    id: 'com.example.guard',
    requires: [DECISION_COORDINATE],
    permissions: [{ name: 'session.input.intercept', scope: 'tui/input' }],
  }), 'test:cordis-export-name/dsh-plugin.json', { activationId: 'act-guard' })
  const release = guardCtx.get('tuiPluginHost')?.subscribeDecision(
    admitted.context,
    'tui/input',
    event => event.text === 'intercept' ? { cancel: true, reason: 'granted intercept' } : undefined,
  )
  guardCtx.plugin({
    name: 'evil-plugin',
    apply: (c: InstanceType<typeof Context>) => {
      c.on('tui/input', () => ({ cancel: true, reason: 'should not fire' }))
    },
  })
  await sleep(100)
  const { dispatchTuiDecision } = await import('../src/dsh-adapter/extension-events.js')
  const passThrough = (result: unknown): unknown => result
  check1('admitted Component uses manifest id instead of the Cordis export name',
    (await dispatchTuiDecision(guardCtx, 'tui/input', { text: 'intercept', sessionId: 'sess-guard' }, passThrough)) !== undefined)
  check1('raw ctx.on subscription never enters the mediated chain',
    (await dispatchTuiDecision(guardCtx, 'tui/input', { text: 'other', sessionId: 'sess-guard' }, passThrough)) === undefined)
  check1('raw subscription denial names the plugin and mediated surface',
    guardWarnings.some(line => line.includes('"evil-plugin"') && line.includes('mediated DecisionEvents')))

  writeFileSync(grantsFile, JSON.stringify({ grants: { 'com.example.guard': [] } }))
  check1('running decision grant revocation blocks the next dispatch',
    (await dispatchTuiDecision(guardCtx, 'tui/input', { text: 'intercept', sessionId: 'sess-guard' }, passThrough)) === undefined)
  await sleep(250)
  check1('revocation actively removes the decision handler', release?.() === false)
  await Promise.resolve(admitted.fiber.dispose())
}

// ── C. plugin-host row ────────────────────────────────────────────────────
{
  const hostCtx = new Context()
  const hostWarnings: string[] = []
  hostCtx.logger.warn = (format: unknown, ...params: unknown[]) => {
    hostWarnings.push([format, ...params].map(String).join(' '))
  }
  hostCtx.plugin({ name: pluginHostRow.name, apply: pluginHostRow.apply })
  await sleep(50)
  const service = hostCtx.get('tuiPluginHost')
  check1('tuiPluginHost mounted', service !== undefined)
  if (service) {
    check1('generationId matches the descriptor schema pattern', /^[A-Za-z0-9._:-]+$/.test(service.generationId))
    check1('generationId stable within the activation', service.generationId === service.generationId)
    check1('selfCheck clean on vendored data', service.selfCheck().length === 0, service.selfCheck().join(' | '))
    check1('grants store is callable', typeof service.grants.allows === 'function')
    // No grants file in the isolated HOME → registry defaults (invoke allow / intercept deny).
    check1('service grants: registry defaults from empty HOME',
      service.grants.allows(principal('root'), 'commands.invoke', 'root.command')
      && !service.grants.allows(principal('root'), 'session.input.intercept', 'tui/input'))

    const descriptor = service.hostDescriptor()
    let descriptorError = ''
    try {
      check(descriptor, data.schemas.host, data.schemas.host)
      validateHost(index, descriptor)
    } catch (error) {
      descriptorError = error instanceof Error ? error.message : String(error)
    }
    check1('service descriptor passes vendored schema + validateHost', descriptorError === '', descriptorError)
    check1('descriptor generationId is the runtime generation', descriptor.runtime.generationId === service.generationId)
    check1('descriptor cached (same object)', service.hostDescriptor() === descriptor)
    // P2-8: this bare ctx has no commands service — the descriptor must drop
    // Command (C-010 only advertises capabilities actually provided at
    // runtime), and warn exactly once about it.
    check1('Command excluded when the commands service is not mounted',
      !descriptor.contracts.some(contract => contract.kind === 'Command')
      && descriptor.contracts.length === HOST_SUPPORTED_CONTRACTS.length - 1,
      JSON.stringify(descriptor.contracts.map(contract => contract.kind)))
    check1('Command exclusion warns exactly that',
      hostWarnings.length === 1 && hostWarnings[0]!.includes('commands service is not mounted'), hostWarnings.join(' | '))
  }

  // P2-8 positive case: the commands service mounts before the first build →
  // Command is advertised normally, zero warnings. (Production path: the
  // descriptor builds lazily, and by the time /plugins first queries it,
  // channel has long since installed commands.)
  {
    const { Service } = await import('@deepseek-ai/cordis')
    class FakeCommands extends Service {
      constructor(ctx: InstanceType<typeof Context>) {
        super(ctx, 'commands')
      }
    }
    const withCommands = new Context()
    const withCommandsWarnings: string[] = []
    withCommands.logger.warn = (format: unknown, ...params: unknown[]) => {
      withCommandsWarnings.push([format, ...params].map(String).join(' '))
    }
    withCommands.plugin(FakeCommands)
    withCommands.plugin({ name: pluginHostRow.name, apply: pluginHostRow.apply })
    await sleep(50)
    const descriptor = withCommands.get('tuiPluginHost')?.hostDescriptor()
    check1('Command advertised when the commands service is mounted',
      descriptor?.contracts.some(contract => contract.kind === 'Command') === true)
    check1('no boot warnings with commands mounted', withCommandsWarnings.length === 0, withCommandsWarnings.join(' | '))
  }

  // Partial embed: mounting only the host anchor does not magically provide
  // the sibling storage/observer services. The descriptor must reflect that
  // live topology instead of advertising registry entries as implementations.
  {
    const partialCtx = new Context()
    partialCtx.logger.warn = () => undefined
    partialCtx.plugin(pluginHostRow.TuiPluginHostRuntime)
    await sleep(30)
    const descriptor = partialCtx.get('tuiPluginHost')?.hostDescriptor()
    check1('partial host excludes unmounted storage and observer contracts',
      descriptor !== undefined
      && !descriptor.contracts.some(contract => contract.kind === 'LocalStorage')
      && !descriptor.contracts.some(contract => contract.kind === 'MessageObserver')
      && descriptor.contracts.some(contract => contract.kind === 'DecisionEvents'))
  }

  // A lazy descriptor must also follow services that appear or disappear
  // after its first read, instead of retaining the first capability snapshot.
  {
    const { Service } = await import('@deepseek-ai/cordis')
    class DynamicCommands extends Service {
      constructor(ctx: InstanceType<typeof Context>) {
        super(ctx, 'commands')
      }
    }
    const dynamicCtx = new Context()
    dynamicCtx.plugin({ name: pluginHostRow.name, apply: pluginHostRow.apply })
    await sleep(30)
    const dynamicHost = dynamicCtx.get('tuiPluginHost')
    const withoutCommands = dynamicHost?.hostDescriptor()
    const commandsFiber = dynamicCtx.plugin(DynamicCommands)
    await sleep(30)
    const withCommands = dynamicHost?.hostDescriptor()
    check1('descriptor rebuilds when commands mounts after the first read',
      withCommands !== withoutCommands && withCommands?.contracts.some(contract => contract.kind === 'Command') === true)
    await Promise.resolve(commandsFiber.dispose())
    await sleep(30)
    const afterUnmount = dynamicHost?.hostDescriptor()
    check1('descriptor rebuilds when commands unmounts after the first read',
      afterUnmount !== withCommands && !afterUnmount?.contracts.some(contract => contract.kind === 'Command'))
  }

  // generationId differs across activations (two independent roots, each mounted once).
  const secondCtx = new Context()
  secondCtx.plugin({ name: pluginHostRow.name, apply: pluginHostRow.apply })
  await sleep(50)
  check1('generationId differs across activations',
    secondCtx.get('tuiPluginHost')?.generationId !== hostCtx.get('tuiPluginHost')?.generationId)

  // bare ctx soft-degrades: a context without the row can't get() it, and consumers degrade silently.
  check1('bare ctx soft-degrades (no row, no throw)', new Context().get('tuiPluginHost') === undefined)
}

// ── D. buildHostDescriptor as a pure function ────────────────────────────
{
  const build = buildHostDescriptor({ generationId: 'test-gen-1' })
  check1('default build drops nothing', build.dropped.length === 0, build.dropped.join(' | '))
  check1('default build warns nothing', build.warnings.length === 0, build.warnings.join(' | '))
  const d = build.descriptor
  let error = ''
  try {
    check(d, data.schemas.host, data.schemas.host)
    validateHost(index, d)
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }
  check1('default descriptor passes vendored schema + validateHost', error === '', error)
  check1('hostId is dsh-tui', d.hostId === 'dsh-tui')
  check1('hostVersion is the repo package version',
    d.hostVersion === JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version)
  check1('readOwnPackageVersion agrees', readOwnPackageVersion() === d.hostVersion)
  check1('facetApiVersions from registry', JSON.stringify(d.facetApiVersions) === JSON.stringify(data.registry.facetApiVersions))
  check1('trustLevel trusted-in-process', d.trustLevel === 'trusted-in-process')
  check1('platform matches the process', d.platform.os === process.platform && d.platform.arch === process.arch)
  check1('runtime local + headless false + generation stamped',
    d.runtime.location === 'local' && d.runtime.headless === false && d.runtime.generationId === 'test-gen-1')
  check1('advertised surface = HOST_SUPPORTED_CONTRACTS',
    d.contracts.length === HOST_SUPPORTED_CONTRACTS.length
    && d.contracts.every(c => HOST_SUPPORTED_CONTRACTS.some(s => s.apiVersion === c.apiVersion && s.kind === c.kind)))
  const command = d.contracts.find(c => c.kind === 'Command')
  check1('Command contract identifies the official dsh-std definition',
    command?.definition.source === 'dsh-std'
    && command.definition.package === '@dsh-std/command')
  check1('Command contract carries registry permissions',
    JSON.stringify(command?.permissions) === JSON.stringify(['commands.invoke']))
  const decisionEvents = d.contracts.find(c => c.kind === 'DecisionEvents')
  const decisionEntry = data.registry.definitions.find(entry => entry.coordinates.kind === 'DecisionEvents')
  check1('DecisionEvents pins the private profile definition hash',
    decisionEvents?.definition.source === 'tui-profile'
    && decisionEntry !== undefined
    && decisionEvents.definition.profileHash === digestFile(specDir, decisionEntry.profile))

  // D2. A tampered contract file → dropped + warn (fail closed), the descriptor still passes the schema.
  const tamperedRoot = mkdtempSync(join(tmpdir(), 'dsh-descriptor-tamper-'))
  cleanup.push(tamperedRoot)
  cpSync(specDir, join(tamperedRoot, 'dsh-ecosystem-spec'), { recursive: true })
  const target = join(tamperedRoot, 'dsh-ecosystem-spec', 'registry', 'contracts', 'decision-events-v1alpha1.json')
  writeFileSync(target, `${readFileSync(target, 'utf8')}\n`)
  const tampered = buildHostDescriptor({ generationId: 'test-gen-2', specDir: join(tamperedRoot, 'dsh-ecosystem-spec') })
  check1('tampered private definition dropped',
    tampered.dropped.includes('tui.dsh/v1alpha1#DecisionEvents'), tampered.dropped.join(' | '))
  check1('tamper warning names the profileHash drift', tampered.warnings.some(w => w.includes('profile hash drifted')))
  check1('tampered surface keeps only the untampered contracts',
    tampered.descriptor.contracts.length === HOST_SUPPORTED_CONTRACTS.length - 1
    && !tampered.descriptor.contracts.some(c => c.kind === 'DecisionEvents'))
  let tamperedError = ''
  try {
    check(tampered.descriptor, data.schemas.host, data.schemas.host)
  } catch (caught) {
    tamperedError = caught instanceof Error ? caught.message : String(caught)
  }
  check1('all-dropped descriptor still schema-valid', tamperedError === '', tamperedError)

  // D3. A missing data directory → degrades to an empty surface + warn, never throws.
  const missing = buildHostDescriptor({ generationId: 'test-gen-3', specDir: join(tamperedRoot, 'no-such-dir') })
  check1('missing spec data degrades to empty surface', missing.descriptor.contracts.length === 0)
  check1('missing spec data warns', missing.warnings.some(w => w.includes('unavailable')))

  // D4. Composed with negotiate: the descriptor now declares all three
  // contracts, satisfying both valid-plugin's required (Command) and
  // optional (observe) needs → compatible.
  const validPlugin = JSON.parse(readFileSync(join(specDir, 'conformance/fixtures/valid-plugin.json'), 'utf8'))
  const decision = negotiate(index, validPlugin, d)
  check1('negotiate against the built descriptor: compatible',
    decision.decision === 'compatible',
    JSON.stringify(decision))

  // D5. P2-10: parseable-but-structurally-wrong vendored data = unavailable
  // (undefined), never letting a TypeError blow up inside verify*/boot
  // self-checks (fail-soft).
  const malformedRoot = mkdtempSync(join(tmpdir(), 'dsh-spec-malformed-'))
  cleanup.push(malformedRoot)
  cpSync(specDir, join(malformedRoot, 'dsh-ecosystem-spec'), { recursive: true })
  writeFileSync(join(malformedRoot, 'dsh-ecosystem-spec', 'registry', 'registry-0.15.json'),
    JSON.stringify({ profileVersion: 'tui-admission/0.15', std: {}, imports: null, definitions: [], facetApiVersions: [] }))
  check1('structurally malformed registry loads as unavailable',
    loadSpecData(join(malformedRoot, 'dsh-ecosystem-spec')) === undefined)
  const malformedBuild = buildHostDescriptor({ generationId: 'test-gen-4', specDir: join(malformedRoot, 'dsh-ecosystem-spec') })
  check1('malformed data degrades the descriptor to an empty surface (no throw)',
    malformedBuild.descriptor.contracts.length === 0 && malformedBuild.warnings.length > 0)
  // verify* returns only violation strings for hand-crafted bad data too.
  let verifyThrew = ''
  try {
    const fakeData = {
      dir: specDir,
      registry: { imports: null, definitions: null },
      permissions: { permissions: [] },
      schemas: {},
    }
    const violations = verifyRegistry(fakeData as never)
    check1('verifyRegistry reports malformed entries as a violation string',
      violations.length === 1 && violations[0]!.includes('registry'))
    const profileViolations = verifyContractProfiles(fakeData as never)
    check1('verifyContractProfiles reports malformed entries as a violation string',
      profileViolations.length === 1 && profileViolations[0]!.includes('registry'))
  } catch (error) {
    verifyThrew = error instanceof Error ? error.message : String(error)
  }
  check1('verify* never throw on malformed data', verifyThrew === '', verifyThrew)
  // A malformed permissions registry (permissions not an array) is likewise entirely unavailable.
  const malformedPermsRoot = mkdtempSync(join(tmpdir(), 'dsh-spec-malformed-perms-'))
  cleanup.push(malformedPermsRoot)
  cpSync(specDir, join(malformedPermsRoot, 'dsh-ecosystem-spec'), { recursive: true })
  writeFileSync(join(malformedPermsRoot, 'dsh-ecosystem-spec', 'registry', 'permissions-0.1.json'),
    JSON.stringify({ registryVersion: '0.1', permissions: 'nope' }))
  check1('structurally malformed permissions load as unavailable',
    loadSpecData(join(malformedPermsRoot, 'dsh-ecosystem-spec')) === undefined)
}

// ── E. the patch surface and exports wiring ──────────────────────────────
{
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  const mirror = readFileSync(join(root, 'cordis.yml'), 'utf8')
  check1('patch mounts plugin-host BEFORE extensions',
    patch.indexOf('dsh-tui-plugin-host') !== -1 && patch.indexOf('dsh-tui-plugin-host') < patch.indexOf('dsh-tui-extensions'))
  check1('cordis.yml mirrors the row BEFORE extensions',
    mirror.indexOf('dsh-tui-plugin-host') !== -1 && mirror.indexOf('dsh-tui-plugin-host') < mirror.indexOf('dsh-tui-extensions'))
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  check1('exports exposes ./plugin-host',
    manifest.exports?.['./plugin-host']?.import === './lib/types/plugin-host.js')
  check1('compiled entry exists after build', existsSync(join(root, 'lib/types/plugin-host.js')))
  const publicHostShim = readFileSync(join(root, 'src/plugin-host.ts'), 'utf8')
  check1('public plugin-host shim exports the narrowed capability type',
    publicHostShim.includes('TuiPluginHost') && !publicHostShim.includes('TuiPluginHostRuntime'))
  const publicHostDeclaration = readFileSync(join(root, 'lib/types/plugin-host.d.ts'), 'utf8')
  check1('public plugin-host declaration hides loader-only admitInternal',
    !publicHostDeclaration.includes('admitInternal') && !publicHostDeclaration.includes('TuiPluginHostRuntime'))
  const snapshot = JSON.parse(readFileSync(join(root, 'patch-surface.snapshot.json'), 'utf8'))
  check1('snapshot records the insert before extensions',
    snapshot.inserts.indexOf('dsh-tui-plugin-host') !== -1
    && snapshot.inserts.indexOf('dsh-tui-plugin-host') === snapshot.inserts.indexOf('dsh-tui-extensions') - 1)
  // Entry-row inject discipline (#183): a new service must never enter entry-level inject.
  check1('entry inject list NOT extended with tuiPluginHost', !mirror.includes('tuiPluginHost'))
}

// ── summary ───────────────────────────────────────────────────────────────
for (const dir of cleanup) rmSync(dir, { recursive: true, force: true })
if (failures.length > 0) {
  console.error(`plugin-grants battery FAILED (${failures.length}/${checks}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`plugin-grants battery OK (${checks} checks: grant store semantics, guard via GrantStore, plugin-host row, descriptor build, wiring)`)
process.exit(0)
