import React, { type ReactNode, useState } from 'react'
import { Box, Text } from '../../ui.js'
import { useDeclaredCursor } from '../../ink/hooks/use-declared-cursor.js'
import type { ClickEvent } from '../../ink/events/click-event.js'
import { POINTER, DOWN_ARROW, UP_ARROW, TICK } from '../../cc/figures.js'

export type ListItemProps = {
  /** Whether this item is currently focused (keyboard selection).
   *  Shows the pointer indicator (❯) when true. */
  isFocused: boolean
  /** Whether this item is selected (chosen/checked).
   *  Shows the checkmark indicator (✓) when true. */
  isSelected?: boolean
  /** The content to display for this item. */
  children: ReactNode
  /** Optional description text displayed below the main content. */
  description?: string
  /** Show a down arrow indicator instead of pointer (scroll hints). */
  showScrollDown?: boolean
  /** Show an up arrow indicator instead of pointer (scroll hints). */
  showScrollUp?: boolean
  /** Whether to apply automatic styling based on focus/selection state. */
  styled?: boolean
  /** Disabled items show dimmed text and no indicators. */
  disabled?: boolean
  /**
   * Whether this ListItem should declare the terminal cursor position.
   * Set false when a child (e.g. BaseTextInput) declares its own cursor.
   * @default true
   */
  declareCursor?: boolean
  /**
   * Mouse click handler (fullscreen mode). When provided the row becomes
   * clickable and gains a subtle hover background so the affordance is
   * visible; when absent the row renders exactly as before.
   */
  onClick?: (event: ClickEvent) => void
}

/**
 * A list item for selection UIs, mirroring Claude Code's
 * design-system/ListItem.tsx: `❯` pointer for the focused row, `✓`
 * checkmark for the selected row, description on an indented second line,
 * and CC's color states (focused = suggestion blue, selected = success
 * green).
 */
export function ListItem({
  isFocused,
  isSelected = false,
  children,
  description,
  showScrollDown,
  showScrollUp,
  styled = true,
  disabled = false,
  declareCursor,
  onClick,
}: ListItemProps): React.ReactNode {
  // Park the native terminal cursor on the pointer indicator so screen
  // readers / magnifiers track the focused item (CC behavior). (0,0) is the
  // top-left of this Box, where the pointer renders.
  const cursorRef = useDeclaredCursor({
    line: 0,
    column: 0,
    active: isFocused && !disabled && declareCursor !== false,
  })
  // Hover highlight only when the row is actually clickable — the extra
  // background is the mouse affordance (there is no cursor-shape feedback
  // in a terminal).
  const [hovered, setHovered] = useState(false)
  const clickable = Boolean(onClick) && !disabled

  function renderIndicator(): ReactNode {
    if (disabled) {
      return <Text> </Text>
    }
    if (isFocused) {
      return <Text color="suggestion">{POINTER}</Text>
    }
    if (showScrollDown) {
      return <Text dimColor>{DOWN_ARROW}</Text>
    }
    if (showScrollUp) {
      return <Text dimColor>{UP_ARROW}</Text>
    }
    return <Text> </Text>
  }

  function getTextColor(): 'success' | 'suggestion' | 'inactive' | undefined {
    if (disabled) return 'inactive'
    if (!styled) return undefined
    if (isSelected) return 'success'
    if (isFocused) return 'suggestion'
    return undefined
  }

  // Windowed lists (ModelPicker/History/Rewind/Select) slice by a fixed row
  // height: string content must always occupy exactly one row — flatten
  // embedded newlines (history commands can carry \n) and truncate on
  // overflow instead of wrapping, otherwise an item spanning multiple rows
  // crops the focus row out of the floater. Flattening must recurse through
  // Fragments/arrays: ThemePicker's label is a Fragment wrapping the user's
  // displayName, and customTheme lets displayName keep internal newlines —
  // without recursion, a 'Foo\nBar' inside a Fragment still renders as two
  // rows. A non-Fragment element (e.g. the caller's own <Text>) is left
  // as-is — its subtree height is the caller's responsibility.
  const flatChildren = flattenDeep(children)

  return (
    <Box
      ref={cursorRef}
      flexDirection="column"
      onClick={clickable ? onClick : undefined}
      onMouseEnter={clickable ? () => setHovered(true) : undefined}
      onMouseLeave={clickable ? () => setHovered(false) : undefined}
      backgroundColor={clickable && hovered ? 'userMessageBackgroundHover' : undefined}
    >
      {/* 行高恒 1、不压缩、溢出隐藏：压边换行会把每个列表项膨胀成 2 个
          屏幕行，与 listWindow 按每项申报的高度失配——浮层顶行被裁、真
          终端上换行泄入 scrollback 使行寻址错位、翻页错位累加（#396）。
          选中 ✓ 仍作为独立列保留：行容器溢出隐藏后，长名截断不会因尾部
          ✓ 把整行撑成两行，且 ✓ 不会被 truncate-end 截掉（与 e43021a
          边框行加固同族）。 */}
      <Box flexDirection="row" gap={1} height={1} flexShrink={0} overflow="hidden" width="100%">
        {renderIndicator()}
        {styled ? (
          <Text color={getTextColor()} dimColor={disabled} wrap="truncate-end">
            {flatChildren}
          </Text>
        ) : (
          flatChildren
        )}
        {isSelected && !disabled && <Text color="success">{TICK}</Text>}
      </Box>
      {description && (
        <Box paddingLeft={2}>
          <Text color="inactive" wrap="truncate">
            {flattenLine(description)}
          </Text>
        </Box>
      )}
    </Box>
  )
}

/** Single-lines a string: embedded newlines collapse to a space (leading/trailing newlines vanish along with it). */
function flattenLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ')
}

/**
 * Recursively single-lines: strings flatten directly; arrays recurse
 * element by element; a Fragment is a transparent structural wrapper, so
 * recursion continues into its children (key/props preserved). Any other
 * element is left as-is. Arrays must go through React.Children.map, not a
 * plain map — the latter turns static JSX children into a keyless dynamic
 * array, which reliably triggers a React key warning on /theme (whose label
 * contains a Fragment).
 */
function flattenDeep(node: ReactNode): ReactNode {
  if (typeof node === 'string') return flattenLine(node)
  if (Array.isArray(node)) return React.Children.map(node, flattenDeep)
  if (React.isValidElement(node) && node.type === React.Fragment) {
    const frag = node as React.ReactElement<{ children?: ReactNode }>
    return React.cloneElement(frag, undefined, flattenDeep(frag.props.children))
  }
  return node
}
