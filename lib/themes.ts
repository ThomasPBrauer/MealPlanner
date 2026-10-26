import { BODY_FONT_OPTIONS, FONT_OPTIONS } from "./fonts";
import { PatternKey, isPatternKey } from "./patterns";
import type { BodyFontKey, DisplayFontKey, ThemeColors } from "./types";

// A theme is a named bundle of the two fonts and five colors a user can
// customize in Settings. Picking one copies its values into the user's own
// preferences, so they can keep tweaking from there; a later change to the
// theme doesn't silently restyle people who already picked it.
//
// This module is client-safe (no database access) — the API routes and the
// Settings UI share its rules.

export interface ThemeData {
  displayFont: DisplayFontKey;
  bodyFont: BodyFontKey;
  colors: ThemeColors;
  /** tablecloth-style texture behind the board, tinted with colors.pattern */
  pattern: PatternKey;
}

export interface ThemeSummary extends ThemeData {
  id: string;
  name: string;
  builtIn: boolean;
  isMine: boolean;
  /** display name of whoever made it — never an email address */
  ownerName: string | null;
}

export const THEME_NAME_MAX = 40;

// ---------------------------------------------------------------------------
// Built-in themes
//
// All of these are dark-board palettes on purpose. The app draws its
// borders, dividers and muted text in white/sage at low opacity, which
// vanish on a light background — so a light theme would look broken no
// matter how nice its colors are. Colors are roles, not literal names:
//   board  page background          chalk  main text on the board
//   panel  calendar/pantry surface  gold   primary accent (headings, buttons)
//   tomato secondary accent (remove / error states)
//   pattern the tint of the background pattern (only used if `pattern` isn't "none")
// Buttons put the app's fixed dark "ink" text on `gold`, so it has to stay
// light enough for that.
// ---------------------------------------------------------------------------

export const DEFAULT_THEME_NAME = "Chalkboard";

export const BUILT_IN_THEMES: readonly (ThemeData & { name: string })[] = [
  {
    name: "Chalkboard",
    displayFont: "caveat",
    bodyFont: "workSans",
    colors: { board: "#1F2A24", panel: "#26332C", gold: "#E8B04B", tomato: "#C1502E", chalk: "#F3EFE3", pattern: "#F3EFE3" },
    pattern: "none",
  },
  {
    // charcoal and champagne
    name: "Elegant",
    displayFont: "cormorant",
    bodyFont: "lora",
    colors: { board: "#1B1B24", panel: "#262632", gold: "#D9BC8C", tomato: "#D77A7A", chalk: "#F5F0E8", pattern: "#927F5C" },
    pattern: "diamonds",
  },
  {
    // dark walnut, wheat and barn red
    name: "Country",
    displayFont: "breeSerif",
    bodyFont: "lora",
    colors: { board: "#2E2118", panel: "#3B2C20", gold: "#E3B96B", tomato: "#D0644C", chalk: "#F4EBDD", pattern: "#94392E" },
    pattern: "gingham",
  },
  {
    // cocoa, buttercream and raspberry
    name: "Baker",
    displayFont: "dancingScript",
    bodyFont: "nunito",
    colors: { board: "#2B1D1A", panel: "#3A2824", gold: "#F2C6A0", tomato: "#EA7C8B", chalk: "#FFF4E6", pattern: "#B8636E" },
    pattern: "polka",
  },
  {
    // forest green and new growth
    name: "Garden",
    displayFont: "amaticSC",
    bodyFont: "lato",
    colors: { board: "#17261C", panel: "#203428", gold: "#D7E58A", tomato: "#EA7B73", chalk: "#F1F6E8", pattern: "#517347" },
    pattern: "grid",
  },
  {
    // deep sea, sand and coral
    name: "Coastal",
    displayFont: "josefinSans",
    bodyFont: "openSans",
    colors: { board: "#12232E", panel: "#1B3342", gold: "#F0D9A0", tomato: "#F08470", chalk: "#EEF5F7", pattern: "#A09777" },
    pattern: "stripes",
  },
  {
    // plum, pumpkin and cranberry
    name: "Harvest",
    displayFont: "dmSerifDisplay",
    bodyFont: "sourceSerif",
    colors: { board: "#2A1C26", panel: "#38283A", gold: "#F2A65A", tomato: "#E0605F", chalk: "#F6EBDD", pattern: "#F2A65A" },
    pattern: "none",
  },
  {
    // near-black with a cool mint accent
    name: "Midnight",
    displayFont: "poppins",
    bodyFont: "inter",
    colors: { board: "#0F1115", panel: "#191C23", gold: "#6EE7B7", tomato: "#FB7185", chalk: "#E6EAF0", pattern: "#6EE7B7" },
    pattern: "none",
  },
  {
    // teal menu board, mustard and cherry
    name: "Retro Diner",
    displayFont: "fredericka",
    bodyFont: "workSans",
    colors: { board: "#1C2B33", panel: "#26394A", gold: "#F4D35E", tomato: "#F0705F", chalk: "#FAF3DD", pattern: "#B95E54" },
    pattern: "checkerboard",
  },
];

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Trims and collapses runs of whitespace, so "  Spring   Menu " is stored
 * and shown as "Spring Menu". */
export function cleanThemeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** What two names are compared by to decide whether they're "the same".
 * Ignores case, accents and spacing, so "Café", "cafe" and " CAFE " all
 * collide — and it lines up with how MySQL's default collation treats the
 * unique index on this value, so the database and the app agree. */
export function themeNameKey(name: string): string {
  return cleanThemeName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export const BUILT_IN_KEYS: ReadonlySet<string> = new Set(BUILT_IN_THEMES.map((t) => themeNameKey(t.name)));

// ---------------------------------------------------------------------------
// Comparing and validating
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const COLOR_KEYS = ["board", "panel", "gold", "tomato", "chalk"] as const;
const DEFAULT_PATTERN_TINT = "#f3efe3";

/** True when two themes would look identical (hex case doesn't matter). */
export function themeMatches(a: ThemeData, b: ThemeData): boolean {
  return (
    a.displayFont === b.displayFont &&
    a.bodyFont === b.bodyFont &&
    a.pattern === b.pattern &&
    COLOR_KEYS.every((k) => a.colors[k].toLowerCase() === b.colors[k].toLowerCase()) &&
    // the tint only matters when there is a pattern to tint
    (a.pattern === "none" || a.colors.pattern.toLowerCase() === b.colors.pattern.toLowerCase())
  );
}

export function isDisplayFontKey(value: unknown): value is DisplayFontKey {
  return typeof value === "string" && FONT_OPTIONS.some((f) => f.key === value);
}

export function isBodyFontKey(value: unknown): value is BodyFontKey {
  return typeof value === "string" && BODY_FONT_OPTIONS.some((f) => f.key === value);
}

export type ParsedThemeInput = { ok: true; name: string; data: ThemeData } | { ok: false; error: string };

/** Validates a "save as theme" request body. Unlike preferences — which
 * quietly fall back to defaults — a bad value here is an error, so nobody
 * publishes a theme that isn't what they thought they were saving. */
export function parseThemeInput(body: unknown): ParsedThemeInput {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? cleanThemeName(b.name) : "";
  if (!name) return { ok: false, error: "Give your theme a name." };
  if (name.length > THEME_NAME_MAX) {
    return { ok: false, error: `Theme names can be at most ${THEME_NAME_MAX} characters.` };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "That name has characters that aren't allowed." };
  }

  if (!isDisplayFontKey(b.displayFont)) return { ok: false, error: "Unknown heading font." };
  if (!isBodyFontKey(b.bodyFont)) return { ok: false, error: "Unknown body font." };

  const rawColors = (b.colors ?? {}) as Record<string, unknown>;
  const colors = {} as ThemeColors;
  for (const key of COLOR_KEYS) {
    const value = rawColors[key];
    if (typeof value !== "string" || !HEX_COLOR.test(value)) {
      return { ok: false, error: `The ${key} color isn't a valid color.` };
    }
    colors[key] = value.toLowerCase();
  }

  // the pattern is optional so a request from before patterns existed still
  // saves (as a plain theme)
  const pattern = b.pattern === undefined ? "none" : b.pattern;
  if (!isPatternKey(pattern)) return { ok: false, error: "Unknown background pattern." };
  const tint = rawColors.pattern === undefined ? DEFAULT_PATTERN_TINT : rawColors.pattern;
  if (typeof tint !== "string" || !HEX_COLOR.test(tint)) {
    return { ok: false, error: "The pattern color isn't a valid color." };
  }
  colors.pattern = tint.toLowerCase();

  return { ok: true, name, data: { displayFont: b.displayFont, bodyFont: b.bodyFont, colors, pattern } };
}
