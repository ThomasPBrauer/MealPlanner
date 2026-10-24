import { Ingredient, Meal } from "./types";

export interface ResolvedIngredient extends Ingredient {
  fromMealName?: string; // set when this came from an included sub-recipe rather than the meal's own list
  // id of the meal whose own `ingredients` list actually contains this line
  // (the top-level meal, or the sub-recipe component it was pulled from) —
  // this is "the recipe that item came from", used to push shopping-list
  // department corrections back into the owning recipe.
  sourceMealId: string;
}

/** Flattens a meal's own ingredients plus every (recursively) included
 * sub-recipe's ingredients, in the order components were added. Guards
 * against cycles defensively, even though the API also rejects them on save. */
export function resolveIngredients(
  meal: Meal,
  allMeals: Meal[],
  visited: Set<string> = new Set()
): ResolvedIngredient[] {
  if (visited.has(meal.id)) return [];
  visited.add(meal.id);

  const fromComponents: ResolvedIngredient[] = meal.components.flatMap((id) => {
    const sub = allMeals.find((m) => m.id === id);
    if (!sub) return [];
    return resolveIngredients(sub, allMeals, visited).map((ing) => ({
      ...ing,
      fromMealName: ing.fromMealName ?? sub.name,
    }));
  });

  const own: ResolvedIngredient[] = meal.ingredients.map((ing) => ({ ...ing, sourceMealId: meal.id }));

  return [...fromComponents, ...own];
}

export interface ResolvedInstructionGroup {
  mealName: string;
  steps: string[];
}

/** Groups instructions by sub-recipe (in component order), with the
 * meal's own additional steps last — matching "start from these recipes,
 * then do a few more things" composition. */
export function resolveInstructionGroups(
  meal: Meal,
  allMeals: Meal[],
  visited: Set<string> = new Set()
): ResolvedInstructionGroup[] {
  if (visited.has(meal.id)) return [];
  visited.add(meal.id);

  const fromComponents = meal.components.flatMap((id) => {
    const sub = allMeals.find((m) => m.id === id);
    if (!sub) return [];
    return resolveInstructionGroups(sub, allMeals, visited);
  });

  const own: ResolvedInstructionGroup[] = meal.instructions.length
    ? [{ mealName: meal.name, steps: meal.instructions }]
    : [];

  return [...fromComponents, ...own];
}

/** Parses a recipe amount string into a number where possible: plain
 * numbers, simple fractions ("1/2"), and mixed numbers ("1 1/2"). Returns
 * null for anything else (e.g. "a pinch", "to taste"). */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    return Number(whole) + Number(num) / Number(den);
  }
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const [, num, den] = frac;
    return Number(den) === 0 ? null : Number(num) / Number(den);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

/** Normalizes an ingredient name into the key used for lasting per-user
 * overrides (department correction, manual shopping-list position) — by
 * name only, not name+unit, so the same ingredient in different units
 * still shares one override. */
export function normalizeIngredientKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface AggregatedIngredient {
  key: string;
  name: string;
  unit: string;
  department: string; // "" if never set on any contributing ingredient
  display: string; // ready-to-print amount string
  usedIn: string[]; // meal names that contributed to this line
  sourceMealIds: string[]; // ids of the recipes (top-level or sub-recipe) whose own ingredient list has this line
}

/** Combines ingredients across a list of meal occurrences (one entry per
 * planned instance — the same meal planned twice counts twice), merging
 * matching name+unit pairs and summing numeric amounts where possible. */
export function aggregateIngredients(
  occurrences: Meal[],
  allMeals: Meal[]
): AggregatedIngredient[] {
  interface Bucket {
    name: string;
    unit: string;
    department: string;
    numericSum: number;
    hasNumeric: boolean;
    extraParts: string[];
    usedIn: Set<string>;
    sourceMealIds: Set<string>;
  }
  const map = new Map<string, Bucket>();

  for (const meal of occurrences) {
    const ingredients = resolveIngredients(meal, allMeals);
    for (const ing of ingredients) {
      if (!ing.name) continue;
      const key = `${ing.name.trim().toLowerCase()}|${ing.unit.trim().toLowerCase()}`;
      const existing = map.get(key);
      const n = parseAmount(ing.amount);
      const sourceName = ing.fromMealName ?? meal.name;
      const department = (ing.department ?? "").trim();

      if (!existing) {
        map.set(key, {
          name: ing.name.trim(),
          unit: ing.unit.trim(),
          department,
          numericSum: n ?? 0,
          hasNumeric: n !== null,
          extraParts: n === null && ing.amount.trim() ? [ing.amount.trim()] : [],
          usedIn: new Set([sourceName]),
          sourceMealIds: new Set([ing.sourceMealId]),
        });
      } else {
        if (n !== null) {
          existing.numericSum += n;
          existing.hasNumeric = true;
        } else if (ing.amount.trim()) {
          existing.extraParts.push(ing.amount.trim());
        }
        existing.usedIn.add(sourceName);
        existing.sourceMealIds.add(ing.sourceMealId);
        // first non-blank department wins — different sources rarely
        // disagree on where an ingredient lives, but don't let a blank
        // override one that was already set
        if (!existing.department && department) existing.department = department;
      }
    }
  }

  return Array.from(map.entries())
    .map(([key, b]) => {
      const parts: string[] = [];
      if (b.hasNumeric) parts.push(`${formatAmount(b.numericSum)}${b.unit ? ` ${b.unit}` : ""}`);
      parts.push(...b.extraParts.map((p) => (b.unit ? `${p} ${b.unit}` : p)));
      return {
        key,
        name: b.name,
        unit: b.unit,
        department: b.department,
        display: parts.join(" + ") || "—",
        usedIn: Array.from(b.usedIn),
        sourceMealIds: Array.from(b.sourceMealIds),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
