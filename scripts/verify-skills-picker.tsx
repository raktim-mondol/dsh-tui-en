/**
 * `/skills` SkillsPicker smoke test (xterm-headless, mock skill data, never
 * touches the registry):
 *   1. Rendering: title, the /name form for directly-invocable skills,
 *      source labels, description truncation, the focus ❯ pointer — and
 *      that a persisted `zh` language pref still resolves to the same
 *      English UI (compat regression);
 *   2. Empty catalog shows "No skills available in this session";
 *   3. Every row stays within the terminal width on a narrow terminal;
 *   4. The loading state renders without crashing.
 * Run: node --import tsx/esm scripts/verify-skills-picker.tsx
 */
process.env.FORCE_COLOR = '3'

const [
  { Writable },
  React,
  { Terminal: XTerm },
  { render },
  { SkillsPicker, SkillsPickerLoading },
  { setLang },
  { stringWidth },
] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/SkillsPicker.js'),
  import('../src/i18n.js'),
  import('../src/ink/stringWidth.js'),
])

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let failures = 0
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    failures++
    console.error(`  ✗ ${msg}`)
  }
}

function makeTerm(cols: number, rows: number) {
  const term = new XTerm({ cols, rows, scrollback: 0, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = cols
    rows = rows
    isTTY = true
    _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
  }
  return { term, stdout: new FakeStdout() }
}

function screenText(term: InstanceType<typeof XTerm>, rows: number): string {
  const buf = term.buffer.active
  const lines: string[] = []
  for (let y = 0; y < rows; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
  return lines.join('\n')
}

const skills = [
  { name: 'audit', description: 'Do a thorough code audit of the current project, finding security and quality issues', userInvocable: true, source: 'bundled' },
  { name: 'my-helper', description: 'Personal helper skill', userInvocable: true, source: 'user-dsh' },
  { name: 'internal-router', description: 'Model-only routing skill', userInvocable: false, source: 'runtime' },
]

// --- 1. List rendering (and the zh→English compat regression) -----------------

console.log('list rendering:')

{
  const COLS = 90
  const ROWS = 24
  const { term, stdout } = makeTerm(COLS, ROWS)
  setLang('zh')
  const app = await render(
    React.createElement(SkillsPicker, { skills, focusIndex: 1 }),
    { stdout, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(300)

  const text = screenText(term, ROWS)
  assert(text.includes('Skills'), 'title shows "Skills" even with zh pinned (compat)')
  assert(text.includes('/audit'), 'directly-invocable skill shows the /name form')
  assert(text.includes('internal-router'), 'model-only skill shows the bare name (no slash)')
  assert(!text.includes('/internal-router'), 'model-only skill has no / prefix')
  assert(text.includes('built-in'), 'bundled source shows "built-in"')
  assert(text.includes('user'), 'user-dsh source shows "user"')
  assert(text.includes('runtime'), 'runtime source shows "runtime"')
  assert(text.includes('Do a thorough code audit'), 'description renders')
  assert(text.includes('❯'), 'focus pointer renders')
  assert(text.includes('to insert'), 'footer shows the Enter-to-insert hint')

  // --- 2. Explicit en selection renders the same UI ----------------------------
  setLang('en')
  app.rerender(React.createElement(SkillsPicker, { skills, focusIndex: 1 }))
  await sleep(200)
  const en = screenText(term, ROWS)
  assert(en.includes('Skills'), 'en: title shows Skills')
  assert(en.includes('built-in'), 'en: source label in English')
  assert(en.includes('Esc to exit'), 'en: footer hint in English')

  // --- 3. Empty catalog ---------------------------------------------------------
  app.rerender(React.createElement(SkillsPicker, { skills: [], focusIndex: 0 }))
  await sleep(200)
  const empty = screenText(term, ROWS)
  assert(empty.includes('No skills available'), 'empty catalog shows No skills available')

  setLang('zh')
  app.unmount()
  await sleep(100)
}

// --- 4. Narrow terminal: no row exceeds the width ------------------------------

console.log('narrow-terminal truncation:')

{
  const COLS = 32
  const ROWS = 24
  const { term, stdout } = makeTerm(COLS, ROWS)
  setLang('zh')
  const app = await render(
    React.createElement(SkillsPicker, { skills, focusIndex: 0 }),
    { stdout, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(300)
  app.unmount()
  await sleep(100)

  const buf = term.buffer.active
  for (let y = 0; y < ROWS; y++) {
    const line = buf.getLine(y)?.translateToString(true) ?? ''
    if (line.trim() === '') continue
    const w = stringWidth(line)
    assert(w <= COLS, `row ${y} width ${w} ≤ terminal width ${COLS}: '${line.trimEnd()}'`)
  }
}

// --- 5. Loading state -----------------------------------------------------------

console.log('loading state:')

{
  const COLS = 60
  const ROWS = 10
  const { term, stdout } = makeTerm(COLS, ROWS)
  setLang('zh')
  const app = await render(React.createElement(SkillsPickerLoading), {
    stdout,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  await sleep(300)
  const text = screenText(term, ROWS)
  assert(text.includes('Skills'), 'loading: title renders')
  assert(text.includes('Loading skills') || text.includes('Querying the skill registry'), 'loading: loading text renders')
  app.unmount()
  await sleep(100)
}

// --- Results ----------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall assertions passed')
process.exit(0)
