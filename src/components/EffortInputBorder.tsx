/**
 * EffortInputBorder — the three-act ignition overlay on the input-box
 * border (matching Codex's full semantics: a light sweep, the tier label
 * surfacing, then an overall fade).
 *
 * The input box only has top/bottom horizontal border lines (round, no
 * left/right) — this component self-draws those two rows, carrying the
 * animation **in sync**; the tier label is briefly shown by
 * EffortTierBadge at the end of the input row (see PromptInput), and the
 * row count stays constant throughout the animation. When switching to
 * the top reasoning-effort tier:
 *
 *   1. Sweep [0, 1s) — a bright colored band travels left to right along
 *      the top/bottom borders in sync (the wave shape shifts color column
 *      by column); the input box remains fully usable throughout;
 *   2. Tier label [600ms, ~1.1s) — as the band reaches the middle, the
 *      input row's center surfaces the uppercase tier name (bold, fading
 *      in from dim, letter-spacing tightening — see EffortTierBadge);
 *   3. Fade [1.5s, 2s) — the label and the light color fade out together
 *      toward the theme color, hitting zero on the last frame: at rest,
 *      the top/bottom borders are just the original theme color, with
 *      nothing extra in the content area.
 *
 * Glyph changes are limited to the label row appearing/yielding (a
 * one-time change); every other frame-to-frame change is just the
 * foreground color of the existing `─`. The trigger check runs at render
 * time (the props-change-adjustment pattern); it only fires switching
 * from "already on some tier" onto the tier table's last (top) entry —
 * a cold mount restoring a preference, a single-tier table, no tier
 * table, or no shared clock all skip it. The clock reuses Ink core's
 * shared clock, subscribing only during the animation window
 * (keepAlive), returning to a zero-overhead static border once it ends.
 */
import React, { useContext, useEffect, useReducer, useRef, useState } from 'react'
import { Box, Text } from '../ui.js'
import { ClockContext } from '../ink/components/ClockContext.js'
import type { Color } from '../ink/styles.js'
import type { Theme } from '../theme.js'
import { IGNITION_TIMELINE, ignitionLineColors } from '../trajectory/effortIgnition.js'

type Overlay = { label: string; startedAtMs: number }

/** A border row (top/bottom share the same color-run sequence — synced color changes). */
function BorderRow({
  left,
  right,
  runs,
  idleColor,
}: {
  left: string
  right: string
  runs: ReadonlyArray<{ glyph: string; color: keyof Theme | Color }>
  idleColor: keyof Theme | Color
}): React.ReactNode {
  return (
    <Box width="100%" height={1} flexShrink={0} overflow="hidden">
      <Text wrap="truncate-end">
        <Text color={idleColor}>{left}</Text>
        {runs.map((run, i) => (
          <Text key={i} color={run.color}>
            {run.glyph}
          </Text>
        ))}
        <Text color={idleColor}>{right}</Text>
      </Text>
    </Box>
  )
}

export function EffortInputBorder({
  effort,
  levels,
  columns,
  onLight,
  idleColor,
  children,
}: {
  /** The current reasoning-effort tier id; `undefined` means the route declares none. */
  effort: string | undefined
  /** The current route's tier table (low → high, last entry is the top tier); pass `undefined` when unknown. */
  levels: readonly string[] | undefined
  columns: number
  onLight: boolean
  /** The resting border color (a theme token name, e.g. 'promptBorder' / 'planMode'). */
  idleColor: keyof Theme | Color
  children: React.ReactNode
}): React.ReactNode {
  const clock = useContext(ClockContext)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [prevEffort, setPrevEffort] = useState(effort)
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0)

  // Render-time trigger: the first frame of an effort change renders in the new state (an effect would land a frame late).
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

  // Subscribes to the shared clock only during the animation window; the resting border has zero timers and zero re-renders.
  const elapsedMs =
    overlay === null ? Infinity : Math.max(0, (clock?.now() ?? Date.now()) - overlay.startedAtMs)
  useEffect(() => {
    if (overlay === null || clock === null) return
    return clock.subscribe(() => forceRender(), /* keepAlive */ true)
  }, [overlay, clock])
  useEffect(() => {
    if (overlay !== null && elapsedMs >= IGNITION_TIMELINE.fadeEndMs) setOverlay(null)
  }, [overlay, elapsedMs])

  const midWidth = Math.max(0, columns - 2)
  const sweepColors =
    overlay !== null && elapsedMs < IGNITION_TIMELINE.sweepMs && midWidth > 0
      ? ignitionLineColors({ elapsedMs, width: midWidth, onLight })
      : []
  // Color-run sequence shared by top/bottom (in sync): swept columns take the wave color, the rest fall back to the theme color.
  const runs: Array<{ glyph: string; color: keyof Theme | Color }> = []
  for (let index = 0; index < midWidth; index++) {
    const color = sweepColors[index] as keyof Theme | Color | undefined ?? idleColor
    const last = runs[runs.length - 1]
    if (last !== undefined && last.color === color) last.glyph += '─'
    else runs.push({ glyph: '─', color })
  }

  return (
    <Box
      flexDirection="column"
      alignItems="flex-start"
      justifyContent="flex-start"
      width="100%"
      flexShrink={0}
    >
      <BorderRow left="╭" right="╮" runs={runs} idleColor={idleColor} />
      <Box flexShrink={0}>{children}</Box>
      <BorderRow left="╰" right="╯" runs={runs} idleColor={idleColor} />
    </Box>
  )
}
