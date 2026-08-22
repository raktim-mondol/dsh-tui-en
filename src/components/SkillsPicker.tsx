import React from 'react'
import { t } from '../i18n.js'
import { Box, Text, useTerminalSize } from '../ui.js'
import type { SkillInfo } from '../dsh-adapter/channel.js'
import { Pane } from './design-system/Pane.js'
import { ListItem } from './design-system/ListItem.js'
import { HintLine } from './design-system/HintLine.js'
import { LoadingState } from './design-system/LoadingState.js'
import { listWindow } from './listWindow.js'

/** Source bucket → localized label (an unknown bucket is shown as-is; SkillSource is open to custom buckets). */
function sourceLabel(source: string): string {
  switch (source) {
    case 'bundled':
      return t('skills-source-bundled')
    case 'user-dsh':
    case 'user-agents':
      return t('skills-source-user')
    case 'project-dsh':
    case 'project-agents':
      return t('skills-source-project')
    case 'runtime':
      return t('skills-source-runtime')
    case 'custom':
      return t('skills-source-custom')
    default:
      return source
  }
}

/**
 * `/skills` picker (issue #204) in the ModelPicker style: a
 * permission-colored Pane listing the live agent's skill catalog —
 * user-invocable skills lead with `/name` (the same form they take in the
 * `/` menu), and the description row reads "source · summary". Enter has
 * Chat fill back `/name `, Esc closes.
 *
 * Long lists window around the focus (same treatment as ModelPicker):
 * once the picker mounts through the OverlayAbove floater it's clipped to
 * maxHeight, and a full render would clip the focused row out of view
 * (invisible, but Enter would still act on it).
 */
export function SkillsPicker({
  skills,
  focusIndex,
}: {
  skills: readonly SkillInfo[]
  focusIndex: number
}): React.ReactNode {
  const { rows: terminalRows } = useTerminalSize()
  // Each item always takes 2 rows (body + source/summary description row, both truncated to a single line).
  // Frame rows: floater reserves 8 + Pane 2 + title 2 + footer 1 + mount-wrapper marginTop 1 = 14 (same as ModelPicker).
  const { start, end } = listWindow(
    skills.map(() => 2),
    focusIndex,
    Math.max(terminalRows - 14, 2),
  )
  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="remember" bold>
            {t('picker-title-skills')}
          </Text>
        </Box>
        {skills.length === 0 ? (
          <Text dimColor>{t('skills-empty')}</Text>
        ) : (
          skills.slice(start, end).map((skill, index) => {
            const absoluteIndex = start + index
            return (
              <ListItem
                key={skill.name}
                isFocused={absoluteIndex === focusIndex}
                description={`${sourceLabel(skill.source)}${skill.description === '' ? '' : ` · ${skill.description}`}`}
                showScrollUp={absoluteIndex === start && start > 0}
                showScrollDown={absoluteIndex === end - 1 && end < skills.length}
              >
                {skill.userInvocable ? `/${skill.name}` : skill.name}
              </ListItem>
            )
          })
        )}
      </Box>
      <Text dimColor italic>
        <HintLine text={t('hint-fill-exit')} />
      </Text>
    </Pane>
  )
}

/** `/skills` while the registry snapshot is still in flight (same treatment as ModelPickerLoading). */
export function SkillsPickerLoading(): React.ReactNode {
  return (
    <Pane color="permission">
      <Box flexDirection="column" gap={1}>
        <Text bold color="permission">
          {t('picker-title-skills')}
        </Text>
        <LoadingState
          message={t('skills-loading')}
          bold
          subtitle={t('skills-loading-subtitle')}
        />
      </Box>
    </Pane>
  )
}
