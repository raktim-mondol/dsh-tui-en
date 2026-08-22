/** The three-act timeline (ms): full sweep length, label start (wave reaches the middle), label brighten, fade start/end. Shared by the border sweep and the input-row label badge. */
export const IGNITION_TIMELINE = {
  sweepMs: 1000,
  labelStartMs: 600,
  labelBrightenMs: 160,
  fadeStartMs: 1500,
  fadeEndMs: 2000,
} as const

/**
 * Effort ignition motion math — pure functions, zero dependencies.
 *
 * Waveform semantics ported from Codex CLI's effort_ignition(_styles).rs
 * (openai/codex PR #34365) and revalidated in a dsh-TUI integration: a
 * cosine-bell travelling wave produces per-column colours only — a renderer
 * that keeps glyphs constant and changes colours per frame stays SGR-only
 * by construction.
 *
 * Consumers ride the FOREGROUND channel (a constant block glyph under a
 * varying fg colour): pure-background cells never reached the terminal in
 * the fullscreen log-update pipeline, while foreground is the channel every
 * live element already rides.
 */
import type { RGBColor } from '../components/Spinner/spinnerUtils.js'
import { rgbString } from './motion.js'

/** Full sweep length (ms), used only to convert wall-clock time into animation seconds — creates no timer. */
export const SWEEP_TOTAL_MS = 1000

/** Wave-shape width parameter (columns). */
const WAVE_HALF_WIDTH = 14

/** Wave-shape parameters: `[launch, travel]` (seconds) — when the sweep starts, and how long it takes to reach the right edge. */
const BAND: readonly [number, number] = [0.1, 0.75]

/**
 * The bright color palette: three hues — bright blue/cyan/purple (a
 * darkened variant on light backgrounds, since bright colors have no
 * contrast on a light background). The wave only lights up hues[0]; the
 * first two hues are reserved for a future multi-band style.
 */
const HUES_DARK: readonly [RGBColor, RGBColor, RGBColor] = [
  { r: 130, g: 185, b: 255 },
  { r: 140, g: 252, b: 248 },
  { r: 195, g: 172, b: 255 },
]
const HUES_LIGHT: readonly [RGBColor, RGBColor, RGBColor] = [
  { r: 30, g: 95, b: 235 },
  { r: 10, g: 160, b: 200 },
  { r: 120, g: 80, b: 235 },
]

/**
 * The band's base color (the target color the wave fades toward the
 * terminal's resting background). An approximation: a representative
 * value for the theme's dark/light background rather than reading each
 * theme individually — the wave lives for only one second, and the color
 * difference is imperceptible at low alpha.
 */
const BAND_DARK: RGBColor = { r: 27, g: 30, b: 40 }
const BAND_LIGHT: RGBColor = { r: 240, g: 240, b: 242 }

export function ignitionHues(onLight: boolean): readonly [RGBColor, RGBColor, RGBColor] {
  return onLight ? HUES_LIGHT : HUES_DARK
}

/**
 * The charge color pair (used for prefix emphasis): from the band's base
 * color's dim end to full value, sharing hues[0] with the wave.
 */
export function accentRamp(onLight: boolean): { dim: RGBColor; full: RGBColor } {
  const band = onLight ? BAND_LIGHT : BAND_DARK
  return { dim: blend(band, ignitionHues(onLight)[0], 0.45), full: ignitionHues(onLight)[0] }
}

/** Cosine bell: `crest(0)=1`, `crest(±1)=0`, 0 outside that range (a
 * negative distance is silenced the same way — existing callers all pass
 * `Math.abs`, this is a guard against a future caller getting full
 * intensity by accident). */
export function crest(distance: number): number {
  if (distance >= 1 || distance <= -1) return 0
  return 0.5 * (1 + Math.cos(Math.PI * distance))
}

/** ease-out cubic: `1-(1-p)³`, clamped at both ends. */
export function easeOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  const inverse = 1 - p
  return 1 - inverse * inverse * inverse
}

/** ease-in-out cubic: `4p³` for the first half, mirrored for the second, clamped at both ends. */
export function easeInOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  if (p < 0.5) return 4 * p * p * p
  const inverse = -2 * p + 2
  return 1 - (inverse * inverse * inverse) / 2
}

/** Samples a single column against the wave band: three hue weights (unnormalized; a single wave only lights up hue[0]). */
function sampleColumn(elapsed: number, column: number, width: number): [number, number, number] {
  const weights: [number, number, number] = [0, 0, 0]
  const [launch, travel] = BAND
  const progress = (elapsed - launch) / travel
  if (progress < 0 || progress > 1) return weights
  const center = easeInOutCubic(progress) * (width + 2 * WAVE_HALF_WIDTH) - WAVE_HALF_WIDTH
  weights[0] = crest(Math.abs(column - center) / WAVE_HALF_WIDTH)
  return weights
}

/** Linear color blend (t=0 → a, t=1 → b, not clamped). */
export function blend(a: RGBColor, b: RGBColor, t: number): RGBColor {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

/**
 * The whole row's colors at a given instant of the sweep.
 *
 * @param options.elapsedMs - Time since trigger; once it reaches
 *   {@link SWEEP_TOTAL_MS}, the whole row returns an empty array (no wave,
 *   the row is back to its resting state).
 * @param options.width - The row's column count (terminal width).
 * @param options.onLight - Use the light-background palette and band base
 *   color on a light theme.
 * @returns Per-column colors (`rgb(r,g,b)` strings); a column with no wave
 *   is `undefined`, and the renderer should output the resting color there
 *   to keep the row width constant.
 */
export function ignitionLineColors(options: {
  elapsedMs: number
  width: number
  onLight: boolean
}): ReadonlyArray<string | undefined> {
  const { elapsedMs, width, onLight } = options
  const elapsed = elapsedMs / 1000
  const total = SWEEP_TOTAL_MS / 1000
  if (width <= 0 || !Number.isFinite(elapsed) || elapsed <= 0 || elapsed >= total) return []
  const hue = ignitionHues(onLight)[0]
  const band = onLight ? BAND_LIGHT : BAND_DARK
  const colors: Array<string | undefined> = new Array(width)
  for (let column = 0; column < width; column++) {
    const weight = sampleColumn(elapsed, column, width)[0]
    if (weight <= 0.01) {
      colors[column] = undefined
      continue
    }
    // The wave fades into the band's base color by intensity: alpha=1 is
    // pure hue, alpha→0 converges back to the resting color; at the top
    // tier, full intensity outputs pure hue directly. Channels are
    // quantized to steps of 8 before output — gradient columns can then
    // merge into longer runs (dropping the renderer's RLE segment count by
    // an order of magnitude), and an 8/256 color difference is
    // imperceptible at terminal-cell resolution.
    const tinted = blend(band, hue, Math.min(weight, 1))
    colors[column] = rgbString({
      r: Math.round(tinted.r / 8) * 8,
      g: Math.round(tinted.g / 8) * 8,
      b: Math.round(tinted.b / 8) * 8,
    })
  }
  return colors
}

/**
 * Determines whether the current change enters the top tier: switching
 * from "already on some tier" to "a different tier", where the new tier
 * is the last (top) entry in the tier table. A cold mount restoring a
 * preference, a single-tier table, or an unknown tier table never
 * triggers this.
 */
export function entersTopTier(
  previous: string | undefined,
  current: string | undefined,
  levels: readonly string[] | undefined,
): boolean {
  return (
    current !== undefined &&
    previous !== undefined &&
    current !== previous &&
    levels !== undefined &&
    levels.length > 1 &&
    current === levels[levels.length - 1]
  )
}

/** Charge duration (ms) and charge progress (clamped to [0,1]; a negative elapsed clamps to 0). */
export const CHARGE_MS = 150

export function chargeProgress(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) return 0
  return Math.min(1, Math.max(0, Math.max(0, elapsedMs) / CHARGE_MS))
}
