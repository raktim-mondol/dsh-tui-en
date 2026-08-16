/**
 * Common utilities for the Spinner animation: platform-dependent frame
 * character selection, RGB color interpolation, HSL hue to RGB conversion,
 * and parsing/memoizing `rgb(...)` color strings. These pure functions are
 * reused by the Spinner component and several loading/decoration elements.
 */

export type RGBColor = { r: number; g: number; b: number }

/** Ghostty-terminal-only frame sequence: a star glyph that grows each frame, ending on a solid star. */
const GHOSTTY_FRAME_SET = ['·', '✢', '✳', '✶', '✻', '*']
/** macOS frame sequence: the final frame swaps to an eight-point star. */
const MACOS_FRAME_SET = ['·', '✢', '✳', '✶', '✻', '✽']
/** Default frame sequence for every other platform: the third frame uses a plain asterisk. */
const FALLBACK_FRAME_SET = ['·', '✢', '*', '✶', '✻', '✽']

/**
 * Returns the spinner frame-character sequence for the current terminal/platform.
 * Each call returns an independent array — callers can hold onto or mutate it safely, with no cross-call interference.
 */
export function getDefaultCharacters(): string[] {
  if (process.env.TERM === 'xterm-ghostty') {
    return [...GHOSTTY_FRAME_SET]
  }
  return process.platform === 'darwin'
    ? [...MACOS_FRAME_SET]
    : [...FALLBACK_FRAME_SET]
}

/**
 * Linearly interpolates between two colors by factor t (t ∈ [0, 1]),
 * rounding each component to an integer before returning.
 */
export function interpolateColor(
  color1: RGBColor,
  color2: RGBColor,
  t: number,
): RGBColor {
  const blend = (from: number, to: number): number =>
    Math.round(from + (to - from) * t)
  return {
    r: blend(color1.r, color2.r),
    g: blend(color1.g, color2.g),
    b: blend(color1.b, color2.b),
  }
}

/**
 * Formats an RGB object as an `rgb(r,g,b)` string, for use with Ink's Text component.
 */
export function toRGBColor(color: RGBColor): string {
  return `rgb(${color.r},${color.g},${color.b})`
}

/**
 * Computes the base RGB components for a hue within its one of six sectors (before adding the lightness offset).
 * Sectors are 60° each: red → yellow → green → cyan → blue → magenta → red.
 */
function hueSector(
  hue: number,
  chroma: number,
  secondary: number,
): [number, number, number] {
  if (hue < 60) return [chroma, secondary, 0]
  if (hue < 120) return [secondary, chroma, 0]
  if (hue < 180) return [0, chroma, secondary]
  if (hue < 240) return [0, secondary, chroma]
  if (hue < 300) return [secondary, 0, chroma]
  return [chroma, 0, secondary]
}

/**
 * Converts a hue angle (in degrees) to an RGB color.
 * Uses a fixed HSL saturation of 0.7 and lightness of 0.6 (the wave
 * animation's color baseline); the hue is normalized to [0, 360) first, so
 * any angle — negative or past a full turn — converts safely.
 */
export function hueToRgb(hue: number): RGBColor {
  const wrapped = ((hue % 360) + 360) % 360
  const saturation = 0.7
  const lightness = 0.6
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const secondary = chroma * (1 - Math.abs(((wrapped / 60) % 2) - 1))
  const luminanceOffset = lightness - chroma / 2
  const [r, g, b] = hueSector(wrapped, chroma, secondary)
  return {
    r: Math.round((r + luminanceOffset) * 255),
    g: Math.round((g + luminanceOffset) * 255),
    b: Math.round((b + luminanceOffset) * 255),
  }
}

/** Matches `rgb(r,g,b)` text, allowing arbitrary whitespace around components. */
const RGB_STRING_PATTERN = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/

/** Memoizes parse results by input string, so repeated calls skip the regex match. */
const rgbParseCache = new Map<string, RGBColor | null>()

/**
 * Parses an `rgb(r,g,b)` color string; returns null on malformed input.
 * The parse result for a given input is cached (null included), so
 * subsequent lookups are free.
 */
export function parseRGB(colorStr: string): RGBColor | null {
  const remembered = rgbParseCache.get(colorStr)
  if (remembered !== undefined) return remembered

  const parts = colorStr.match(RGB_STRING_PATTERN)
  const parsed = parts
    ? {
        r: parseInt(parts[1]!, 10),
        g: parseInt(parts[2]!, 10),
        b: parseInt(parts[3]!, 10),
      }
    : null
  rgbParseCache.set(colorStr, parsed)
  return parsed
}
