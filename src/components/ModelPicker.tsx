import React from 'react'
import { t } from '../i18n.js'
import { Box, Text, useTerminalSize } from '../ui.js'
import type { LlmModelInfo } from '../dsh-adapter/types.js'
import { Pane } from './design-system/Pane.js'
import { ListItem } from './design-system/ListItem.js'
import { HintLine } from './design-system/HintLine.js'
import { listWindow } from './listWindow.js'

/**
 * Model picker in the CC ModelPicker style: a permission-colored Pane with
 * the model list as Select rows (❯ focus pointer, ✓ on the active model,
 * descriptions), plus the Enter/Esc hint line. The DSH agent's model is
 * fixed at creation time, so a selection notifies "restart to apply".
 *
 * Long lists are focus-windowed (same as Select): once the picker mounts
 * through OverlayAbove's floater it has a maxHeight clip, and rendering the
 * full list would crop the focus row out (Enter on an invisible focus row).
 */
export function ModelPicker({
  models,
  focusIndex,
  currentModel,
}: {
  models: readonly LlmModelInfo[]
  focusIndex: number
  currentModel: string
}): React.ReactNode {
  const { rows: terminalRows } = useTerminalSize()
  // Focus windowing is budgeted by rows: a ListItem with a description
  // takes 2 rows (body + description, both truncated to a single line) —
  // counting items alone crops the focus row out of the floater (confirmed
  // by a follow-up review).
  // Chrome rows: 8 floater reserve + 2 Pane + 2 title + 1 footer + 1 mount
  // wrapper marginTop = 14.
  const { start, end } = listWindow(
    models.map(m => (m.description ? 2 : 1)),
    focusIndex,
    Math.max(terminalRows - 14, 2),
  )
  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="remember" bold>
            {t('picker-title-model')}
          </Text>
        </Box>
        {models.slice(start, end).map((model, index) => {
          const absoluteIndex = start + index
          return (
            <ListItem
              key={`${model.provider}/${model.id}`}
              isFocused={absoluteIndex === focusIndex}
              isSelected={`${model.provider}/${model.id}` === currentModel}
              description={model.description}
              showScrollUp={absoluteIndex === start && start > 0}
              showScrollDown={absoluteIndex === end - 1 && end < models.length}
            >
              {model.provider} / {model.name}
            </ListItem>
          )
        })}
      </Box>
      <Text dimColor italic>
        <HintLine text={t('hint-confirm-exit')} />
      </Text>
    </Pane>
  )
}
