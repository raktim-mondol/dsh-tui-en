/**
 * Batch-6 battery: the /plugins diagnostics surface + /doctor additions
 * (C-070 trust disclosure + C-030 negotiation diagnostics).
 *
 *   A. The trust-disclosure banner is a fixed first line (consistent across
 *      the overview / check / unknown-subcommand paths);
 *   B. Host Descriptor summary: generation/contracts/dropped lines; the
 *      degraded line when the row isn't mounted;
 *   C. Authorization matrix: the union row of a temp HOME's
 *      grants/denies/ledger/storage-directory footprints, all 8
 *      permissions' effective values correct bit-by-bit (including denies
 *      revocation and allow defaults), host/undeclared never become a row,
 *      an overflow note appears past 20 rows;
 *   D. Ledger tail-5: 7 records show only the last 5, corrupt lines are
 *      skipped, an empty ledger gets the empty line;
 *   E. /plugins check: the vendored fixtures run all five states
 *      (compatible / waiting_authorization / unknown + grants flipping to
 *      compatible), the schema and semantic failure paths, not-found, bad
 *      JSON, zero control characters in the output (untrusted-input
 *      sanitization);
 *   F. Wiring assertions: LOCAL_COMMANDS, Chat.tsx dispatch, the channel
 *      interface and implementation, the i18n keys the new doctorInfo lines
 *      reference, cmd-desc-plugins, the banner text.
 *
 * HOME/USERPROFILE are isolated before importing src.
 *
 * Run via `node --import tsx/esm scripts/verify-plugin-negotiation.ts`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── isolate HOME (must precede any src import) ──────────────────────────
const fakeHome = mkdtempSync(join(tmpdir(), 'dsh-plugin-negotiation-home-'))
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome
process.env.DSH_TUI_LANG = 'en'

const { pluginsInfoLines, PLUGINS_MATRIX_MAX_ROWS } = await import('../src/dsh-adapter/plugins-info.js')
const { readGrantStore } = await import('../src/dsh-adapter/grants.js')
const { buildHostDescriptor } = await import('../src/dsh-adapter/host-descriptor.js')
const { DATA_DIR } = await import('../src/utils/paths.js')
const { PLUGIN_STORAGE_DIR } = await import('../src/dsh-adapter/plugin-storage.js')
const { EFFECT_LEDGER_FILE } = await import('../src/dsh-adapter/effect-ledger.js')
const { parseManifest } = await import('@dsh-std/manifest')
const { loadSpecData } = await import('../src/plugin-spec/registry.js')
const { createContractIndex, validatePlugin } = await import('../src/plugin-spec/validate.js')
const { negotiate } = await import('../src/plugin-spec/negotiate.js')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = (name: string) => join(root, 'dsh-ecosystem-spec', 'conformance', 'fixtures', name)
const cleanup: string[] = [fakeHome]

let checks = 0
const failures: string[] = []
const check1 = (name: string, ok: boolean, detail?: string) => {
  checks += 1
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

// ── footprint fixture: grants + denies + ledger + storage directory ─────
mkdirSync(DATA_DIR, { recursive: true })
const scoped = (name: string, scope: string) => ({ name, scope })
const grantsTable: Record<string, object[]> = {
  alpha: [scoped('storage.local.read', 'alpha'), scoped('storage.local.write', 'alpha')],
}
for (let index = 1; index <= 21; index += 1) grantsTable[`p${String(index).padStart(2, '0')}`] = []
writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
  grants: grantsTable,
  denies: { evil: [scoped('commands.invoke', 'diagnostic.command')] },
}))
mkdirSync(join(DATA_DIR, PLUGIN_STORAGE_DIR), { recursive: true })
writeFileSync(join(DATA_DIR, PLUGIN_STORAGE_DIR, 'gamma.json'), '{}')
const ledgerRecords = [
  { sequence: 0, operation: 'create', resource: { kind: 'scene', id: 's1' }, pluginId: 'alpha', result: 'applied' },
  { sequence: 1, operation: 'bind', resource: { kind: 'shortcut', id: 'ctrl+shift+z' }, pluginId: 'beta', result: 'applied' },
  { sequence: 2, operation: 'bind', resource: { kind: 'permission', id: 'commands.invoke' }, pluginId: 'host', result: 'failed', errorCode: 'PERMISSION_NOT_GRANTED' },
  { sequence: 3, operation: 'create', resource: { kind: 'storage-namespace', id: 'alpha' }, pluginId: 'undeclared', result: 'applied' },
  { sequence: 4, operation: 'replace', resource: { kind: 'status', id: 'alpha-line' }, pluginId: 'alpha', result: 'applied' },
  { sequence: 5, operation: 'release', resource: { kind: 'scene', id: 's1' }, pluginId: 'alpha', result: 'applied' },
  { sequence: 6, operation: 'bind', resource: { kind: 'permission', id: 'messages.observe.read' }, pluginId: 'evil', result: 'failed', errorCode: 'PERMISSION_NOT_GRANTED' },
]
writeFileSync(EFFECT_LEDGER_FILE, ledgerRecords.map(r => JSON.stringify(r)).join('\n') + '\n{corrupt line\n')

const grants = readGrantStore()
const host = buildHostDescriptor({ generationId: 'negotiation-battery' })
const overview = () => pluginsInfoLines('', { grants, host })

// ── A. banner is a fixed first line ──────────────────────────────────────
{
  const fromOverview = overview()[0]
  const fromCheck = pluginsInfoLines('check ' + fixture('valid-plugin.json'), { grants, host })[0]
  const fromUnknown = pluginsInfoLines('bogus', { grants, host })[0]
  check1('banner is the first line on the overview path', fromOverview.includes('in-process with the host') && fromOverview.includes('C-070'))
  check1('banner is the first line on the check path', fromCheck === fromOverview)
  check1('banner is the first line on the unknown-subcommand path', fromUnknown === fromOverview)
}

// ── B. Host Descriptor summary ───────────────────────────────────────────
{
  const lines = overview()
  const joined = lines.join('\n')
  check1('descriptor summary carries the generation', joined.includes('generation negotiation-battery'))
  check1('descriptor summary lists the advertised contracts',
    joined.includes('commands.dsh/v1alpha1#Command') &&
    joined.includes('storage.dsh/v1alpha1#LocalStorage') &&
    joined.includes('messages.dsh/v1alpha1#MessageObserver'))
  const degraded = pluginsInfoLines('', { grants, host: undefined })
  check1('missing plugin-host row degrades to the explicit line',
    degraded.some(line => line.includes('plugin-host row not mounted')))
}

// ── C. authorization matrix ──────────────────────────────────────────────
{
  const lines = overview()
  const matrixAt = lines.findIndex(line => line.includes('Grant matrix'))
  check1('matrix section present with the footprints-only note', matrixAt !== -1 && lines[matrixAt].includes('plugins with footprints only'))
  const legend = lines[matrixAt + 1] ?? ''
  check1('legend lists all 8 registered permissions',
    ['storage.local.read', 'storage.local.write', 'commands.invoke', 'messages.observe.read',
      'session.input.intercept', 'session.rewind.intercept', 'session.switch.intercept', 'session.compact.intercept']
      .every(permission => legend.includes(permission)), legend)
  const rowOf = (plugin: string) => lines.find(line => line.trimStart().startsWith(plugin + ' '))
  const marks = (plugin: string) => rowOf(plugin)?.trimStart().slice(plugin.length).trim().split(/\s+/)
  check1('alpha row: granted storage ✓✓, invoke ✓ (allow default), rest denied',
    JSON.stringify(marks('alpha')) === JSON.stringify(['✓', '✓', '✓', '·', '·', '·', '·', '·']), JSON.stringify(marks('alpha')))
  check1('beta row (ledger footprint only): invoke ✓, everything else denied',
    JSON.stringify(marks('beta')) === JSON.stringify(['·', '·', '✓', '·', '·', '·', '·', '·']), JSON.stringify(marks('beta')))
  check1('evil row: denies revoke the allow-default invoke → all denied',
    JSON.stringify(marks('evil')) === JSON.stringify(['·', '·', '·', '·', '·', '·', '·', '·']), JSON.stringify(marks('evil')))
  check1('gamma row (storage-dir footprint) present', rowOf('gamma') !== undefined)
  check1("'host' never becomes a matrix row", rowOf('host') === undefined)
  check1("'undeclared' never becomes a matrix row", rowOf('undeclared') === undefined)
  check1('overflow note beyond the row cap',
    lines.some(line => line.includes('more plugin(s) not shown')),
    `rows=${PLUGINS_MATRIX_MAX_ROWS}, plugins=${21 + 4}`)
}

// ── D. ledger tail-5 ──────────────────────────────────────────────────────
{
  const lines = overview()
  const headerAt = lines.findIndex(line => line.includes('Effect ledger') && line.includes('last 5 records'))
  check1('ledger tail header present', headerAt !== -1)
  const tail = lines.slice(headerAt + 1).filter(line => line.trimStart().startsWith('#'))
  check1('exactly 5 tail records shown from 7 valid lines', tail.length === 5, `${tail.length}`)
  check1('oldest records are not in the tail', !tail.some(line => line.startsWith('  #0 ') || line.startsWith('  #1 ')))
  check1('corrupt line skipped silently', tail.every(line => !line.includes('corrupt')))
  check1('tail record format carries operation/resource/plugin/result',
    tail.some(line => line.includes('bind permission/messages.observe.read evil failed (PERMISSION_NOT_GRANTED)')))
  const empty = pluginsInfoLines('', { grants, host, ledgerFile: join(fakeHome, 'no-such-ledger.jsonl') })
  check1('missing ledger file renders the empty line', empty.some(line => line.includes('The effect ledger is empty')))
}

// ── E. /plugins check five states and failure paths ─────────────────────
{
  const checkLines = (arg: string) => pluginsInfoLines(`check ${arg}`, { grants, host }).slice(1) // drop the banner
  const compatible = checkLines(fixture('valid-plugin.json'))
  check1('valid fixture negotiates compatible against the real descriptor',
    compatible.some(line => line.includes('Negotiation decision: compatible') && !line.includes('degraded')), compatible.join(' | '))
  const waiting = checkLines(fixture('waiting-authorization-plugin.json'))
  check1('observer fixture waits for authorization with the denied permission named',
    waiting.some(line => line.includes('waiting_authorization') && line.includes('PERMISSION_NOT_GRANTED') && line.includes('messages.observe.read')),
    waiting.join(' | '))
  const unknown = checkLines(fixture('unknown-version-plugin.json'))
  check1('unregistered version answers unknown (never rejected)',
    unknown.some(line => line.includes('unknown') && line.includes('UNKNOWN_PROTOCOL_VERSION') && line.includes('storage.dsh/v2beta1#LocalStorage')),
    unknown.join(' | '))

  // grants flip: after granting com.example.observer, the same fixture becomes compatible
  writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
    grants: { 'com.example.observer': [scoped('messages.observe.read', 'session:*')] },
  }))
  const flipped = pluginsInfoLines('check ' + fixture('waiting-authorization-plugin.json'), { grants: readGrantStore(), host }).slice(1)
  check1('granting the permission flips the same fixture to compatible',
    flipped.some(line => line.includes('Negotiation decision: compatible')), flipped.join(' | '))
  // restore the footprint fixture
  writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
    grants: grantsTable,
    denies: { evil: [scoped('commands.invoke', 'diagnostic.command')] },
  }))

  const semantic = checkLines(fixture('invalid-plugin-duplicate-command.json'))
  check1('duplicate command id is rejected by the official manifest parser',
    semantic.some(line => line.includes('Schema validation failed')), semantic.join(' | '))
  const schemaFail = checkLines(fixture('invalid-plugin-client-facet.json'))
  check1('client facet fails the vendored schema',
    schemaFail.some(line => line.includes('Schema validation failed')), schemaFail.join(' | '))
  check1('missing file reports not-found',
    checkLines(join(fakeHome, 'nope.json')).some(line => line.includes('File not found')))
  const garbage = join(fakeHome, 'garbage.json')
  writeFileSync(garbage, '{ not json !!!')
  check1('unparseable file reports invalid-json',
    checkLines(garbage).some(line => line.includes('Not parseable JSON')))
  check1('bare check prints usage', pluginsInfoLines('check', { grants, host }).some(line => line.includes('Usage: /plugins check')))

  // Untrusted-input sanitization: no output line may contain control characters (manifest/file material passes through cleanScalarText)
  const all = [
    ...checkLines(fixture('valid-plugin.json')),
    ...checkLines(fixture('invalid-plugin-duplicate-command.json')),
    ...checkLines(garbage),
    ...overview(),
  ]
  // eslint-disable-next-line no-control-regex
  check1('no control characters in any output line', all.every(line => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(line)))
}

// ── E2. TUI host-extension overlay (P2-11) ───────────────────────────────
{
  const extensionCheck = (path: string, store = grants, targetHost = host) =>
    pluginsInfoLines(`check ${path}`, { grants: store, host: targetHost }).slice(1) // drop the banner
  const privateFixture = fixture('valid-private-protocol-plugin.json')
  const noDecisionHost = {
    descriptor: JSON.parse(readFileSync(fixture('host-no-observe.example.json'), 'utf8')),
    dropped: [],
    warnings: [],
  }
  const unavailable = extensionCheck(privateFixture, grants, noDecisionHost)
  check1('the current-schema private fixture reaches negotiation',
    !unavailable.some(line => line.includes('Schema validation failed') || line.includes('Semantic validation failed')), unavailable.join(' | '))
  check1('a host without DecisionEvents rejects the required private protocol',
    unavailable.some(line => line.includes('rejected')
      && line.includes('REQUIRED_PROTOCOL_UNAVAILABLE')
      && line.includes('tui.dsh/v1alpha1#DecisionEvents')), unavailable.join(' | '))
  // A plugin that follows the docs: declares session.input.intercept and
  // subscribes to tui/input — the vendored core surface can't answer this
  // (the schema enumerates only the 4 core permission names, the registry
  // has no tui/* entries), so it must go through the TUI extension overlay,
  // and the output must honestly declare that it did.
  const tuiPlugin = join(fakeHome, 'tui-extension-plugin.json')
  writeFileSync(tuiPlugin, JSON.stringify({
    $schema: 'urn:dsh-std:community-draft:dsh-plugin:0.15',
    id: 'com.example.input-guard',
    name: 'Input Guard',
    version: '0.1.0',
    manifestVersion: '0.15',
    facets: { host: { entry: 'dist/main.js', apiVersion: 'v1alpha1' } },
    requires: { contracts: [{ apiVersion: 'tui.dsh/v1alpha1', kind: 'DecisionEvents' }] },
    permissions: [{ name: 'session.input.intercept', scope: 'tui/input', reason: 'guard user input' }],
    contributes: { commands: [] },
    subscriptions: [],
    license: 'MIT',
    source: { repository: 'https://example.com/guard', revision: 'abc123' },
  }))
  const decisionBuild = buildHostDescriptor({ generationId: 'decision-battery' })
  const ungranted = extensionCheck(tuiPlugin, grants, decisionBuild)
  check1('extension manifest reaches negotiation (no schema/semantic failure)',
    !ungranted.some(line => line.includes('Schema validation failed') || line.includes('Semantic validation failed')), ungranted.join(' | '))
  check1('ungranted intercept permission answers waiting_authorization naming it',
    ungranted.some(line => line.includes('waiting_authorization') && line.includes('session.input.intercept@tui/input')),
    ungranted.join(' | '))
  // Flips to compatible once granted (the intercept permission is host-declared in the overlay descriptor).
  writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
    grants: { ...grantsTable, 'com.example.input-guard': [scoped('session.input.intercept', 'tui/input')] },
    denies: { evil: [scoped('commands.invoke', 'diagnostic.command')] },
  }))
  const grantedLines = extensionCheck(tuiPlugin, readGrantStore(), decisionBuild)
  check1('granting the exact event scope flips DecisionEvents to compatible',
    grantedLines.some(line => line.includes('Negotiation decision: compatible') && !line.includes('degraded')), grantedLines.join(' | '))

  // An unregistered same-group version must first pass structural/permission
  // closure validation, then have negotiation explicitly return
  // UNKNOWN_PROTOCOL_VERSION — version negotiation must never be masked as
  // “v1alpha1 is missing”.
  const unknownDecisionManifest = parseManifest(JSON.stringify({
    $schema: 'urn:dsh-std:community-draft:dsh-plugin:0.15',
    id: 'com.example.future-input-guard',
    name: 'Future Input Guard',
    version: '0.1.0',
    manifestVersion: '0.15',
    facets: { host: { entry: 'dist/main.js', apiVersion: 'v1alpha1' } },
    requires: { contracts: [{ apiVersion: 'tui.dsh/v2beta1', kind: 'DecisionEvents' }] },
    permissions: [{ name: 'session.input.intercept', scope: 'tui/input', reason: 'guard user input' }],
    contributes: { commands: [] },
    subscriptions: [],
    license: 'MIT',
    source: { repository: 'https://example.com/future-guard', revision: 'abc123' },
  }), { source: 'future-decision-events.json' })
  const spec = loadSpecData()
  if (spec === undefined) throw new Error('plugin negotiation battery cannot load the pinned registry')
  const contractIndex = createContractIndex(spec.registry, spec.permissions)
  let futureValidationError: unknown
  try {
    validatePlugin(contractIndex, unknownDecisionManifest)
  } catch (error) {
    futureValidationError = error
  }
  check1('unknown DecisionEvents version passes validatePlugin permission closure', futureValidationError === undefined,
    futureValidationError instanceof Error ? futureValidationError.message : String(futureValidationError ?? ''))
  const futureDecision = negotiate(contractIndex, unknownDecisionManifest, decisionBuild.descriptor, [
    { name: 'session.input.intercept', scope: 'tui/input', granted: true },
  ])
  check1('unknown DecisionEvents version negotiates UNKNOWN_PROTOCOL_VERSION',
    futureDecision.decision === 'unknown'
    && futureDecision.reasonCode === 'UNKNOWN_PROTOCOL_VERSION'
    && futureDecision.unknownContracts.includes('tui.dsh/v2beta1#DecisionEvents'),
    JSON.stringify(futureDecision))

  // restore the footprint fixture
  writeFileSync(join(DATA_DIR, 'extension-grants.json'), JSON.stringify({
    grants: grantsTable,
    denies: { evil: [scoped('commands.invoke', 'diagnostic.command')] },
  }))
  // A manifest that fails on both sides (an unregistered permission name) → reports the base error, never let through by the overlay.
  const bogusPlugin = join(fakeHome, 'bogus-permission-plugin.json')
  writeFileSync(bogusPlugin, JSON.stringify({
    $schema: 'urn:dsh-std:community-draft:dsh-plugin:0.15',
    id: 'com.example.bogus',
    name: 'Bogus',
    version: '0.1.0',
    manifestVersion: '0.15',
    facets: { host: { entry: 'dist/main.js', apiVersion: 'v1alpha1' } },
    requires: { contracts: [{ apiVersion: 'commands.dsh/v1alpha1', kind: 'Command' }] },
    permissions: [{ name: 'bogus.permission', scope: 'x' }],
    contributes: { commands: [] },
    subscriptions: [],
    license: 'MIT',
    source: { repository: 'https://example.com/bogus' },
  }))
  const bogus = extensionCheck(bogusPlugin, grants, decisionBuild)
  check1('an unregistered permission fails profile semantic validation',
    bogus.some(line => line.includes('Semantic validation failed') && line.includes('bogus.permission')),
    bogus.join(' | '))
  const coreLines = extensionCheck(fixture('valid-plugin.json'))
  check1('public manifests still negotiate through the same catalog',
    coreLines.some(line => line.includes('Negotiation decision: compatible')))
}

// ── F. wiring assertions ─────────────────────────────────────────────────
{
  const commands = readFileSync(join(root, 'src/commands.ts'), 'utf8')
  check1("LOCAL_COMMANDS carries 'plugins'", /\{ name: 'plugins', description: /.test(commands))
  const chat = readFileSync(join(root, 'src/screens/Chat.tsx'), 'utf8')
  check1("Chat.tsx dispatches case 'plugins' to channel.pluginsInfo(rawInput)",
    chat.includes("case 'plugins':") && chat.includes('channel.pluginsInfo(rawInput)'))
  const channel = readFileSync(join(root, 'src/dsh-adapter/channel.ts'), 'utf8')
  check1('channel interface declares pluginsInfo(args)', channel.includes('pluginsInfo(args: string): string[]'))
  check1('channel implementation soft-probes tuiPluginHost for pluginsInfo',
    /pluginsInfo\(args: string\) \{[\s\S]{0,300}ctx\.get\('tuiPluginHost'\)/.test(channel))
  check1('doctorInfo adds the generation line', channel.includes("t('doctor-plugin-generation'"))
  check1('doctorInfo adds the registry self-check line', channel.includes("t('doctor-plugin-registry'"))
  const i18n = readFileSync(join(root, 'src/i18n.ts'), 'utf8')
  check1('trust banner exists',
    i18n.includes("'plugins-trust-banner'") && i18n.includes('in-process with the host'))
  // No i18n override key is expected here: `LOCAL_COMMANDS`' own `description`
  // is the single source of truth (see the commands.ts — slash-command
  // descriptions section of i18n.ts), and `localizedDescription` falls back
  // to it directly when the dict has no entry for a command.
  check1("plugins command description is present in LOCAL_COMMANDS",
    /name: 'plugins', description: '[^']+'/.test(commands))
  check1('doctor plugin keys exist',
    i18n.includes("'doctor-plugin-generation'") && i18n.includes('Plugin runtime generation') &&
    i18n.includes("'doctor-plugin-registry'") && i18n.includes('Plugin-spec registry self-check'))
}

// ── summary ───────────────────────────────────────────────────────────────
for (const dir of cleanup) rmSync(dir, { recursive: true, force: true })
if (failures.length > 0) {
  console.error(`plugin-negotiation battery FAILED (${failures.length}/${checks}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`plugin-negotiation battery OK (${checks} checks: trust banner, descriptor summary, grant matrix, ledger tail, /plugins check five-state, wiring)`)
process.exit(0)
