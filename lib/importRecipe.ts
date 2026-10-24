import { Ingredient } from "./types";

export interface ExtractedRecipe {
  name?: string;
  minutes?: number;
  servings?: number;
  source: string;
  ingredients: Ingredient[];
  instructions: string[];
  nutrition: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fiber?: number;
    fat?: number;
    sugar?: number;
    sodium?: number;
  };
}

const UNIT_WORDS = [
  "cups?", "tablespoons?", "tbsp\\.?", "teaspoons?", "tsp\\.?",
  "ounces?", "oz\\.?", "pounds?", "lbs?\\.?",
  "grams?", "g\\b", "kilograms?", "kg\\b",
  "milliliters?", "ml\\b", "liters?", "l\\b",
  "cloves?", "pinche?s?", "dashe?s?", "cans?", "packages?", "pkgs?\\.?",
  "slices?", "sprigs?", "stalks?", "bunche?s?",
  "large", "medium", "small", "whole",
];
const UNIT_RE = new RegExp(`^(${UNIT_WORDS.join("|")})\\b`, "i");

const FRACTION_MAP: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6",
  "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

function normalizeFractions(s: string): string {
  return s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => FRACTION_MAP[m] ?? m);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Best-effort split of a free-text ingredient line ("2 1/2 cups flour",
 * "3 large eggs, beaten") into amount / unit / name. Falls back to putting
 * the whole line in `name` if it doesn't recognize a leading quantity. */
export function splitIngredientLine(raw: string): Ingredient {
  const line = normalizeFractions(decodeEntities(stripHtml(raw))).replace(/\s+/g, " ").trim();
  const qtyMatch = line.match(
    /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:\.\d+)?)(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s*/
  );
  if (!qtyMatch) {
    return { id: "", name: line, amount: "", unit: "", department: "" };
  }
  const amount = qtyMatch[1];
  const afterQty = line.slice(qtyMatch[0].length);
  const unitMatch = afterQty.match(UNIT_RE);

  if (unitMatch) {
    const afterUnit = afterQty
      .slice(unitMatch[0].length)
      .replace(/^\.?\s*/, "")
      .replace(/^of\s+/i, "")
      .trim();
    // only treat it as a real unit if something is actually left for the
    // ingredient name — otherwise a source string that's just "4 oz" with
    // no name would silently produce a blank name, which is worse than
    // just leaving the whole thing unsplit
    if (afterUnit.length > 0) {
      return { id: "", name: afterUnit, amount, unit: unitMatch[0].replace(/\.$/, ""), department: "" };
    }
  }

  const rest = afterQty.replace(/^of\s+/i, "").trim();
  return { id: "", name: rest || line, amount, unit: "", department: "" };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseISODuration(iso: unknown): number | undefined {
  if (typeof iso !== "string") return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const hours = m[1] ? parseInt(m[1], 10) : 0;
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const total = hours * 60 + minutes;
  return total > 0 ? total : undefined;
}

function parseYield(y: unknown): number | undefined {
  const str = Array.isArray(y) ? y.join(" ") : String(y ?? "");
  const m = str.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

function parseNutritionValue(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const m = String(v).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findRecipeNode(node: any, depth = 0): any | null {
  if (!node || depth > 4) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && t.toLowerCase() === "recipe")) {
    return node;
  }
  if (node["@graph"]) {
    const found = findRecipeNode(node["@graph"], depth + 1);
    if (found) return found;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInstructionSteps(raw: any): string[] {
  if (!raw) return [];
  const clean = (s: string) => decodeEntities(stripHtml(s));
  if (typeof raw === "string") {
    return clean(raw)
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];

  const steps: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      steps.push(clean(item));
    } else if (item && typeof item === "object") {
      const type = item["@type"];
      if (type === "HowToSection" && Array.isArray(item.itemListElement)) {
        steps.push(...extractInstructionSteps(item.itemListElement));
      } else if (typeof item.text === "string") {
        steps.push(clean(item.text));
      } else if (typeof item.name === "string") {
        steps.push(clean(item.name));
      }
    }
  }
  return steps.filter(Boolean);
}

export interface ExtractResult {
  recipe?: ExtractedRecipe;
  error?: string;
}

const PRIVATE_HOST_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export async function extractRecipeFromUrl(targetUrl: string): Promise<ExtractResult> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http/https URLs are supported." };
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    return { error: "That URL isn't allowed." };
  }

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { error: `That page returned an error (HTTP ${res.status}).` };
    }
    html = await res.text();
  } catch {
    return { error: "Couldn't reach that URL. It may be down, or blocking automated requests." };
  }

  const scriptMatches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  let recipeNode: unknown = null;
  for (const match of scriptMatches) {
    const raw = match[1].trim();
    try {
      const parsedJson = JSON.parse(raw);
      const found = findRecipeNode(parsedJson);
      if (found) {
        recipeNode = found;
        break;
      }
    } catch {
      // malformed JSON-LD block — skip it and keep looking
    }
  }

  if (!recipeNode || typeof recipeNode !== "object") {
    return {
      error:
        "Couldn't find structured recipe data on that page. You can still fill in the form by hand, or try a different URL for this recipe.",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = recipeNode as any;

  const rawIngredients: string[] = Array.isArray(r.recipeIngredient)
    ? r.recipeIngredient
    : Array.isArray(r.ingredients)
      ? r.ingredients
      : [];
  const ingredients = rawIngredients
    .filter((s) => typeof s === "string" && s.trim())
    .map((s, i) => ({ ...splitIngredientLine(s), id: `ing-${i}` }));

  const instructions = extractInstructionSteps(r.recipeInstructions);

  const minutes = parseISODuration(r.totalTime) ?? parseISODuration(r.cookTime);
  const servings = parseYield(r.recipeYield);

  const nutritionNode = r.nutrition ?? {};
  const nutrition = {
    calories: parseNutritionValue(nutritionNode.calories),
    protein: parseNutritionValue(nutritionNode.proteinContent),
    carbs: parseNutritionValue(nutritionNode.carbohydrateContent),
    fiber: parseNutritionValue(nutritionNode.fiberContent),
    fat: parseNutritionValue(nutritionNode.fatContent),
    sugar: parseNutritionValue(nutritionNode.sugarContent),
    sodium: parseNutritionValue(nutritionNode.sodiumContent),
  };

  const name = typeof r.name === "string" ? decodeEntities(stripHtml(r.name)) : undefined;

  if (ingredients.length === 0 && instructions.length === 0) {
    return {
      error: "Found recipe data on that page, but couldn't read ingredients or instructions from it.",
    };
  }

  return {
    recipe: {
      name,
      minutes,
      servings,
      source: parsed.toString(),
      ingredients,
      instructions,
      nutrition,
    },
  };
}

// ---------------------------------------------------------------------------
// Text-paste import — a fallback for sites whose server-side bot protection
// blocks extractRecipeFromUrl above. The person copies the rendered recipe
// page (in their own already-permitted browser) and pastes the plain text;
// we parse it heuristically by looking for the landmark section headers
// most recipe sites share (Ingredients / Directions / Nutrition Facts) and
// labeled fields (Prep Time:, Servings:, etc.) rather than any site-specific
// markup, since plain-text copies carry no HTML structure to key off.
// ---------------------------------------------------------------------------

const SECTION_HEADERS = {
  ingredients: /^ingredients$/i,
  directions: /^(directions|instructions|steps|method)$/i,
  nutrition: /^nutrition facts/i,
};

// noise lines that show up between "Ingredients" and the first real
// ingredient on sites with a serving-size scaler widget (½x / 1x / 2x) or a
// "yields N servings" blurb
const INGREDIENT_NOISE_RE = /^(\d+\/?\d*x|original recipe.*yields.*|jump to.*)$/i;

function findSectionLineIndex(lines: string[], pattern: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

/** "Prep Time:", "Servings:", etc. — the label and its value are usually on
 * separate lines in a plain-text copy of the page, but handle same-line
 * "Label: value" too, in case the paste collapses them. */
function findLabeledValue(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const sameLine = lines[i].match(label);
    if (sameLine) {
      const inline = lines[i].replace(label, "").replace(/^:?\s*/, "").trim();
      if (inline) return inline;
      if (lines[i + 1]) return lines[i + 1];
    }
  }
  return null;
}

function parseDurationToMinutes(text: string | null): number | undefined {
  if (!text) return undefined;
  const hrMatch = text.match(/(\d+)\s*hr/i);
  const minMatch = text.match(/(\d+)\s*min/i);
  if (hrMatch || minMatch) {
    const hours = hrMatch ? parseInt(hrMatch[1], 10) : 0;
    const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 60 + mins;
  }
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseServingsCount(text: string | null): number | undefined {
  if (!text) return undefined;
  const m = text.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

/** Calories shows up two different ways on most sites' plain-text dumps: a
 * "520 / Calories" quick-facts strip (value before label, on separate
 * lines) and a "Calories 520" detailed-table row (label and value on the
 * *same* line). The label-first check deliberately requires same-line
 * adjacency — the quick-facts strip's "Calories" is immediately followed,
 * one line down, by Fat's number (not calories'), so allowing a
 * cross-line match there grabs the wrong figure. */
function findCaloriesInText(text: string): number | undefined {
  const labelFirst = text.match(/Calories[^\S\r\n]+([\d,]+)/i);
  if (labelFirst) return parseInt(labelFirst[1].replace(/,/g, ""), 10);
  const valueFirst = text.match(/([\d,]+)[^\S\r\n]*[\r\n]+[^\S\r\n]*Calories/i);
  if (valueFirst) return parseInt(valueFirst[1].replace(/,/g, ""), 10);
  return undefined;
}

/** Everything else (Protein, Total Fat, Sodium, ...) — same-line-only, for
 * the same reason as calories above: safer to skip a field than to risk
 * matching across unrelated intervening text on the page. */
function findLabeledNutrient(text: string, label: string): number | undefined {
  const re = new RegExp(`${label}[^\\S\\r\\n]+([\\d,.]+)\\s*(?:g|mg)`, "i");
  const m = text.match(re);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function parseRecipeText(raw: string): ExtractResult {
  const trimmedRaw = raw.trim();
  if (!trimmedRaw) return { error: "Paste some recipe text first." };

  const lines = trimmedRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { error: "Paste some recipe text first." };

  const name = decodeEntities(lines[0]);

  const minutes =
    parseDurationToMinutes(findLabeledValue(lines, /^total time:?/i)) ??
    parseDurationToMinutes(findLabeledValue(lines, /^prep time:?/i));
  const servings = parseServingsCount(findLabeledValue(lines, /^servings:?/i));

  const ingredientsStart = findSectionLineIndex(lines, SECTION_HEADERS.ingredients);
  const directionsStart = findSectionLineIndex(lines, SECTION_HEADERS.directions);
  const nutritionStart = findSectionLineIndex(lines, SECTION_HEADERS.nutrition);

  const ingredients: Ingredient[] =
    ingredientsStart === -1
      ? []
      : lines
          .slice(ingredientsStart + 1, directionsStart === -1 ? undefined : directionsStart)
          .filter((l) => !INGREDIENT_NOISE_RE.test(l))
          .map((l, i) => ({ ...splitIngredientLine(l), id: `ing-${i}` }));

  const instructions: string[] =
    directionsStart === -1
      ? []
      : lines
          .slice(directionsStart + 1, nutritionStart === -1 ? undefined : nutritionStart)
          // drop bare step-number lines some sites paste on their own line ("1", "Step 1")
          .filter((l) => !/^(step\s*)?\d+\.?$/i.test(l));

  const nutritionSection = nutritionStart === -1 ? trimmedRaw : lines.slice(nutritionStart).join("\n");
  const nutrition = {
    calories: findCaloriesInText(nutritionSection),
    protein: findLabeledNutrient(nutritionSection, "Protein"),
    carbs: findLabeledNutrient(nutritionSection, "Total Carbohydrate"),
    fiber: findLabeledNutrient(nutritionSection, "Dietary Fiber"),
    fat: findLabeledNutrient(nutritionSection, "Total Fat"),
    sugar: findLabeledNutrient(nutritionSection, "Total Sugars"),
    sodium: findLabeledNutrient(nutritionSection, "Sodium"),
  };

  if (ingredients.length === 0 && instructions.length === 0) {
    return {
      error:
        "Couldn't find an \"Ingredients\" and \"Directions\" section in that text. Make sure both are included in what you paste.",
    };
  }

  return {
    recipe: {
      name,
      minutes,
      servings,
      source: "Pasted text",
      ingredients,
      instructions,
      nutrition,
    },
  };
}
