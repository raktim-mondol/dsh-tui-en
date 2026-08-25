/**
 * Child-stderr guard regression (issue #17): an MCP server spawned with an
 * inherited stderr (the MCP SDK's stdio default) writes straight to the
 * terminal device from the child process, bypassing the renderer's
 * process.stderr patch and corrupting the alt-screen. The guard rewrites such
 * spawns to a pipe and surfaces the lines as deduplicated notifications.
 *
 * Fixture modes (re-run this file as `--import tsx/esm <self> <mode>`):
 * the fixture spawns a grandchild that writes BOOM-LINE to stderr with an
 * inherited fd 2, with or without the guard installed. The driver captures
 * the fixture's stderr and asserts the raw line reaches fd 2 only when
 * unguarded. The fixture calls `spawn` through the default-import exports
 * object — the same access pattern cross-spawn (used by the MCP SDK) has.
 *
 * Driver mode additionally unit-tests the reporter: debounce dedup with a
 * repeat count, cooldown silence, ANSI stripping, truncation, empty lines.
 */
process.env.DSH_TUI_LANG = 'zh'

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { settle } from './lib/term-test.mjs'

const SELF = fileURLToPath(import.meta.url)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let failures = 0
const results: string[] = []
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

async function runInner(mode: string): Promise<void> {
  const { installChildStderrGuard } = await import('../src/dsh-adapter/childStderr.js')
  if (mode !== 'inner-plain') {
    installChildStderrGuard(line => process.stdout.write(`SINK:${line}\n`))
  }
  // Default import = the CJS exports object, read at call time — this is the
  // access pattern the patch must cover (cross-spawn does exactly this).
  const childProcess = (await import('node:child_process')).default
  const stdio = mode === 'inner-guard-string' ? 'inherit' : ['pipe', 'pipe', 'inherit']
  const child = childProcess.spawn(process.execPath, ['-e', 'process.stderr.write("BOOM-LINE\\n")'], {
    stdio,
  } as never)
  process.stdout.write(child.stderr === null ? 'STDERR-NULL\n' : 'STDERR-PIPED\n')
  child.on('exit', () => setTimeout(() => process.exit(0), 100))
}

function runFixture(mode: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx/esm', SELF, mode], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('exit', code => resolve({ stdout, stderr, code }))
  })
}

async function runDriver(): Promise<void> {
  // ── fixture: unguarded inherited stderr reaches fd 2 ──────────────────
  const plain = await runFixture('inner-plain')
  check('unguarded: inherited child stderr reaches fd 2 (issue repro)', plain.stderr.includes('BOOM-LINE'))
  check('unguarded: inherited child stderr is not readable (STDERR-NULL)', plain.stdout.includes('STDERR-NULL'))

  // ── fixture: guarded, stdio array form ────────────────────────────────
  const guarded = await runFixture('inner-guard')
  check('guarded (array stdio): raw stderr no longer reaches fd 2', !guarded.stderr.includes('BOOM-LINE'))
  check('guarded (array stdio): stderr became a pipe (STDERR-PIPED)', guarded.stdout.includes('STDERR-PIPED'))
  check('guarded (array stdio): the line reaches the controlled sink', guarded.stdout.includes('SINK:BOOM-LINE'))

  // ── fixture: guarded, whole-stdio 'inherit' string form ───────────────
  const guardedString = await runFixture('inner-guard-string')
  check('guarded (string stdio): raw stderr no longer reaches fd 2', !guardedString.stderr.includes('BOOM-LINE'))
  check('guarded (string stdio): the line reaches the controlled sink', guardedString.stdout.includes('SINK:BOOM-LINE'))

  // ── reporter: dedup / cooldown / cleanup ──────────────────────────────
  const { createChildStderrReporter } = await import('../src/dsh-adapter/childStderr.js')
  const notices: string[] = []
  const reporter = createChildStderrReporter(text => notices.push(text), {
    debounceMs: 60,
    cooldownMs: 400,
    maxLineLength: 50,
  })
  const failing = 'Error: Non-HTTPS URLs are only allowed for localhost'

  reporter.push(failing)
  reporter.push(failing)
  reporter.push(failing)
  // 稳定性探针（不得多出通知）：settle 会在第一条通知出现时立即返回，
  // 测不到「只出一条」的上界——保留固定窗口。
  await sleep(150)
  check('dedup: three identical lines produce one notice', notices.length === 1)
  check('dedup: notice carries a repeat count (repeated 3×)', notices[0]?.includes('repeated 3×') ?? false)

  reporter.push(failing)
  // 稳定性探针（冷却期内不得出新通知）：条件在 push 前就成立，轮询等于
  // 没测——保留固定窗口。
  await sleep(150)
  check('cooldown: a just-notified line stays silent during cooldown', notices.length === 1)

  // 纯排序等待：冷却窗口是墙钟时间，没有可观察的状态翻转——保留。
  await sleep(400)
  reporter.push(failing)
  await settle(() => notices.length === 2)
  check('冷却结束：同一行可再次通知', notices.length === 2)

  reporter.push('Usage: tsx proxy.ts <url>')
  await settle(() => notices.length === 3 && (notices[2]?.includes('Usage:') ?? false))
  check('不同的行各自成条通知', notices.length === 3 && (notices[2]?.includes('Usage:') ?? false))

  reporter.push('\x1b[31mred-line\x1b[39m')
  await settle(() => (notices.at(-1) ?? '').includes('red-line') && !(notices.at(-1) ?? '').includes('\x1b'))
  const ansiNotice = notices.at(-1) ?? ''
  check('ANSI escapes are stripped', ansiNotice.includes('red-line') && !ansiNotice.includes('\x1b'))

  const longLine = 'x'.repeat(100)
  reporter.push(longLine)
  await settle(() => (notices.at(-1) ?? '').includes('…') && !(notices.at(-1) ?? '').includes(longLine))
  const longNotice = notices.at(-1) ?? ''
  check('over-long line is truncated (with an ellipsis)', longNotice.includes('…') && !longNotice.includes(longLine))

  const countBefore = notices.length
  reporter.push('   ')
  reporter.push('')
  // 稳定性探针（空行不得产生通知）：条件在 push 前就成立——保留固定窗口。
  await sleep(150)
  check('empty / whitespace-only lines are dropped', notices.length === countBefore)

  reporter.dispose()

  console.log(results.join('\n'))
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('\nall child-stderr guard checks passed')
}

const mode = process.argv[2]
if (mode !== undefined && mode.startsWith('inner-')) {
  await runInner(mode)
} else {
  await runDriver()
}
