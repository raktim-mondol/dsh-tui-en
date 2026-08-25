import React from 'react'
import { Text } from '../ui.js'
import { stringWidth } from '../ink/stringWidth.js'
import { truncateToWidth } from '../ink/truncateToWidth.js'
import type { Color } from '../ink/styles.js'
import type { Theme } from '../theme.js'
import type { LocalCommand } from '../commands.js'
import { localizedDescription } from '../commands.js'
import { t } from '../i18n.js'
import { POINTER } from '../cc/figures.js'
import { SuggestionCard, cardContentWidth, splitQueryMatch } from './SuggestionCard.js'

/**
 * The slash-command suggestion overlay, mirroring Claude Code's
 * `PromptInputFooterSuggestions.tsx` (command layout only) wrapped in the
 * shared rounded `SuggestionCard`:
 *
 *   ╭─ commands · 12 items ────────────────────╮
 *   │ ❯ compact  Compact the conversation …  │   ← selected: ❯ + bold + suggestion color
 *   │   compare  Compare selected messages … │   ← the segment matching the input is lit up
 *   │ ↑2 · ↓3                                 │   ← only when the list is window-clipped
 *   ╰─────────────────────────────────────────╯
 *
 * An unselected row is dim overall, except the prefix in the name that
 * matches the current query token lights up to normal brightness (bold and
 * dim are mutually exclusive in a terminal, so lighting up uses non-dim
 * rather than bold); a selected row is fully in the suggestion color, name
 * bold, with a leading ❯ pointer.
 */
export function CommandSuggestions({
  commands,
  selectedIndex,
  columns,
  query = '',
  accent,
  onPick,
  onWheelStep,
}: {
  commands: readonly (LocalCommand & { descriptionKey?: string })[]
  selectedIndex: number
  columns: number
  /** Raw `/…` input; its last token is used to highlight the matching name prefix. */
  query?: string
  accent?: keyof Theme | Color
  /** 鼠标点击行（fullscreen）：上报过滤后列表的绝对索引（与键盘
   *  selectedIndex 同一索引空间），接受路径由 PromptInput 复用。 */
  onPick?: (index: number) => void
  /** 滚轮步进（fullscreen）：±1 移动选中行。 */
  onWheelStep?: (step: 1 | -1) => void
}): React.ReactNode {
  if (commands.length === 0) return null

  // Cap the command name column at 40% of the card's content width to ensure
  // the description has space (same ratio as Claude Code).
  const usable = cardContentWidth(columns)
  const maxNameWidth = Math.floor(usable * 0.4)
  const nameWidth = Math.min(
    Math.max(...commands.map(c => stringWidth(c.name))) + 5,
    maxNameWidth,
  )

  const maxVisible = 5
  const startIndex = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      commands.length - maxVisible,
    ),
  )
  const visible = commands.slice(startIndex, startIndex + maxVisible)
  const above = startIndex
  const below = commands.length - (startIndex + visible.length)
  // Prefix highlight uses the query's last token (`/plan of` highlights the segment matching `of`).
  const queryToken = query.replace(/^\//, '').match(/[^ \t]*$/)?.[0] ?? ''

  const title = `${t('sugg-commands-title')} · ${t('sugg-count', { n: commands.length })}`
  const footer =
    above > 0 || below > 0
      ? [
          above > 0 ? t('sugg-more-above', { n: above }) : null,
          below > 0 ? t('sugg-more-below', { n: below }) : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')
      : null

  return (
    <SuggestionCard
      title={title}
      columns={columns}
      accent={accent}
      footer={footer}
      onRowPick={onPick ? index => onPick(startIndex + index) : undefined}
      onWheelStep={onWheelStep}
      rows={visible.map(command => {
        const isSelected = command.name === commands[selectedIndex]?.name
        const tagText = command.tag ? `[${command.tag}] ` : ''
        const tagWidth = stringWidth(tagText)
        // Row budget: content width − 1 leading space − 2 pointer columns.
        const descriptionWidth = Math.max(0, usable - 3 - nameWidth - tagWidth)
        const rawDescription = localizedDescription(command)
        const description =
          stringWidth(rawDescription) > descriptionWidth
            ? truncateToWidth(rawDescription, descriptionWidth - 1) + '…'
            : rawDescription
        const parts = splitQueryMatch(command.name, queryToken)
        const padAfter = Math.max(0, nameWidth - stringWidth(command.name))
        return (
          <Text key={command.name} wrap="truncate">
            {' '}
            {isSelected ? (
              <Text color="suggestion" bold>{`${POINTER} ${command.name}${' '.repeat(padAfter)}`}</Text>
            ) : parts ? (
              // A nested Text inherits the parent's dim (this fork's dimColor
              // is a color swap, not overridable by dim={false}), so the
              // highlighted segment must be a sibling of the dim segments,
              // not nested inside them.
              <>
                <Text dimColor>{`  ${parts.before}`}</Text>
                <Text>{parts.match}</Text>
                <Text dimColor>{`${parts.after}${' '.repeat(padAfter)}`}</Text>
              </>
            ) : (
              <Text dimColor>{`  ${command.name}${' '.repeat(padAfter)}`}</Text>
            )}
            {tagText ? <Text dimColor>{tagText}</Text> : null}
            <Text color={isSelected ? 'suggestion' : undefined} dimColor={!isSelected}>
              {description}
            </Text>
          </Text>
        )
      })}
    />
  )
}