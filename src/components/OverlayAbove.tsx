import React from 'react'
import { Box } from '../ui.js'

/**
 * A floater container for transient panels: absolute positioning +
 * bottom:'100%' pins the panel's bottom edge to its anchor's (parent's) top
 * edge, covering the transcript's tail rows from above, while occupying
 * **zero layout height** of its own.
 *
 * Why this is necessary: in inline mode the whole frame is the content
 * height. If a transient panel (picker/completion/dialog) mounted in-flow,
 * the frame height would grow along with it — terminal scrolling pushes the
 * frame's top rows (splash, history) into scrollback, and the shrinking
 * redraw when the panel closes rewrites those same rows back into the
 * viewport, leaving one copy in scrollback and another in the viewport
 * (reported on real machines as "an extra splash frame every /model
 * switch"). A floater only rewrites the cell content of existing rows
 * (frame height never changes, zero scrolling, zero duplication) and writes
 * back unchanged on close — no repeats anywhere in the flow.
 *
 * Precedent: PromptInput's notification row (position=absolute marginTop={-1}).
 */
export function OverlayAbove({
  children,
  maxHeight,
}: {
  children: React.ReactNode
  /** Keeps the panel from poking past the frame top when it's taller than the available area (short session + a tall list). */
  maxHeight?: number | undefined
}): React.ReactNode {
  return (
    <Box
      position="absolute"
      bottom="100%"
      left={0}
      right={0}
      flexDirection="column"
      justifyContent="flex-end"
      overflow="hidden"
      opaque
      {...(maxHeight === undefined ? {} : { maxHeight })}
    >
      {/* flexShrink={0}: when content overflows, overflow clips whole rows
          from the top instead of yoga squeezing some middle row to zero
          height (a squeezed zero-height row gets skipped by the renderer,
          silently dropping a row in the middle of the list and shifting
          everything below it up — with 30 models this made the focus row
          vanish). */}
      <Box flexDirection="column" flexShrink={0}>
        {children}
      </Box>
    </Box>
  )
}
