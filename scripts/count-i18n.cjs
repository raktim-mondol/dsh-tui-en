// Temporary audit: count dict entries missing zh/en translations (line-based).
const fs = require('fs')
const lines = fs.readFileSync('src/i18n.ts', 'utf8').split('\n')
const entries = []
let cur = null
for (const line of lines) {
  const m = line.match(/^  '([a-z0-9-]+)':\s*\{/)
  if (m) { cur = { key: m[1], text: line }; if (/}\s*,?\s*$/.test(line)) { entries.push(cur); cur = null } continue }
  if (cur) {
    cur.text += '\n' + line
    if (/^\s*\},?\s*$/.test(line)) { entries.push(cur); cur = null }
  }
}
const missingEn = entries.filter(e => !/\ben:/.test(e.text)).map(e => e.key)
const missingZh = entries.filter(e => !/\bzh:/.test(e.text)).map(e => e.key)
const cmdDesc = missingEn.filter(k => k.startsWith('cmd-desc-'))
const real = missingEn.filter(k => !k.startsWith('cmd-desc-'))
console.log('total entries:', entries.length)
console.log('missing en:', missingEn.length, '| cmd-desc-* (expected):', cmdDesc.length, '| real gaps:', real.length)
console.log('real gap keys:', real.join(', '))
console.log('missing zh:', missingZh.length, missingZh.join(', '))
