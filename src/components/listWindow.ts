/**
 * A focus-centered list window: a long list renders only the slice around
 * the focus item, so the focused row stays visible. Once a transient panel
 * goes through OverlayAbove's zero-height floater, the overflowing part gets
 * clipped and the focus item can land in the clipped region (a 30-row
 * terminal with 30 models put focus at index 0 completely off-screen) —
 * windowing is a hard requirement.
 *
 * Budgeted by **rows**, not item count: a ListItem with a description takes
 * two rows (body + description), and the container may also add gap rows —
 * counting items alone crops the focus row off-screen (confirmed: with a
 * one-row description per item, index 0 was still invisible). Callers must
 * guarantee each item has a fixed row height (ListItem's string-content
 * truncation + newline flattening makes it always 1 + (description ? 1 : 0)
 * rows).
 *
 * Expansion strategy: alternately expand outward from the focus item toward
 * whichever side has used fewer cumulative rows so far (keeping focus
 * roughly centered); stop on either side once expanding it would exceed the
 * budget or hit a boundary. If the focus item itself exceeds maxRows, it's
 * still returned alone — focus visibility outranks the budget.
 *
 * @param heights - Each item's fixed row height (≥1).
 * @param focusIndex - The keyboard-focused item's index (out-of-range values clamp).
 * @param maxRows - Rows available to the list area (terminal height minus the floater reserve and panel chrome rows).
 * @param gap - Blank rows between adjacent items (the container's gap, e.g. HistorySearchDialog's 1).
 * @returns The [start, end) slice range.
 */
export function listWindow(
  heights: readonly number[],
  focusIndex: number,
  maxRows: number,
  gap = 0,
): { start: number; end: number } {
  if (heights.length === 0) return { start: 0, end: 0 }
  const focus = Math.min(Math.max(focusIndex, 0), heights.length - 1)
  let start = focus
  let end = focus + 1
  let upUsed = 0
  let downUsed = 0
  for (;;) {
    const up = start > 0 ? gap + heights[start - 1]! : Number.POSITIVE_INFINITY
    const down = end < heights.length ? gap + heights[end]! : Number.POSITIVE_INFINITY
    const used = heights[focus]! + upUsed + downUsed
    const canUp = used + up <= maxRows
    const canDown = used + down <= maxRows
    if (!canUp && !canDown) return { start, end }
    if (canUp && (!canDown || upUsed <= downUsed)) {
      start -= 1
      upUsed += up
    } else {
      end += 1
      downUsed += down
    }
  }
}
