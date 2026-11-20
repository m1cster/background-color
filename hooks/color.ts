// Color math for turning one background color into a mode's gray anchors:
// the page, slightly lifted cards and panels, and text tinted to the same hue
// that keeps its contrast on every surface.

export type Mode = 'light' | 'dark'

export type Anchors = {
  'surface-0': string
  'surface-1': string
  'surface-2': string
  'surface-3'?: string
  'text-primary': string
  'text-secondary': string
  'text-muted': string
}

type Hsl = { h: number; s: number; l: number }

/** `#abc`, `abc`, `#aabbcc` or `aabbcc` as lowercase `#aabbcc`; undefined otherwise. */
export function normalizeHex(input: string): string | undefined {
  const raw = input.trim().replace(/^#/, '').toLowerCase()

  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  }
  if (/^[0-9a-f]{6}$/.test(raw)) {
    return `#${raw}`
  }

  return undefined
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')

  return `#${part(r)}${part(g)}${part(b)}`
}

function toHsl(hex: string): Hsl {
  const [r, g, b] = toRgb(hex).map(v => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) {
    return { h: 0, s: 0, l }
  }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number

  if (max === r) {
    h = ((g - b) / d) % 6
  } else if (max === g) {
    h = (b - r) / d + 2
  } else {
    h = (r - g) / d + 4
  }

  return { h: (h * 60 + 360) % 360, s, l }
}

function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]

  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** The color moved `step` (0 to 1) toward white in light mode or black in dark mode. */
export function towardMode(hex: string, mode: Mode, step: number): string {
  const hsl = toHsl(hex)
  const l = mode === 'light' ? Math.min(1, hsl.l + step) : Math.max(0, hsl.l - step)

  return fromHsl({ ...hsl, l })
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => {
    const c = v / 255

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]

  return (hi + 0.05) / (lo + 0.05)
}

/** The same color with its lightness raised by `amount` (0 to 1), clamped. */
function lift(hex: string, amount: number): string {
  if (amount === 0) {
    return hex
  }
  const hsl = toHsl(hex)

  return fromHsl({ ...hsl, l: Math.min(1, hsl.l + amount) })
}

/**
 * A text color in `tint`'s hue and saturation that reaches `ratio` against
 * every surface, starting from lightness `start` and walking toward black or
 * white only as far as it must.
 */
function textFor(surfaces: string[], tint: Hsl, isDarkText: boolean, start: number, ratio: number): string {
  let l = start

  for (let i = 0; i <= 100; i++) {
    const candidate = fromHsl({ h: tint.h, s: tint.s, l })

    if (surfaces.every(surface => contrast(candidate, surface) >= ratio)) {
      return candidate
    }
    l = isDarkText ? Math.max(0, l - 0.01) : Math.min(1, l + 0.01)
  }

  return isDarkText ? '#000000' : '#ffffff'
}

/**
 * A mode's gray anchors from its page color: surfaces a few percent lighter
 * than the page (each as light or lighter than the one before, as the design
 * system wants), and three text strengths that clear 7:1, 5.5:1 and 4.5:1.
 *
 * Text follows `text` where one is given (a green phosphor, an amber), its
 * secondary and muted strengths the same hue a step toward the page; else it
 * is a soft near-black or near-white tinted to the page's hue.
 */
export function anchorsFor(background: string, mode: Mode, text?: string): Anchors {
  // The design system's ramp runs one way per mode: dark text on a light page,
  // light text on a dark one.
  const isDarkText = mode === 'light'
  const steps = mode === 'light' ? [0, 0.015, 0.03] : [0, 0.025, 0.05, 0.075]
  const surfaces = steps.map(step => lift(background, step))
  let tint: Hsl
  let starts: [number, number, number]

  if (text === undefined) {
    const page = toHsl(background)
    tint = { ...page, s: Math.min(page.s, 0.22) }
    starts = isDarkText ? [0.14, 0.3, 0.4] : [0.93, 0.8, 0.68]
  } else {
    tint = toHsl(text)
    const l = tint.l
    // Each weaker strength sits a share of the way from the text toward the page.
    const page = toHsl(background).l
    starts = [l, l + (page - l) * 0.25, l + (page - l) * 0.4]
  }

  const anchors: Anchors = {
    'surface-0': surfaces[0]!,
    'surface-1': surfaces[1]!,
    'surface-2': surfaces[2]!,
    'text-primary': textFor(surfaces, tint, isDarkText, starts[0], 7),
    'text-secondary': textFor(surfaces, tint, isDarkText, starts[1], 5.5),
    'text-muted': textFor(surfaces, tint, isDarkText, starts[2], 4.5),
  }

  if (mode === 'dark') {
    anchors['surface-3'] = surfaces[3]!
  }

  return anchors
}
