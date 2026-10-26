// Background patterns: tablecloth-style textures laid over the board color.
//
// Each pattern is drawn with CSS gradients (no image files), tinted with a
// single user-chosen color at low opacity, so it works with any theme and
// can never swamp the text on top of it. Client-safe, no dependencies.
//
// Applied (see app/globals.css) to the page and to every board-colored
// surface, with `background-attachment: fixed` so the pattern lines up
// seamlessly across nested surfaces. Panels, cards and inputs stay solid.

export interface PatternDef {
  readonly key: string;
  readonly label: string;
  /** builds the CSS from an "r, g, b" string */
  readonly css: (rgb: string) => { image: string; size: string; position: string };
}

const a = (rgb: string, alpha: number) => `rgba(${rgb}, ${alpha})`;

export const PATTERN_OPTIONS = [
  {
    key: "none",
    label: "Plain",
    css: () => ({ image: "none", size: "auto", position: "0 0" }),
  },
  {
    // two sets of half-width bands crossing: where they overlap the tint
    // doubles, which is what makes a gingham tablecloth
    key: "gingham",
    label: "Gingham",
    css: (rgb) => ({
      image: `linear-gradient(90deg, ${a(rgb, 0.24)} 50%, transparent 50%), linear-gradient(0deg, ${a(rgb, 0.24)} 50%, transparent 50%)`,
      size: "44px 44px",
      position: "0 0",
    }),
  },
  {
    key: "checkerboard",
    label: "Checkerboard",
    css: (rgb) => ({
      image: `conic-gradient(${a(rgb, 0.22)} 25%, transparent 0 50%, ${a(rgb, 0.22)} 0 75%, transparent 0)`,
      size: "56px 56px",
      position: "0 0",
    }),
  },
  {
    key: "polka",
    label: "Polka dots",
    css: (rgb) => ({
      image: `radial-gradient(${a(rgb, 0.26)} 20%, transparent 22%), radial-gradient(${a(rgb, 0.26)} 20%, transparent 22%)`,
      size: "34px 34px",
      position: "0 0, 17px 17px",
    }),
  },
  {
    key: "stripes",
    label: "Stripes",
    css: (rgb) => ({
      image: `repeating-linear-gradient(90deg, ${a(rgb, 0.2)} 0 16px, transparent 16px 32px)`,
      size: "auto",
      position: "0 0",
    }),
  },
  {
    // two sets of thin diagonal lines crossing — a lattice of diamonds
    key: "diamonds",
    label: "Diamonds",
    css: (rgb) => ({
      image: `repeating-linear-gradient(45deg, ${a(rgb, 0.28)} 0 2px, transparent 2px 30px), repeating-linear-gradient(-45deg, ${a(rgb, 0.28)} 0 2px, transparent 2px 30px)`,
      size: "auto",
      position: "0 0",
    }),
  },
  {
    key: "grid",
    label: "Grid",
    css: (rgb) => ({
      image: `linear-gradient(${a(rgb, 0.3)} 1px, transparent 1px), linear-gradient(90deg, ${a(rgb, 0.3)} 1px, transparent 1px)`,
      size: "32px 32px",
      position: "0 0",
    }),
  },
] as const satisfies readonly PatternDef[];

export type PatternKey = (typeof PATTERN_OPTIONS)[number]["key"];

export function isPatternKey(value: unknown): value is PatternKey {
  return typeof value === "string" && PATTERN_OPTIONS.some((p) => p.key === value);
}

/** The strongest overall tint a pattern lays over the board (0–1). Where the
 * gingham bands cross, two layers stack: 1 − (1 − a)². Used to check that
 * text stays readable on the busiest part of each pattern. */
export const PATTERN_MAX_ALPHA: Record<PatternKey, number> = {
  none: 0,
  gingham: 1 - (1 - 0.24) ** 2,
  checkerboard: 0.22,
  polka: 0.26,
  stripes: 0.2,
  diamonds: 0.28,
  grid: 0.3,
};

function hexToRgbString(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "255, 255, 255";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** The CSS values for a pattern tinted with `hex`. */
export function patternCss(key: string, hex: string): { image: string; size: string; position: string } {
  const def = PATTERN_OPTIONS.find((p) => p.key === key) ?? PATTERN_OPTIONS[0];
  return def.css(hexToRgbString(hex));
}
