/**
 * EffortChargeGlyph — top-tier emphasis and charge animation for the
 * input-prompt prefix `❯ `.
 *
 * While the reasoning-effort tier sits at the current route's top tier, the
 * prefix switches to the ignition accent color (bold, sharing hues[0] with
 * the ignition wave — at any given instant the prefix and the wave are the
 * same orange); the instant it switches onto the top tier, it plays a
 * 150ms "charge" gradient (accentRamp's dim end → full value). A cold
 * mount that's already at the top tier does not charge (charging only
 * happens on the switch itself); leaving the top tier restores the
 * ordinary dim behavior.
 *
 * The trigger check runs at render time (React's official "adjust state
 * from prop changes" pattern, the same one EffortInputBorder uses) —
 * putting it in an effect would land a frame late, so the first frame of
 * an effort change would flash fully lit and only fall back to the dim
 * end on the next frame. Charging only animates color, the glyph is
 * always `❯ `, so the SGR-only rule holds naturally.
 *
 * The clock reuses Ink core's shared clock, and only subscribes during
 * that 150ms while the charge is incomplete; the steady state has zero
 * timers and zero re-renders, and the prefix color is a memoized constant.
 */
import React, { useContext, useEffect, useReducer, useState } from 'react'
import { Text, useTheme } from '../ui.js'
import { ClockContext } from '../ink/components/ClockContext.js'
import { accentRamp } from '../trajectory/effortIgnition.js'
import { rgbString } from '../trajectory/motion.js'
import { interpolateColor } from './Spinner/spinnerUtils.js'
import { isLightThemeActive } from '../theme.js'

/** Charge duration (ms). */
const CHARGE_MS = 150

export function EffortChargeGlyph({
  effort,
  levels,
  working,
}: {
  /** The current reasoning-effort tier id; `undefined` means the route declares none. */
  effort: string | undefined
  /** The current route's tier table (low → high, last entry is the top tier). */
  levels: readonly string[] | undefined
  /** While the model is working, the prefix stays dimmed as before (existing behavior). */
  working: boolean
}): React.ReactNode {
  const clock = useContext(ClockContext)
  const [themeName] = useTheme()
  const [chargeStartedAt, setChargeStartedAt] = useState<number | null>(null)
  const [prevEffort, setPrevEffort] = useState(effort)
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0)

  const topActive =
    effort !== undefined && levels !== undefined && levels.length > 1 && effort === levels[levels.length - 1]

  // Render-phase trigger (same pattern as EffortInputBorder): switching from
  // an existing tier onto the top tier starts the charge NOW, not one effect
  // later — the first frame of the new effort must not flash fully lit.
  // Cold mounts enter the steady state directly; without a shared clock
  // (headless embeds) there is no charge either — no frames would ever arrive.
  if (effort !== prevEffort) {
    setPrevEffort(effort)
    if (topActive && clock !== null) {
      setChargeStartedAt(clock.now())
    }
  }

  // Only the 150ms charge window subscribes to the shared clock; steady
  // state has zero timers and zero re-renders.
  const chargeElapsed =
    chargeStartedAt === null
      ? Infinity
      : // Clamp at zero: the shared clock can hand back a stale tickTime for
        // one frame after waking from pause.
        Math.max(0, (clock?.now() ?? Date.now()) - chargeStartedAt)
  const charging = chargeElapsed < CHARGE_MS
  useEffect(() => {
    if (!charging || clock === null) return
    return clock.subscribe(() => forceRender(), /* keepAlive */ true)
  }, [charging, clock])

  if (!topActive) return <Text dimColor={working}>❯ </Text>
  const ramp = accentRamp(isLightThemeActive(themeName))
  if (!charging) {
    // Steady state re-derives on every render (two allocations + one blend
    // per keystroke — negligible) instead of caching: a cached colour would
    // go stale across a light/dark theme flip while the tier stays active.
    const color = rgbString(ramp.full)
    return (
      <Text bold color={color} dimColor={working}>
        ❯{' '}
      </Text>
    )
  }
  const charge = Math.min(1, chargeElapsed / CHARGE_MS)
  return (
    <Text bold color={rgbString(interpolateColor(ramp.dim, ramp.full, charge))} dimColor={working}>
      ❯{' '}
    </Text>
  )
}
