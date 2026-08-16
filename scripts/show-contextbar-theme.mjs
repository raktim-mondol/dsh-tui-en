/**
 * Side-by-side visual compare of contextBar light/dark (issue #29 white-bar fix).
 *
 * Usage: node scripts/show-contextbar-theme.mjs
 * On a dark terminal: the top bar is the old look (light grey #E8E8E8, a
 * harsh white strip); the bottom bar is the fix (deep blue-grey #2E3440 +
 * grey-blue text). On a light terminal the two are close.
 */
import { renderContextBar } from '../lib/types/screens/StatusMetrics.js'

// Typical context occupancy (used 44k / window 128k)
const segments = { system: 12000, prompt: 8000, assistant: 15000, thinking: 3000, tools: 6000 }
const used = 44000
const window = 128000
const width = 60

console.log('=== before the fix (light theme: #E8E8E8 bright-grey free segment) ===')
console.log(renderContextBar(segments, used, window, width))
console.log('')
console.log('=== after the fix (dark/dark-ansi: #2E3440 deep blue-grey + #8D95A6 text) ===')
console.log(renderContextBar(segments, used, window, width, { freeFill: '#2E3440', freeText: '#8D95A6' }))
console.log('')
