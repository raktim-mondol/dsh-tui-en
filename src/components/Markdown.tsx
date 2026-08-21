import React from 'react'
import { marked, type Token, type Tokens } from 'marked'
import { Box, Text } from '../ui.js'
import { configureMarked, formatToken, stripPromptXMLTags } from '../cc/markdown.js'
import { getCliHighlightPromise, type CliHighlight } from '../cc/cliHighlight.js'
import { MarkdownTable } from './MarkdownTable.js'

/**
 * Markdown rendering component: marked tokenization + ANSI formatting.
 *
 * Table tokens go to MarkdownTable, rendered as a bordered flexbox layout;
 * every other block-level token is turned into an ANSI string by
 * formatToken, concatenated, and wrapped in a single Text (leading/trailing
 * whitespace trimmed for the whole block). Code-block highlighting arrives
 * asynchronously from cli-highlight and triggers one re-render once loaded.
 * Plain text with no markdown syntax takes a fast path — a paragraph token
 * is synthesized directly, skipping the lexer call.
 */

type Props = {
  children: string
  /** When true, all text content renders dim. */
  dimColor?: boolean
  /** When false, skips the token cache (streaming tail content changes every frame, so a cache entry would never be a hit). */
  cacheTokens?: boolean
}

// ---- Token cache ----
//
// marked.lexer is the most expensive part of a component remount; message
// content is immutable, so the same text always produces the same tokens —
// cache keyed on the raw text.
//
// Capacity can't be bounded by entry count alone: a Token's raw/text fields
// are slices of the input string, which pin the whole input in memory;
// during streaming the input grows every frame, so count-only throttling
// would let the LRU hold a pile of near-final snapshots (a 1MB message ≈
// 500 entries × 1MB ≈ 500MB). Bounded here by a character budget instead —
// content past that length just isn't cached (a remount re-runs the lexer,
// which is rare and far cheaper than keeping it resident).
const TOKEN_CACHE_CAPACITY = 200
const TOKEN_CACHE_CHAR_BUDGET = 200_000
const TOKEN_CACHE_MAX_SOURCE_LENGTH = 20_000
const tokenCache = new Map<string, Token[]>()
let tokenCacheChars = 0

// Syntax probe: only worth hitting the lexer if any markdown structural
// marker is present; for long content, only probe a leading window — plain
// text skips the ~3ms lexer call entirely.
const MD_SYNTAX_MARKERS = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /
const SYNTAX_PROBE_WINDOW = 500

function looksLikePlainText(s: string): boolean {
  const probe =
    s.length > SYNTAX_PROBE_WINDOW ? s.slice(0, SYNTAX_PROBE_WINDOW) : s
  return !MD_SYNTAX_MARKERS.test(probe)
}

function lexWithCache(content: string, allowCache: boolean): Token[] {
  // Fast path: plain text synthesizes a single paragraph token directly, no lexer call.
  if (looksLikePlainText(content)) {
    return [
      {
        type: 'paragraph',
        raw: content,
        text: content,
        tokens: [{ type: 'text', raw: content, text: content }],
      },
    ]
  }
  if (!allowCache) return marked.lexer(content)

  // Use the content string itself as the key: V8 caches a string's hash at
  // its head, so after the first insert a Map lookup needs no re-hashing —
  // cheaper and less collision-prone than a sha256 digest.
  const hit = tokenCache.get(content)
  if (hit) {
    tokenCache.delete(content) // promote to most-recently-used
    tokenCache.set(content, hit)
    return hit
  }

  const tokens = marked.lexer(content)
  if (content.length > TOKEN_CACHE_MAX_SOURCE_LENGTH) return tokens

  if (
    tokenCache.size >= TOKEN_CACHE_CAPACITY ||
    tokenCacheChars + content.length > TOKEN_CACHE_CHAR_BUDGET
  ) {
    tokenCache.clear()
    tokenCacheChars = 0
  }
  tokenCache.set(content, tokens)
  tokenCacheChars += content.length
  return tokens
}

/**
 * Turns the lexer's token list into a sequence of React nodes: tables
 * render independently; every other token's ANSI text is accumulated and
 * concatenated, then wrapped into one Text (leading/trailing whitespace stripped).
 */
function renderTokensToNodes(
  tokens: Token[],
  highlight: CliHighlight | null,
  dimColor: boolean,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let ansiText = ''

  const flushAnsiText = (): void => {
    if (!ansiText) return
    nodes.push(
      <Text key={nodes.length} dimColor={dimColor}>
        {ansiText.trim()}
      </Text>,
    )
    ansiText = ''
  }

  for (const token of tokens) {
    if (token.type === 'table') {
      flushAnsiText()
      nodes.push(
        <MarkdownTable
          key={nodes.length}
          token={token as Tokens.Table}
          highlight={highlight}
        />,
      )
    } else {
      ansiText += formatToken(token, 0, null, null, highlight)
    }
  }

  flushAnsiText()
  return nodes
}

/**
 * Renders mixed Markdown content: tables use the bordered flexbox
 * component, everything else goes through formatToken into ANSI strings
 * inside a Text. Refreshes automatically once the highlight object becomes
 * ready asynchronously.
 *
 * memo by content: finished transcript blocks render with the SAME string
 * identity for the whole session (StreamingMarkdown keeps its stable prefix
 * identity-stable precisely to hit this); without the memo every parent
 * re-render re-ran the full token→ANSI→yoga pipeline for every settled
 * block — the dominant long-output stall (string-width via wrap-ansi, 60%+
 * of CPU in streaming profiles).
 */
function MarkdownImpl({ children, dimColor = false, cacheTokens = true }: Props): React.ReactNode {
  const [highlight, setHighlight] = React.useState<CliHighlight | null>(null)

  React.useEffect(() => {
    let mounted = true
    void getCliHighlightPromise().then((loaded) => {
      if (mounted) setHighlight(loaded)
    })
    return () => {
      mounted = false
    }
  }, [])

  configureMarked()

  const renderedNodes = React.useMemo(() => {
    const source = stripPromptXMLTags(children)
    return renderTokensToNodes(
      lexWithCache(source, cacheTokens),
      highlight,
      dimColor,
    )
  }, [children, dimColor, highlight, cacheTokens])

  return (
    <Box flexDirection="column" gap={1}>
      {renderedNodes}
    </Box>
  )
}

/**
 * Memoized Markdown: skips the whole token→ANSI→layout pipeline when the
 * content string is the same reference (see MarkdownImpl's doc comment).
 */
export const Markdown = React.memo(
  MarkdownImpl,
  (prev, next) =>
    prev.children === next.children &&
    prev.dimColor === next.dimColor &&
    prev.cacheTokens === next.cacheTokens,
)
