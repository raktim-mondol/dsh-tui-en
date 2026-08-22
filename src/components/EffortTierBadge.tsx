/**
 * EffortTierBadge — the tier-name badge at the end of the input row: the
 * carrier for act two of the three-act ignition (on the same timeline and
 * trigger as EffortInputBorder's dual-border sweep). When switching to
 * the top reasoning-effort tier, as the light band reaches the middle,
 * the input row's center surfaces the tier name (uppercase, letter
 * spacing decelerating from 10 spaces down to 1 — rounding the continuous
 * position per letter guarantees movement every frame, bright blue bold,
 * fading in from dim), then fades out and yields along with the rest of
 * the overlay — the row count stays constant, and at rest it renders
 * nothing at all; it's hidden whenever the input row has text (never
 * covers content).
 *
 * The trigger check runs at render time (the props-change-adjustment
 * pattern, the same one the border/charge components use); a cold mount
 * restoring a preference, a single-tier table, no tier table, or no
 * shared clock all skip it. The clock reuses Ink core's shared clock,
 * subscribing only during the animation window (keepAlive), resetting to
 * zero once it ends.
 */
import React, { useContext, useEffect, useReducer, useState } from 'react'
import { Text } from '../ui.js'
import { ClockContext } from '../ink/components/ClockContext.js'
import { rgbString } from '../trajectory/motion.js'
import type { RGBColor } from './Spinner/spinnerUtils.js'
import { IGNITION_TIMELINE, ignitionHues } from '../trajectory/effortIgnition.js'

type Overlay = { label: string; startedAtMs: number }

/** Letter-spacing convergence: decelerates from 10 spaces down to 1 (ease-out, fast start, slow settle). */
const GAP_START = 10
const GAP_END = 1
const CONVERGE_MS = 500

export function EffortTierBadge({
  effort,
  levels,
  onLight,
  columns,
  leadingColumns,
}: {
  /** The current reasoning-effort tier id; `undefined` means the route declares none. */
  effort: string | undefined
  /** The current route's tier table (low → high, last entry is the top tier); pass `undefined` when unknown. */
  levels: readonly string[] | undefined
  onLight: boolean
  /** Terminal column count — the centering anchor is computed from the terminal's geometric center (a plain text flow, no nested Box). */
  columns: number
  /** Columns already occupied on this row before the badge's text flow
   *  (the ❯ prefix, block cursor, etc.) — must be subtracted when
   *  converting the center into a column within the badge's own flow,
   *  otherwise the whole thing shifts right by one prefix width. */
  leadingColumns: number
}): React.ReactNode {
  const clock = useContext(ClockContext)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [prevEffort, setPrevEffort] = useState(effort)
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0)

  // Render-time trigger (same pattern as the border/charge components): the first frame of an effort change renders in the new state.
  if (effort !== prevEffort) {
    setPrevEffort(effort)
    if (
      clock !== null &&
      effort !== undefined &&
      levels !== undefined &&
      levels.length > 1 &&
      effort === levels[levels.length - 1]
    ) {
      setOverlay({ label: effort.toUpperCase(), startedAtMs: clock.now() })
    }
  }

  const elapsedMs =
    overlay === null ? Infinity : Math.max(0, (clock?.now() ?? Date.now()) - overlay.startedAtMs)
  useEffect(() => {
    if (overlay === null || clock === null) return
    return clock.subscribe(() => forceRender(), /* keepAlive */ true)
  }, [overlay, clock])
  useEffect(() => {
    if (overlay !== null && elapsedMs >= IGNITION_TIMELINE.fadeEndMs) setOverlay(null)
  }, [overlay, elapsedMs])

  if (overlay === null || elapsedMs < IGNITION_TIMELINE.labelStartMs) return null
  const brighten = Math.min(1, (elapsedMs - IGNITION_TIMELINE.labelStartMs) / IGNITION_TIMELINE.labelBrightenMs)
  const fade =
    elapsedMs < IGNITION_TIMELINE.fadeStartMs
      ? 1
      : Math.max(0, 1 - (elapsedMs - IGNITION_TIMELINE.fadeStartMs) / (IGNITION_TIMELINE.fadeEndMs - IGNITION_TIMELINE.fadeStartMs))
  const alpha = brighten * fade
  if (alpha <= 0) return null
  const band: RGBColor = onLight ? { r: 240, g: 240, b: 242 } : { r: 27, g: 30, b: 40 }
  // Bright blue: the accent mixed with 35% white to brighten it (the highlight look the user signed off on).
  const hue = ignitionHues(onLight)[0]
  const whiten = (x: number): number => Math.round(x + (255 - x) * 0.35)
  const bright: RGBColor = { r: whiten(hue.r), g: whiten(hue.g), b: whiten(hue.b) }
  const mix = (x: number, y: number): number => Math.round(x + (y - x) * alpha)
  const color = rgbString({ r: mix(band.r, bright.r), g: mix(band.g, bright.g), b: mix(band.b, bright.b) })
  // Letter-spacing convergence (Codex's converge semantics): the spacing
  // is a continuous float, and letter positions shrink symmetrically
  // **anchored on the row's center** — pos_i = center + (i-(n-1)/2)·(1+gap),
  // so left/right letters each move half the distance toward the center
  // (an odd-length tier name's middle letter stays put), and the two
  // sides naturally move at the same speed; each letter independently
  // rounds its continuous position to a column, so different letters
  // cross a grid cell on different frames and at least one is always
  // moving (rounding the spacing as a whole would make the ease-out's
  // slow tail sit for hundreds of milliseconds between grid crossings,
  // which reads as stutter). The curve blends in 15% linear to keep a
  // floor speed in the tail.
  const progress = Math.min(1, Math.max(0, (elapsedMs - IGNITION_TIMELINE.labelStartMs) / CONVERGE_MS))
  // Evening out the jump interval: if "deceleration" on a discrete grid
  // were implemented by letting the curve's derivative approach zero, the
  // tail would sit for dozens of frames without crossing a cell and then
  // suddenly jump (the source of the stutter feel). Using 90% linear +
  // 10% easeOutQuad for a gentle tail instead — the jump interval stays
  // roughly constant throughout (~55ms/cell), with only a slight slowdown
  // at the very end, so the terminal reads as a smooth, even convergence.
  const eased = 1 - progress
  const easedWithFloor = 0.9 * eased + 0.1 * (1 - progress * progress)
  const gapF = GAP_END + (GAP_START - GAP_END) * easedWithFloor
  const letterCount = overlay.label.length
  // The anchor is the **terminal's geometric center** (not the center of
  // the available area after the ❯/cursor — that would shift everything
  // right by about 1.5 cells; the available area starts on the left, and
  // its "midpoint" doesn't account for the left-side occupancy). Left and
  // right letters are strictly mirrored — Math.round always rounds .5 up,
  // and asymmetric rounding between the positive/negative directions
  // would desync the moments they cross a grid cell; a left letter's
  // column is derived by mirroring the right letter's rounded result
  // (2C − col), so an M/X pair jumps in opposite directions on the same
  // frame, staying symmetric around the terminal center throughout.
  const C = Math.round((columns - 1) / 2) - leadingColumns
  let spaced = ''
  let column = 0
  for (let i = 0; i < letterCount; i++) {
    const off = (i - (letterCount - 1) / 2) * (1 + gapF)
    const at =
      off >= 0
        ? Math.round(C + off)
        : 2 * C - Math.round(C - off)
    spaced += ' '.repeat(Math.max(0, at - column)) + overlay.label[i]!
    column = at + 1
  }
  return (
    <Text bold color={color} wrap="truncate-end">
      {spaced}
    </Text>
  )
}
