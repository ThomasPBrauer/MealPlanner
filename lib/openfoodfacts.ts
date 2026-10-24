import type { MealInput } from "./meals";
import { Meal } from "./types";

// Every recipe imported from Open Food Facts is attributed to this fixed,
// non-human owner rather than whichever user happened to drag it onto the
// board — it's published data, not something any particular user authored.
export const OFF_OWNER_EMAIL = "contact@openfoodfacts.org";

// Virtual (not-yet-persisted) search-result cards use this id prefix so
// the rest of the app can recognize them without any extra payload
// plumbing — a real Meal.id is a plain cuid and never contains a colon.
const VIRTUAL_PREFIX = "off:";

export function virtualMealId(code: string): string {
  return `${VIRTUAL_PREFIX}${code}`;
}

export function isVirtualOffMeal(id: string): boolean {
  return id.startsWith(VIRTUAL_PREFIX);
}

/** Extracts the Open Food Facts barcode back out of a virtual meal id, or
 * null if this isn't one. */
export function offCodeFromMealId(id: string): string | null {
  return isVirtualOffMeal(id) ? id.slice(VIRTUAL_PREFIX.length) : null;
}

export function offProductUrl(code: string): string {
  return `https://world.openfoodfacts.org/product/${code}`;
}

// A descriptive User-Agent is required by Open Food Facts' API usage
// policy — requests without one are liable to be throttled or blocked.
export const OFF_USER_AGENT = "MealPlanner/1.0 (+https://github.com/anthropic/meal-planner)";

export interface OffSearchResult {
  code: string;
  name: string;
  brand: string; // "" if none listed
  imageUrl: string | null;
  categoryLabel: string; // first/primary category, "" if none
  // nutrition, as reported by Open Food Facts — per 100g/100ml, not per serving
  nutritionPer100g: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fiber?: number;
    fat?: number;
    sugar?: number;
    sodium?: number; // mg
  };
}

function numField(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRawOffProduct(raw: any): OffSearchResult | null {
  const code = typeof raw?.code === "string" ? raw.code.trim() : "";
  const name = typeof raw?.product_name === "string" ? raw.product_name.trim() : "";
  if (!code || !name) return null; // not enough to make a usable recipe card

  const brand =
    typeof raw?.brands === "string" && raw.brands.trim() ? raw.brands.trim().split(",")[0].trim() : "";
  const imageUrl =
    (typeof raw?.image_front_url === "string" && raw.image_front_url) ||
    (typeof raw?.image_url === "string" && raw.image_url) ||
    (typeof raw?.image_small_url === "string" && raw.image_small_url) ||
    null;
  const categoryLabel =
    typeof raw?.categories === "string" && raw.categories.trim()
      ? raw.categories.trim().split(",")[0].trim()
      : "";

  const nutriments = raw?.nutriments ?? {};
  const sodiumG = numField(nutriments["sodium_100g"]);

  return {
    code,
    name,
    brand,
    imageUrl,
    categoryLabel,
    nutritionPer100g: {
      calories: numField(nutriments["energy-kcal_100g"]),
      protein: numField(nutriments["proteins_100g"]),
      carbs: numField(nutriments["carbohydrates_100g"]),
      fiber: numField(nutriments["fiber_100g"]),
      fat: numField(nutriments["fat_100g"]),
      sugar: numField(nutriments["sugars_100g"]),
      sodium: sodiumG === undefined ? undefined : Math.round(sodiumG * 1000),
    },
  };
}

function displayName(result: OffSearchResult): string {
  return result.brand ? `${result.name} — ${result.brand}` : result.name;
}

function offTags(result: OffSearchResult): string[] {
  const tags = ["Open Food Facts"];
  if (result.categoryLabel) tags.push(result.categoryLabel);
  return tags;
}

/** Builds the shared recipe fields (everything but who owns it / whether
 * it's actually saved yet) from a search result — used both for the
 * not-yet-persisted preview card in the Pantry and, on import, as the
 * basis for the real database row. */
function offMealFields(result: OffSearchResult) {
  return {
    name: displayName(result),
    tags: offTags(result),
    primaryProtein: "None",
    primaryCarb: "None",
    minutes: 0,
    servings: 1,
    source: offProductUrl(result.code),
    notes: "Imported from Open Food Facts. Nutrition is per 100g/100ml, as reported there — not per serving.",
    nutrition: { ...result.nutritionPer100g },
    ingredients: [
      { id: "off-product", name: result.name, amount: "1", unit: "", department: "" },
    ],
    instructions: [] as string[],
    components: [] as string[],
    photo: result.imageUrl,
  };
}

/** A full Meal-shaped object for the Pantry to render and drag, before
 * it's ever been saved. Not a real database row — id is prefixed so
 * downstream code can tell the two apart (see isVirtualOffMeal). */
export function buildVirtualOffMeal(result: OffSearchResult): Meal {
  const fields = offMealFields(result);
  return {
    id: virtualMealId(result.code),
    ownerEmail: OFF_OWNER_EMAIL,
    visibility: "public",
    isMine: false,
    lastPlannedDate: null,
    ...fields,
  };
}

/** The same fields, shaped for lib/meals.ts's toPrismaData — used
 * server-side, once, at the moment a virtual card is actually dropped
 * onto the board and needs to become a real row. */
export function buildOffMealInput(result: OffSearchResult): MealInput {
  return { ...offMealFields(result), visibility: "public" };
}
