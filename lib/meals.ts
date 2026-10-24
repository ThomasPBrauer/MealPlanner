import type { Meal as PrismaMeal } from "@prisma/client";
import { Ingredient, Meal, MealVisibility, NutritionInfo } from "./types";
import { prisma } from "./prisma";

export function serializeMeal(
  row: PrismaMeal,
  viewerEmail?: string
): Meal & { isMine: boolean } {
  let ingredients: Ingredient[] = [];
  let instructions: string[] = [];
  let components: string[] = [];
  let tags: string[] = [];
  try {
    ingredients = JSON.parse(row.ingredients);
  } catch {
    ingredients = [];
  }
  try {
    instructions = JSON.parse(row.instructions);
  } catch {
    instructions = [];
  }
  try {
    components = JSON.parse(row.components);
  } catch {
    components = [];
  }
  try {
    const parsed = row.tags ? JSON.parse(row.tags) : [];
    tags = Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    tags = [];
  }
  if (tags.length === 0) tags = ["Other"];

  const nutrition: NutritionInfo = {
    calories: row.calories ?? undefined,
    protein: row.protein ?? undefined,
    carbs: row.carbs ?? undefined,
    fiber: row.fiber ?? undefined,
    netCarbs: row.netCarbs ?? undefined,
    fat: row.fat ?? undefined,
    sugar: row.sugar ?? undefined,
    sodium: row.sodium ?? undefined,
  };

  return {
    id: row.id,
    name: row.name,
    tags,
    primaryProtein: row.primaryProtein,
    primaryCarb: row.primaryCarb,
    minutes: row.minutes,
    servings: row.servings,
    ownerEmail: row.ownerEmail,
    visibility: row.visibility as MealVisibility,
    source: row.source,
    notes: row.notes,
    nutrition,
    ingredients,
    instructions,
    components,
    photo: row.photo ?? null,
    isMine: viewerEmail ? row.ownerEmail === viewerEmail : false,
  };
}

export interface MealInput {
  name: string;
  tags: string[];
  primaryProtein: string;
  primaryCarb: string;
  minutes: number;
  servings: number;
  visibility: MealVisibility;
  source: string;
  notes: string;
  nutrition: NutritionInfo;
  ingredients: Ingredient[];
  instructions: string[];
  components: string[]; // raw, unsanitized ids from the client — see sanitizeComponentIds
  photo: string | null;
}

function num(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMealInput(body: any): MealInput | { error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "Name is required." };

  const rawTags: unknown[] = Array.isArray(body.tags) ? body.tags : [];
  const tags = Array.from(
    new Set(
      rawTags
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => (typeof t === "string" ? t.trim() : ""))
        .filter((t: string) => t.length > 0)
    )
  );
  if (tags.length === 0) tags.push("Other");
  const primaryProtein =
    typeof body.primaryProtein === "string" && body.primaryProtein.trim()
      ? body.primaryProtein.trim()
      : "None";
  const primaryCarb =
    typeof body.primaryCarb === "string" && body.primaryCarb.trim()
      ? body.primaryCarb.trim()
      : "None";
  const minutes = Math.max(0, Math.round(num(body.minutes) ?? 0));
  const servings = Math.max(1, Math.round(num(body.servings) ?? 4));
  const visibility: MealVisibility = body.visibility === "public" ? "public" : "personal";
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  const n = body.nutrition ?? {};
  const carbs = num(n.carbs);
  const fiber = num(n.fiber);
  const netCarbsInput = num(n.netCarbs);
  // if net carbs wasn't given explicitly, derive it from carbs - fiber
  const netCarbs =
    netCarbsInput ?? (carbs !== undefined && fiber !== undefined ? Math.max(0, carbs - fiber) : undefined);

  const nutrition: NutritionInfo = {
    calories: num(n.calories),
    protein: num(n.protein),
    carbs,
    fiber,
    netCarbs,
    fat: num(n.fat),
    sugar: num(n.sugar),
    sodium: num(n.sodium),
  };

  const rawIngredients: unknown[] = Array.isArray(body.ingredients) ? body.ingredients : [];
  const ingredients: Ingredient[] = rawIngredients
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((ing: any, i: number) => ({
      id: typeof ing?.id === "string" && ing.id ? ing.id : `ing-${i}`,
      name: typeof ing?.name === "string" ? ing.name.trim() : "",
      amount: typeof ing?.amount === "string" ? ing.amount.trim() : "",
      unit: typeof ing?.unit === "string" ? ing.unit.trim() : "",
      department: typeof ing?.department === "string" ? ing.department.trim() : "",
    }))
    .filter((ing: Ingredient) => ing.name.length > 0);

  const rawInstructions: unknown[] = Array.isArray(body.instructions) ? body.instructions : [];
  const instructions: string[] = rawInstructions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => (typeof s === "string" ? s.trim() : ""))
    .filter((s: string) => s.length > 0);

  const rawComponents: unknown[] = Array.isArray(body.components) ? body.components : [];
  const components: string[] = rawComponents.filter(
    (id: unknown): id is string => typeof id === "string" && id.length > 0
  );

  // photo is a base64 data URL the client has already resized/compressed —
  // just sanity-check the shape and cap the size so a huge upload can't
  // bloat the row (~3.5MB of base64 text ≈ 2.5MB of actual image data)
  let photo: string | null = null;
  if (typeof body.photo === "string" && body.photo.trim()) {
    const candidate = body.photo.trim();
    if (!candidate.startsWith("data:image/")) {
      return { error: "Photo must be an image." };
    }
    if (candidate.length > 3_500_000) {
      return { error: "That photo is too large. Try a smaller image." };
    }
    photo = candidate;
  }

  return {
    name,
    tags,
    primaryProtein,
    primaryCarb,
    minutes,
    servings,
    visibility,
    source,
    notes,
    nutrition,
    ingredients,
    instructions,
    components,
    photo,
  };
}

/** Returns, for every meal this viewer has ever planned, the most recent
 * date (YYYY-MM-DD) they planned it — used to drive the Pantry's "last
 * made" sort. Meals never planned by this viewer simply won't appear in
 * the returned map. */
export async function getLastPlannedDates(email: string): Promise<Map<string, string>> {
  const rows = await prisma.plannedMeal.groupBy({
    by: ["mealId"],
    where: { email },
    _max: { date: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row._max.date) map.set(row.mealId, row._max.date);
  }
  return map;
}

/** Filters a proposed component-id list down to ids that are (a) real
 * meals, (b) visible to this user (public or their own), and (c) not the
 * meal itself. Also dedupes while preserving order. */
export async function sanitizeComponentIds(
  email: string,
  ids: string[],
  excludeId?: string
): Promise<string[]> {
  const unique = Array.from(new Set(ids.filter((id) => id && id !== excludeId)));
  if (unique.length === 0) return [];

  const rows = await prisma.meal.findMany({ where: { id: { in: unique } } });
  const visible = new Set(
    rows.filter((r) => r.visibility === "public" || r.ownerEmail === email).map((r) => r.id)
  );
  return unique.filter((id) => visible.has(id));
}

/** True if including `componentIds` on meal `targetId` would create a
 * cycle — i.e. one of those components (transitively) includes `targetId`
 * itself. Only relevant for edits (a brand-new meal has no id yet, so it
 * can't already appear in anything's component graph). */
export async function containsCycle(targetId: string, componentIds: string[]): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [...componentIds];

  while (queue.length) {
    const id = queue.shift()!;
    if (id === targetId) return true;
    if (visited.has(id)) continue;
    visited.add(id);

    const meal = await prisma.meal.findUnique({ where: { id }, select: { components: true } });
    if (!meal) continue;
    try {
      const kids: string[] = JSON.parse(meal.components);
      queue.push(...kids);
    } catch {
      /* malformed data, ignore */
    }
  }
  return false;
}

export function toPrismaData(input: MealInput, sanitizedComponents: string[]) {
  return {
    name: input.name,
    tags: JSON.stringify(input.tags),
    photo: input.photo,
    primaryProtein: input.primaryProtein,
    primaryCarb: input.primaryCarb,
    minutes: input.minutes,
    servings: input.servings,
    visibility: input.visibility,
    source: input.source,
    notes: input.notes,
    calories: input.nutrition.calories ?? null,
    protein: input.nutrition.protein ?? null,
    carbs: input.nutrition.carbs ?? null,
    fiber: input.nutrition.fiber ?? null,
    netCarbs: input.nutrition.netCarbs ?? null,
    fat: input.nutrition.fat ?? null,
    sugar: input.nutrition.sugar ?? null,
    sodium: input.nutrition.sodium ?? null,
    ingredients: JSON.stringify(input.ingredients),
    instructions: JSON.stringify(input.instructions),
    components: JSON.stringify(sanitizedComponents),
  };
}
