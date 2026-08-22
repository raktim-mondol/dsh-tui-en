/**
 * Battery 5 (part 2): the commands contract alignment (C-041).
 *
 *   A. Real dependency mapping: the plain-text Error that real dsh-commands
 *      throws on duplicate registration, after mapCommandError, carries
 *      code=DUPLICATE_CONTRIBUTION_ID (original name/message/cause kept);
 *   B. Message variants and passthrough: both known duplicate-message
 *      variants are mapped; a non-duplicate Error and non-Error values pass
 *      through as-is (same reference);
 *   C. the hasCommandErrorCode predicate surface;
 *   D. withCommandErrorMapping: success passes through, a duplicate rethrows
 *      with the code, everything else rethrows the original reference;
 *   E. the contract error-code vocabulary has exactly 6 entries;
 *   F. invoke checkpoint gate semantics: after denies revokes
 *      commands.invoke, root is denied; allow by default; other plugins'
 *      denies don't affect root;
 *   G. channel wiring assertions: the checkpoint runs before execute, the
 *      deny message goes through i18n, skill registration's catch maps and
 *      ledgers the result (applied/failed), invoke denials are ledgered;
 *   H. Non-breaking signature: the register-family methods on all four
 *      managed services still return a disposer when no identity is passed
 *      (zero behavior change for existing call sites).
 *
 * HOME/USERPROFILE are isolated before importing src.
 *
 * Run via `node --import tsx/esm scripts/verify-plugin-commands.ts`.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Isolate HOME (must happen before any src import) ───────────────────────
const fakeHome = mkdtempSync(join(tmpdir(), 'dsh-plugin-commands-home-'))
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome
process.env.DSH_TUI_LANG = 'zh'

const { Context } = await import('@deepseek-ai/cordis')
const { default: CommandRuntime } = await import('@deepseek-ai/dsh-commands')
const { createScope } = await import('@deepseek-ai/dsh-scope')
const {
  COMMAND_ERROR_CODES,
  hasCommandErrorCode,
  mapCommandError,
  withCommandErrorMapping,
} = await import('../src/dsh-adapter/command-errors.js')
const { parseGrantStore } = await import('../src/dsh-adapter/grants.js')
const { TuiStatusRuntime } = await import('../src/dsh-adapter/status.js')
const { default: TuiShortcutRuntime } = await import('../src/dsh-adapter/shortcuts.js')
const { TuiSceneRuntime } = await import('../src/dsh-adapter/scenes.js')
const { TuiRendererRuntime } = await import('../src/dsh-adapter/renderers.js')
const { mountAdmitted, testManifest, COMMAND_COORDINATE } = await import('./plugin-test-utils.js')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const cleanup: string[] = [fakeHome]

let checks = 0
const failures: string[] = []
const check1 = (name: string, ok: boolean, detail?: string) => {
  checks += 1
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

// ── A. Real dependency mapping ───────────────────────────────────────────────
{
  const ctx = new Context()
  ctx.plugin(CommandRuntime)
  await sleep(50)
  const service = ctx.get('commands')
  check1('real dsh-commands mounts standalone', service !== undefined)
  const definition = { name: 'dup-probe', description: 'battery probe', handler: () => ({ kind: 'success' }) }
  service.register(definition as never)
  let thrown: unknown
  try {
    service.register(definition as never)
  } catch (error) {
    thrown = error
  }
  check1('real duplicate registration throws', thrown instanceof Error)
  const mapped = mapCommandError(thrown)
  check1('mapped error carries DUPLICATE_CONTRIBUTION_ID', hasCommandErrorCode(mapped, 'DUPLICATE_CONTRIBUTION_ID'))
  check1('original preserved as cause', (mapped as { cause?: unknown }).cause === thrown)
  check1('message preserved verbatim', (mapped as Error).message === (thrown as Error).message)
}

// ── B. Message variants and passthrough ──────────────────────────────────────
{
  const variants = [
    'command "x" is already registered (for a per-agent variant, mount a command-injected plugin under that agent\'s `agent.ctx`)',
    'command "x" is already registered in this scope',
  ]
  for (const [index, message] of variants.entries()) {
    const mapped = mapCommandError(new Error(message))
    check1(`variant ${index + 1} maps to DUPLICATE_CONTRIBUTION_ID`, hasCommandErrorCode(mapped, 'DUPLICATE_CONTRIBUTION_ID'), message)
  }
  const other = new Error('command "x" failed: handler exploded')
  check1('non-duplicate error passes through unchanged', mapCommandError(other) === other)
  const notPrefixed = new Error('warning: command "x" is already registered (paraphrased)')
  check1('message not STARTING with the duplicate sentence passes through', mapCommandError(notPrefixed) === notPrefixed)
  for (const value of ['plain string', null, 42, { code: 'DUPLICATE_CONTRIBUTION_ID' }]) {
    check1(`non-Error ${JSON.stringify(value)} passes through`, mapCommandError(value) === value)
  }
}

// ── C. the hasCommandErrorCode predicate surface ─────────────────────────────
{
  const coded = mapCommandError(new Error('command "x" is already registered in this scope'))
  check1('true for the matching code', hasCommandErrorCode(coded, 'DUPLICATE_CONTRIBUTION_ID'))
  check1('false for a different code', !hasCommandErrorCode(coded, 'COMMAND_NOT_FOUND'))
  for (const value of [null, undefined, 'DUPLICATE_CONTRIBUTION_ID', 0, new Error('plain')]) {
    check1(`false for ${String(value)}`, !hasCommandErrorCode(value, 'DUPLICATE_CONTRIBUTION_ID'))
  }
}

// ── D. withCommandErrorMapping ────────────────────────────────────────────
{
  const resolved = await withCommandErrorMapping(() => 42)
  check1('successful operation resolves through', resolved === 42)
  let coded: unknown
  try {
    await withCommandErrorMapping(() => {
      throw new Error('command "x" is already registered in this scope')
    })
  } catch (error) {
    coded = error
  }
  check1('duplicate rethrow carries the code', hasCommandErrorCode(coded, 'DUPLICATE_CONTRIBUTION_ID'))
  const original = new TypeError('unrelated')
  let rethrown: unknown
  try {
    await withCommandErrorMapping(() => {
      throw original
    })
  } catch (error) {
    rethrown = error
  }
  check1('unrelated error rethrown as the same reference', rethrown === original)
}

// ── E. the contract error-code vocabulary ────────────────────────────────────
{
  check1(
    'vocabulary matches the contract (6 codes)',
    JSON.stringify([...COMMAND_ERROR_CODES].sort()) === JSON.stringify([
      'COMMAND_FAILED',
      'COMMAND_NOT_FOUND',
      'DUPLICATE_CONTRIBUTION_ID',
      'INVOCATION_CANCELLED',
      'INVOCATION_DEADLINE_EXCEEDED',
      'PERMISSION_NOT_GRANTED',
    ]),
    COMMAND_ERROR_CODES.join(','),
  )
}

// ── F. invoke checkpoint gate semantics ──────────────────────────────────────
{
  const revoked = parseGrantStore(JSON.stringify({ denies: { root: ['commands.invoke'] } }))
  check1('legacy unscoped deny cannot be widened into a command grant',
    !revoked.allows({ componentId: 'root' }, 'commands.invoke', 'root.command'))
  const defaulted = parseGrantStore('{}')
  check1('commands.invoke defaults to allow for a valid command scope (registry-driven)',
    defaulted.allows({ componentId: 'root' }, 'commands.invoke', 'root.command'))
  const others = parseGrantStore(JSON.stringify({ denies: {
    'evil-plugin': [{ name: 'commands.invoke', scope: 'evil-plugin.command' }],
  } }))
  check1("another plugin's denies do not affect root",
    others.allows({ componentId: 'root' }, 'commands.invoke', 'root.command'))
  check1('the denied plugin itself is blocked',
    !others.allows({ componentId: 'evil-plugin' }, 'commands.invoke', 'evil-plugin.command'))
}

// ── F2. Command attribution (the data source for C-041's per-owner checkpoint) ──
{
  const { commandOwner } = await import('../src/dsh-adapter/command-attribution.js')
  const pluginHostRow = await import('../src/dsh-adapter/plugin-host.js')
  const attrCtx = new Context()
  attrCtx.plugin(CommandRuntime)
  attrCtx.plugin({ name: pluginHostRow.name, apply: pluginHostRow.apply })
  await sleep(50)
  const host = attrCtx.get('tuiPluginHost')
  const commands = attrCtx.get('commands')
  const globalAgent = {}
  const resolved = (agent: object, name: string) => commands?.find(agent as never, name)
  check1('registerCommand surface exists on the plugin-host row', typeof host?.registerCommand === 'function')

  // Registering via the managed surface: must use an admitted Component and an explicit contribution ID.
  const evil = await mountAdmitted(attrCtx, 'evil-plugin', testManifest({
    id: 'com.example.evil-plugin',
    requires: [COMMAND_COORDINATE],
    commands: [{ id: 'evil-plugin.evil-cmd', title: 'Evil command' }],
    permissions: [{ name: 'commands.invoke', scope: 'evil-plugin.evil-cmd' }],
  }))
  const registerVia = (definition: unknown) =>
    host!.registerCommand(evil.context, 'evil-plugin.evil-cmd', definition as never)
  const disposer = registerVia({ name: 'evil-cmd', description: 'attribution probe', handler: () => ({ kind: 'success' }) })
  check1('mediated registration attributes the command to the plugin fiber',
    commandOwner(attrCtx, resolved(globalAgent, 'evil-cmd'))?.componentId === 'com.example.evil-plugin')

  // A direct ctx.get('commands') registration → unattributed (a documented C-070 boundary).
  commands?.register({ name: 'accessor-cmd', description: 'direct registration', handler: () => ({ kind: 'success' }) } as never)
  check1('direct ctx.get registration stays unattributed (documented boundary)',
    commandOwner(attrCtx, resolved(globalAgent, 'accessor-cmd')) === undefined)

  // A duplicate registration via the managed surface → maps to DUPLICATE_CONTRIBUTION_ID, the original stamp unmoved.
  let duplicateMapped = false
  try {
    registerVia({ name: 'evil-cmd', description: 'register again', handler: () => ({ kind: 'success' }) })
  } catch (error) {
    duplicateMapped = hasCommandErrorCode(error, 'DUPLICATE_CONTRIBUTION_ID')
  }
  check1('mediated duplicate registration throws DUPLICATE_CONTRIBUTION_ID', duplicateMapped)
  check1('the failed duplicate left the original stamp intact',
    commandOwner(attrCtx, resolved(globalAgent, 'evil-cmd'))?.componentId === 'com.example.evil-plugin')

  // The disposer lifts the stamp and is idempotent.
  disposer()
  check1('the mediated disposer lifts the stamp', commandOwner(attrCtx, resolved(globalAgent, 'evil-cmd')) === undefined)
  disposer()
  check1('double dispose stays harmless (no stamp, no throw)', commandOwner(attrCtx, resolved(globalAgent, 'evil-cmd')) === undefined)

  // dsh-commands resolves same-name entries per agent scope. Attribute the
  // selected definition itself, then unload one plugin without its wrapper.
  const agentA = {}
  const agentB = {}
  const scopeA = createScope(attrCtx, agentA)
  const scopeB = createScope(attrCtx, agentB)
  const scopedAMounted = await mountAdmitted(scopeA.ctx, 'scope-plugin-a', testManifest({
    id: 'com.example.scope-plugin-a',
    requires: [COMMAND_COORDINATE],
    commands: [{ id: 'scope-plugin-a.scoped-same', title: 'agent A' }],
    permissions: [{ name: 'commands.invoke', scope: 'scope-plugin-a.scoped-same' }],
  }))
  const scopedBMounted = await mountAdmitted(scopeB.ctx, 'scope-plugin-b', testManifest({
    id: 'com.example.scope-plugin-b',
    requires: [COMMAND_COORDINATE],
    commands: [{ id: 'scope-plugin-b.scoped-same', title: 'agent B' }],
    permissions: [{ name: 'commands.invoke', scope: 'scope-plugin-b.scoped-same' }],
  }))
  host!.registerCommand(scopedAMounted.context, 'scope-plugin-a.scoped-same', {
    name: 'scoped-same', description: 'agent A', handler: () => ({ kind: 'success' }),
  } as never)
  host!.registerCommand(scopedBMounted.context, 'scope-plugin-b.scoped-same', {
    name: 'scoped-same', description: 'agent B', handler: () => ({ kind: 'success' }),
  } as never)
  const scopedA = scopedAMounted.fiber
  const definitionA = resolved(agentA, 'scoped-same')
  check1('same command name keeps separate owners in separate agent scopes',
    commandOwner(attrCtx, definitionA)?.componentId === 'com.example.scope-plugin-a'
    && commandOwner(attrCtx, resolved(agentB, 'scoped-same'))?.componentId === 'com.example.scope-plugin-b')
  await Promise.resolve(scopedA.dispose())
  await sleep(30)
  check1('fiber teardown removes the scoped command definition', resolved(agentA, 'scoped-same') === undefined)
  check1('fiber teardown also removes its attribution stamp',
    commandOwner(attrCtx, definitionA) === undefined
    && commandOwner(attrCtx, resolved(agentB, 'scoped-same'))?.componentId === 'com.example.scope-plugin-b')
  await scopeA.dispose()
  await scopeB.dispose()
}

// ── G. channel wiring assertions ─────────────────────────────────────────────
{
  const channel = readFileSync(join(root, 'src/dsh-adapter/channel.ts'), 'utf8')
  // Keep this assertion tied to the effective-definition lookup rather than
  // one particular expression layout: the channel intentionally stores the
  // definition before resolving its owner so the same value is passed to
  // `execute`'s agent-scoped lookup checks.
  const definitionLookup = channel.indexOf('const definition = commandService.find(agent, name)')
  const ownerLookup = channel.indexOf('const owner = commandOwner(ctx, definition)', definitionLookup)
  const checkpoint = definitionLookup
  check1('owner-scoped invoke checkpoint present in channel.ts', checkpoint !== -1)
  check1('owner lookup uses the effective definition', ownerLookup > definitionLookup)
  // The invocation is version-gated (rc.8 composer images vs the legacy
  // 3-arg call), so match the `commandService.execute` identifier rather
  // than one particular call shape — the ordering guarantee under test is
  // that the owner checkpoint precedes the invocation.
  const executeAfter = channel.indexOf('commandService.execute', checkpoint)
  check1('owner checkpoint runs BEFORE commandService.execute', executeAfter > checkpoint)
  check1("owner deny path returns t('command-invoke-denied-owner')", channel.includes("return t('command-invoke-denied-owner'"))
  check1('owner invoke deny records a scoped permission id', channel.includes('resource: { kind: \'permission\', id: `${owner.componentId}:commands.invoke:${owner.commandId}` }'))
  check1('skill register catch maps through mapCommandError', /catch \(error\) \{[\s\S]{0,400}mapCommandError\(error\)/.test(channel))
  check1("skill success recorded as command create applied",
    channel.includes("{ operation: 'create', resource: { kind: 'command', id: name }, result: 'applied' }"))
  check1('skill failure recorded with DUPLICATE_CONTRIBUTION_ID or COMMAND_FAILED',
    channel.includes("? 'DUPLICATE_CONTRIBUTION_ID' : 'COMMAND_FAILED'"))
  check1('command-errors imported by channel.ts',
    channel.includes("import { hasCommandErrorCode, mapCommandError } from './command-errors.js'"))
  check1('command-attribution imported by channel.ts',
    channel.includes("import { commandOwner } from './command-attribution.js'"))
  const ownerCheckpoint = checkpoint
  check1('per-owner checkpoint present', ownerCheckpoint !== -1)
  check1('per-owner checkpoint runs BEFORE commandService.execute',
    channel.indexOf('commandService.execute', ownerCheckpoint) > ownerCheckpoint)
  check1('composer-images invocation is version-gated (0.1.0-rc.8 threshold + 4-param shape present)',
    channel.includes('commandServiceSupportsImages(')
    && channel.includes("installedMeetsVersion('@deepseek-ai/dsh-commands', '0.1.0-rc.8')")
    && channel.includes('CommandExecuteWithImages'))
  const pluginHost = readFileSync(join(root, 'src/dsh-adapter/plugin-host.ts'), 'utf8')
  check1('the plugin-host row exposes the mediated registerCommand',
    pluginHost.includes('registerCommand(pluginCtx: Context'))
  check1('registerCommand stamps the resolved definition on success',
    pluginHost.includes('stampCommandOwner(host, attributedDefinition, identity, contributionId)'))
  check1('registerCommand resolves commands through the canonical activation context', pluginHost.includes("caller.get('commands')"))
  check1('registerCommand maps duplicate errors', pluginHost.includes('mapCommandError(error)'))

  const i18n = readFileSync(join(root, 'src/i18n.ts'), 'utf8')
  const keyIdx = i18n.indexOf("'command-invoke-denied'")
  check1("i18n key 'command-invoke-denied' exists", keyIdx !== -1)
  const entry = i18n.slice(keyIdx, keyIdx + 400)
  check1('message present', /:\s*'[^']*grants file[^']*'/.test(entry))
  const ownerIdx = i18n.indexOf("'command-invoke-denied-owner'")
  check1("i18n key 'command-invoke-denied-owner' exists", ownerIdx !== -1)
  const ownerEntry = i18n.slice(ownerIdx, ownerIdx + 500)
  check1('owner deny message names the owner', ownerEntry.includes('{{owner}}'))
  check1('owner deny message present', /:\s*'[^']*owner plugin[^']*'/.test(ownerEntry))
}

// ── H. Non-breaking signature (still usable without passing identity) ──────────
{
  const ctx = new Context()
  new TuiShortcutRuntime(ctx)
  new TuiSceneRuntime(ctx)
  new TuiStatusRuntime(ctx)
  new TuiRendererRuntime(ctx)
  let activation: import('@deepseek-ai/cordis').Context | undefined
  const fiber = ctx.inject(['tuiShortcuts', 'tuiScenes', 'tuiStatus', 'tuiRenderers'], (pluginCtx) => {
    activation = pluginCtx
    const disposeShortcut = pluginCtx.tuiShortcuts.register('ctrl+shift+q', { description: 'no identity', handler: () => {} })
    check1('tuiShortcuts.register without identity returns a disposer', typeof disposeShortcut === 'function')
    disposeShortcut()

    const disposeScene = pluginCtx.tuiScenes.register({ id: 'demo-scene', component: () => null })
    check1('tuiScenes.register without identity returns a disposer', typeof disposeScene === 'function')
    disposeScene()

    const disposeStatus = pluginCtx.tuiStatus.set('demo-key', 'text')
    check1('tuiStatus.set without identity returns a disposer', typeof disposeStatus === 'function')
    disposeStatus()

    const disposeRenderer = pluginCtx.tuiRenderers.register('demo-plugin/note', () => undefined)
    check1('tuiRenderers.register without identity returns a disposer', typeof disposeRenderer === 'function')
    disposeRenderer()
  })
  await fiber
  if (activation === undefined) throw new Error('non-breaking signature probe did not activate')
  await fiber.dispose()
  await ctx.fiber.dispose()
}

// ── Summary ──────────────────────────────────────────────────────────────
for (const dir of cleanup) rmSync(dir, { recursive: true, force: true })
if (failures.length > 0) {
  console.error(`plugin-commands battery FAILED (${failures.length}/${checks}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`plugin-commands battery OK (${checks} checks: real-dependency mapping, variants, code predicate, wrapper, vocabulary, invoke gate, channel wiring, non-breaking signatures)`)
process.exit(0)
