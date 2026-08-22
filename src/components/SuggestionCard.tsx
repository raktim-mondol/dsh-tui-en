import React from 'react'
import { Box, Text } from '../ui.js'
import { stringWidth } from '../ink/stringWidth.js'

/**
 * The rounded card shell shared by the `/` command menu and the `@` file
 * menu (the same ╭╮╰╯ visual language as the input box's EffortInputBorder):
 *
 *   ╭─ title ─────────────────────╮
 *   │ ❯ row content …             │
 *   │   row content …             │
 *   │ ↑2 · ↓3                     │  ← only when the list is clipped
 *   ╰────────────────────────────╯
 *
 * The bottom edge ╰╯ sits directly on the row above the input box's top
 * edge ╭╮ (PromptInput's floater wrapper removes the bottom padding), so
 * the card and the input box read as one connected "dropdown hanging off
 * the input box". The border color follows the input box's idle color
 * (in plan mode the whole panel set turns sage green together).
 *
 * Each row's left/right │ is wrapped around it by this component — a side
 * border on a single-line Text next to the content column would only draw
 * on its own row (the first row of the row height), leaving a multi-line
 * list's middle rows without a border. The card reserves 2 columns on each
 * side (│ + 1 space); the available width for row content is computed
 * uniformly by {@link cardContentWidth}, and the CJK-truncation contract
 * (verify-cjk-truncate) is pinned to that width.
 */
export function SuggestionCard({
  title,
  columns,
  accent,
  footer,
  rows,
}: {
  /** The title embedded in the top border (already localized, includes the count). */
  title: string
  columns: number
  /** Border color (a theme token); defaults to promptBorder. */
  accent?: 'promptBorder' | 'planMode'
  /** The dim hint row at the bottom (scroll indicator); not rendered when null/undefined. */
  footer?: string | null
  /** Already-rendered row content (one node per row); this component adds the left/right border to each row. */
  rows: readonly React.ReactNode[]
}): React.ReactNode {
  const inner = Math.max(0, columns - 2)
  const lead = `─ ${title} `
  // When the title doesn't fit (an extremely narrow terminal), fall back to a plain border rather than a half-cut title.
  const titleFits = stringWidth(lead) + 1 <= inner
  const top = titleFits
    ? `╭${lead}${'─'.repeat(inner - stringWidth(lead))}╮`
    : `╭${'─'.repeat(inner)}╮`
  const borderColor = accent ?? 'promptBorder'
  return (
    <Box flexDirection="column" width="100%" flexShrink={0}>
      <Text color={borderColor} wrap="truncate-end">{top}</Text>
      {rows.map((row, index) => (
        <Box key={index} flexDirection="row" width="100%">
          <Text color={borderColor}>│</Text>
          {/* flexGrow pins the right-side │ to the last column; row content truncates itself per cardContentWidth. */}
          <Box flexDirection="column" flexGrow={1} minWidth={0}>
            {row}
          </Box>
          <Text color={borderColor}>│</Text>
        </Box>
      ))}
      {footer ? (
        <Box flexDirection="row" width="100%">
          <Text color={borderColor}>│</Text>
          <Box flexGrow={1} minWidth={0}>
            <Text dimColor wrap="truncate-end"> {footer}</Text>
          </Box>
          <Text color={borderColor}>│</Text>
        </Box>
      ) : null}
      <Text color={borderColor} wrap="truncate-end">{`╰${'─'.repeat(inner)}╯`}</Text>
    </Box>
  )
}

/**
 * The available display width for a row's content inside the card: total
 * width minus the │ on each side plus 1 space of inner padding each.
 * CommandSuggestions / FileSuggestions share this figure for their
 * truncation math.
 */
export function cardContentWidth(columns: number): number {
  return Math.max(0, columns - 4)
}

/**
 * Splits a completion name into three segments around the "matched query
 * prefix" (used for prefix highlighting). Tries three levels, all
 * case-insensitive, matching completeCommands / file-candidate filtering
 * semantics:
 *   1. Whole-name prefix (a file query is a path prefix — `src/re` matches
 *      `src/render`);
 *   2. The prefix of the last space-delimited token (a nested command's
 *      `deepseek/` query for `model deepseek/…` — the completion name
 *      carries the `model ` path prefix);
 *   3. The prefix of the last `/`-delimited segment (`/model deepseek-v`
 *      matches the start of the segment `deepseek-v4-flash`).
 * Returns null when the query is empty, or when none match (an alias hit,
 * a stale candidate) — the caller renders the whole thing dim.
 */
export function splitQueryMatch(
  name: string,
  query: string,
): { before: string; match: string; after: string } | null {
  if (query === '') return null
  const lower = query.toLowerCase()
  const startsWith = (start: number): { before: string; match: string; after: string } | null => {
    const segment = name.slice(start)
    if (!segment.toLowerCase().startsWith(lower)) return null
    const matched = segment.slice(0, Math.min(query.length, segment.length))
    return {
      before: name.slice(0, start),
      match: matched,
      after: segment.slice(matched.length),
    }
  }
  const lastSpace = name.lastIndexOf(' ')
  return (
    startsWith(0)
    ?? (lastSpace >= 0 ? startsWith(lastSpace + 1) : null)
    ?? startsWith(name.lastIndexOf('/') + 1)
  )
}
