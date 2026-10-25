import { Meal } from "./types";
import { ResolvedIngredient, ResolvedInstructionGroup, parseAmount } from "./recipe";

// schema.org/Recipe structured data for a recipe page — the same vocabulary
// lib/importRecipe.ts reads when importing from a URL, so the pages this app
// publishes can be imported back into it (or any other recipe app), and
// search engines can show them as rich recipe results.

// Stored units are short canonical forms (C, T, tsp…). Spelled out here
// because "2 T olive oil" means nothing to a search engine or another app;
// lib/units.ts maps them straight back on import.
const UNIT_WORDS: Record<string, [string, string]> = {
  C: ["cup", "cups"],
  T: ["tablespoon", "tablespoons"],
  tsp: ["teaspoon", "teaspoons"],
  oz: ["ounce", "ounces"],
  "fl oz": ["fluid ounce", "fluid ounces"],
  lb: ["pound", "pounds"],
  pt: ["pint", "pints"],
  qt: ["quart", "quarts"],
  gal: ["gallon", "gallons"],
  pkg: ["package", "packages"],
  clove: ["clove", "cloves"],
  can: ["can", "cans"],
  slice: ["slice", "slices"],
  sprig: ["sprig", "sprigs"],
  stalk: ["stalk", "stalks"],
  bunch: ["bunch", "bunches"],
  stick: ["stick", "sticks"],
  head: ["head", "heads"],
  jar: ["jar", "jars"],
  bottle: ["bottle", "bottles"],
  bag: ["bag", "bags"],
  box: ["box", "boxes"],
  piece: ["piece", "pieces"],
};

export function ingredientLine(ing: { amount: string; unit: string; name: string }): string {
  const words = UNIT_WORDS[ing.unit];
  let unit = ing.unit;
  if (words) {
    const n = parseAmount(ing.amount);
    unit = n !== null && n > 1 ? words[1] : words[0];
  }
  return [ing.amount, unit, ing.name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/** minutes → ISO 8601 duration, e.g. 75 → "PT1H15M" */
export function isoDuration(minutes: number): string | undefined {
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
}

// Open Food Facts products are attributed to their source rather than to
// whoever's address happens to own the row (and owner addresses are never
// published).
const OFF_OWNER_EMAIL = "contact@openfoodfacts.org";

export interface RecipeJsonLdInput {
  meal: Meal;
  ingredients: ResolvedIngredient[];
  instructionGroups: ResolvedInstructionGroup[];
  /** absolute URL of this recipe's page */
  url: string;
  /** absolute URL of the recipe photo, if it has one */
  imageUrl?: string;
  description?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRecipeJsonLd({ meal, ingredients, instructionGroups, url, imageUrl, description }: RecipeJsonLdInput): Record<string, any> {
  const n = meal.nutrition;
  const num = (v: number | undefined | null, unit: string) =>
    v === undefined || v === null ? undefined : `${v} ${unit}`;

  const nutritionFields = {
    calories: n.calories === undefined ? undefined : `${n.calories} calories`,
    proteinContent: num(n.protein, "g"),
    carbohydrateContent: num(n.carbs, "g"),
    fiberContent: num(n.fiber, "g"),
    fatContent: num(n.fat, "g"),
    sugarContent: num(n.sugar, "g"),
    sodiumContent: num(n.sodium, "mg"),
  };
  const hasNutrition = Object.values(nutritionFields).some((v) => v !== undefined);

  const step = (text: string) => ({ "@type": "HowToStep", text });
  // one flat list normally; sections only when the recipe is built from
  // other recipes, so each sub-recipe's steps stay together under its name
  const recipeInstructions =
    instructionGroups.length > 1
      ? instructionGroups.map((g) => ({
          "@type": "HowToSection",
          name: g.mealName,
          itemListElement: g.steps.map(step),
        }))
      : instructionGroups.flatMap((g) => g.steps).map(step);

  const keywords = [...meal.tags, meal.primaryProtein, meal.primaryCarb].filter(
    (k, i, all) => k && k !== "None" && all.indexOf(k) === i
  );

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: meal.name,
    url,
    mainEntityOfPage: url,
    description,
    image: imageUrl ? [imageUrl] : undefined,
    author:
      meal.visibility === "public" && isOffRecipe(meal)
        ? { "@type": "Organization", name: "Open Food Facts", url: "https://world.openfoodfacts.org" }
        : undefined,
    recipeCategory: meal.tags.length ? meal.tags : undefined,
    keywords: keywords.length ? keywords.join(", ") : undefined,
    totalTime: isoDuration(meal.minutes),
    recipeYield: [String(meal.servings), `${meal.servings} serving${meal.servings === 1 ? "" : "s"}`],
    recipeIngredient: ingredients.map(ingredientLine).filter(Boolean),
    recipeInstructions: recipeInstructions.length ? recipeInstructions : undefined,
    nutrition: hasNutrition
      ? { "@type": "NutritionInformation", servingSize: "1 serving", ...nutritionFields }
      : undefined,
    isBasedOn: meal.source && /^https?:\/\//i.test(meal.source.trim()) ? meal.source.trim() : undefined,
  };
}

function isOffRecipe(meal: Meal): boolean {
  return /^https?:\/\/world\.openfoodfacts\.org\//i.test(meal.source) || meal.ownerEmail === OFF_OWNER_EMAIL;
}

/** JSON for inside a <script type="application/ld+json"> tag. Recipe text is
 * user-supplied, so "<" is escaped — otherwise a recipe containing
 * "</script><script>…" would break out of the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
