// Recipe URL slugs: "Cancun shrimp tacos" → "cancun-shrimp-tacos".
//
// Client-safe (no database access). The database side — checking what's
// taken and retrying on a collision — lives in lib/meals.ts and hands its
// queries in as closures, so this logic can be tested without a database.

export const SLUG_MAX = 80;

// First path segments that already mean something under /meals or
// /api/meals — a recipe called "New" must not shadow /meals/new.
const RESERVED = new Set(["new", "import", "openfoodfacts"]);

/** Lowercase ASCII words joined by hyphens. Accents are folded ("Crème
 * brûlée" → "creme-brulee"), "&" reads as "and", apostrophes vanish ("Grandma's"
 * → "grandmas"), and anything else becomes a separator. A name with no
 * letters or digits at all (e.g. only emoji) gets "recipe". */
export function slugify(name: string): string {
  let s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (s.length > SLUG_MAX) {
    s = s.slice(0, SLUG_MAX);
    // prefer ending on a whole word
    const cut = s.lastIndexOf("-");
    if (cut > SLUG_MAX / 2) s = s.slice(0, cut);
    s = s.replace(/-+$/g, "");
  }

  if (!s) s = "recipe";
  if (RESERVED.has(s)) s = `${s}-recipe`;
  return s;
}

/** The first free slug for `name`: the plain one, else with -2, -3, … on
 * the end. `isTaken` answers whether some recipe already has a slug. */
export async function pickSlug(name: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugify(name);
  if (!(await isTaken(base))) return base;
  for (let n = 2; n <= 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // absurdly many identical names — fall back to something random
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

// Prisma's "unique constraint failed", recognised by code so this file
// needn't import Prisma.
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** Runs `attempt` with a free slug for `name`. If two recipes with the same
 * name are saved at the same moment, both can pick the same free slug and
 * the second write fails the unique index; that failure is expected, so
 * pick again (the first writer's slug is now taken) and retry. */
export async function withUniqueSlug<T>(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
  attempt: (slug: string) => Promise<T>,
  maxTries = 5
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxTries; i++) {
    const slug = await pickSlug(name, isTaken);
    try {
      return await attempt(slug);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

/** Where a recipe's page lives. Recipes not yet given a slug (created by a
 * bulk loader, before the backfill) fall back to their id, which the page
 * still accepts. */
export function mealPath(meal: { id: string; slug?: string | null }): string {
  return `/meals/${meal.slug || meal.id}`;
}
