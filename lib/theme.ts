import {
  BODY_FONT_OPTIONS,
  FONT_OPTIONS,
  Preferences,
} from "./types";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return [0, 0, 0];
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function hexToRgbTriple(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/** Blends a hex color toward white by `amount` (0-1). Used to derive the
 * "rail" surface color from the user's chosen panel color, since we don't
 * ask for a separate swatch just for that. */
function lightenTriple(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `${mix(r)} ${mix(g)} ${mix(b)}`;
}

const THEME_PROPERTIES = [
  "--color-board-rgb",
  "--color-panel-rgb",
  "--color-rail-rgb",
  "--color-gold-rgb",
  "--color-tomato-rgb",
  "--color-chalk-rgb",
  "--font-display",
  "--font-body",
] as const;

export function applyTheme(prefs: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const { colors } = prefs;

  root.setProperty("--color-board-rgb", hexToRgbTriple(colors.board));
  root.setProperty("--color-panel-rgb", hexToRgbTriple(colors.panel));
  root.setProperty("--color-rail-rgb", lightenTriple(colors.panel, 0.12));
  root.setProperty("--color-gold-rgb", hexToRgbTriple(colors.gold));
  root.setProperty("--color-tomato-rgb", hexToRgbTriple(colors.tomato));
  root.setProperty("--color-chalk-rgb", hexToRgbTriple(colors.chalk));

  const display = FONT_OPTIONS.find((f) => f.key === prefs.displayFont)?.family;
  const body = BODY_FONT_OPTIONS.find((f) => f.key === prefs.bodyFont)?.family;
  if (display) root.setProperty("--font-display", display);
  if (body) root.setProperty("--font-body", body);
}

export function resetTheme() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  THEME_PROPERTIES.forEach((p) => root.removeProperty(p));
}
