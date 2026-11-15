// The public recipe book: every public, user-contributed recipe, organised
// into chapters by tag. Pure data-shaping, no database — safe for the client.

export interface BookRecipe {
  id: string;
  slug: string | null;
  name: string;
  tags: string[];
  minutes: number;
  servings: number;
  primaryProtein: string;
  primaryCarb: string;
  /** ingredient names only — what the search looks through */
  ingredientNames: string[];
  hasPhoto: boolean;
}

export interface Chapter {
  /** lowercase tag — stable, URL-safe identity */
  key: string;
  /** the tag as people wrote it */
  title: string;
  recipes: BookRecipe[];
}

const LAST_CHAPTER = "other";

/** One chapter per tag (case-insensitive). A recipe with several tags is
 * listed in each of those chapters. Chapters run A–Z with "Other" last. */
export function buildChapters(recipes: BookRecipe[]): Chapter[] {
  const byKey = new Map<string, { titles: Map<string, number>; recipes: BookRecipe[] }>();
  for (const recipe of recipes) {
    const seen = new Set<string>();
    for (const raw of recipe.tags) {
      const title = raw.trim();
      const key = title.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let entry = byKey.get(key);
      if (!entry) {
        entry = { titles: new Map(), recipes: [] };
        byKey.set(key, entry);
      }
      entry.titles.set(title, (entry.titles.get(title) ?? 0) + 1);
      entry.recipes.push(recipe);
    }
  }

  const chapters: Chapter[] = [];
  for (const [key, entry] of Array.from(byKey)) {
    // the spelling most recipes used ("Dinner" over "dinner")
    const title = Array.from(entry.titles).sort((a, b) => b[1] - a[1] || Number(b[0] !== b[0].toLowerCase()) - Number(a[0] !== a[0].toLowerCase()) || a[0].localeCompare(b[0]))[0][0];
    chapters.push({
      key,
      title,
      recipes: [...entry.recipes].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  chapters.sort((a, b) => {
    if (a.key === LAST_CHAPTER) return 1;
    if (b.key === LAST_CHAPTER) return -1;
    return a.title.localeCompare(b.title);
  });
  return chapters;
}

/** Recipes whose name, tags or ingredients contain every word typed. */
export function searchRecipes(recipes: BookRecipe[], query: string): BookRecipe[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return recipes
    .filter((r) => {
      const haystack = [r.name, ...r.tags, r.primaryProtein, r.primaryCarb, ...r.ingredientNames]
        .join(" \n ")
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => {
      // name matches first
      const an = words.every((w) => a.name.toLowerCase().includes(w)) ? 0 : 1;
      const bn = words.every((w) => b.name.toLowerCase().includes(w)) ? 0 : 1;
      return an - bn || a.name.localeCompare(b.name);
    });
}
