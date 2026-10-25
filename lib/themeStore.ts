import { BUILT_IN_KEYS, ThemeData, ThemeSummary, themeNameKey } from "./themes";
import type { BodyFontKey, DisplayFontKey } from "./types";

// The rules for saving a shared theme, kept apart from Prisma: the caller
// hands in three small database operations, so this logic can be checked
// without a database and the route stays a thin wrapper.

/** The columns of a Theme row that this logic reads. */
export interface ThemeRow {
  id: string;
  ownerEmail: string;
  ownerName: string | null;
  name: string;
  nameKey: string;
  displayFont: string;
  bodyFont: string;
  colorBoard: string;
  colorPanel: string;
  colorGold: string;
  colorTomato: string;
  colorChalk: string;
}

export interface ThemeStoreOps {
  findByKey(nameKey: string): Promise<ThemeRow | null>;
  create(values: ThemeValues): Promise<ThemeRow>;
  update(id: string, values: ThemeValues): Promise<ThemeRow>;
}

export type ThemeValues = Omit<ThemeRow, "id">;

export type SaveThemeResult =
  | { ok: true; status: "created" | "updated"; row: ThemeRow }
  | { ok: false; error: string };

const TAKEN = "That theme name is already taken — try another.";

function toValues(owner: { email: string; name: string | null }, name: string, data: ThemeData): ThemeValues {
  return {
    ownerEmail: owner.email,
    ownerName: owner.name,
    name,
    nameKey: themeNameKey(name),
    displayFont: data.displayFont,
    bodyFont: data.bodyFont,
    colorBoard: data.colors.board,
    colorPanel: data.colors.panel,
    colorGold: data.colors.gold,
    colorTomato: data.colors.tomato,
    colorChalk: data.colors.chalk,
  };
}

// Prisma's "unique constraint failed" error, recognised by its code so this
// file doesn't need to import Prisma.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** Creates the user's theme, or overwrites it if they already own one with
 * this name. Someone else's theme (or a built-in) with the same name is
 * refused. `name` and `data` must already be validated. */
export async function saveTheme(
  ops: ThemeStoreOps,
  owner: { email: string; name: string | null },
  name: string,
  data: ThemeData
): Promise<SaveThemeResult> {
  const key = themeNameKey(name);
  if (BUILT_IN_KEYS.has(key)) return { ok: false, error: TAKEN };

  const values = toValues(owner, name, data);

  const existing = await ops.findByKey(key);
  if (existing) {
    if (existing.ownerEmail !== owner.email) return { ok: false, error: TAKEN };
    return { ok: true, status: "updated", row: await ops.update(existing.id, values) };
  }

  try {
    return { ok: true, status: "created", row: await ops.create(values) };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Someone created this name between our check and our insert. If that
    // someone is this same user (a double-click), treat it as an overwrite;
    // otherwise the name really is taken.
    const winner = await ops.findByKey(key);
    if (winner && winner.ownerEmail === owner.email) {
      return { ok: true, status: "updated", row: await ops.update(winner.id, values) };
    }
    return { ok: false, error: TAKEN };
  }
}

/** A row as the browser sees it. Never includes the owner's email. */
export function rowToSummary(row: ThemeRow, viewerEmail: string): ThemeSummary {
  return {
    id: row.id,
    name: row.name,
    builtIn: false,
    isMine: row.ownerEmail === viewerEmail,
    ownerName: row.ownerName,
    // stored as plain strings; the writers only ever put valid keys there
    displayFont: row.displayFont as DisplayFontKey,
    bodyFont: row.bodyFont as BodyFontKey,
    colors: {
      board: row.colorBoard,
      panel: row.colorPanel,
      gold: row.colorGold,
      tomato: row.colorTomato,
      chalk: row.colorChalk,
    },
  };
}
