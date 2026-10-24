export const TAG_PALETTE = [
  "#E8B04B", // gold
  "#8FA998", // sage
  "#C1502E", // tomato
  "#8C6FB0", // plum
  "#4C8C9E", // teal
  "#B0793F", // clay
];

/** Deterministically maps a free-text tag to one of the palette colors, so
 * the same tag always renders the same accent without needing a fixed
 * lookup table (tags are now user-entered, not a closed set). */
export function colorForTag(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

/** Accent color for a meal's tag list — uses the first tag (a meal's
 * "primary" tag for display purposes), falling back to "Other" for an
 * untagged meal so every card still gets a consistent accent. */
export function colorForTags(tags: string[]): string {
  return colorForTag(tags[0] ?? "Other");
}

/** Common tag suggestions shown via a <datalist> on the meal form — the
 * field still accepts any free text. */
export const TAG_SUGGESTIONS = [
  "Quick",
  "Vegetarian",
  "Vegan",
  "Family",
  "Meal Prep",
  "Breakfast",
  "Dessert",
  "Low Carb",
  "High Protein",
  "Comfort Food",
];

/** Grocery-store departments shown via a <datalist> on each ingredient row
 * — free text, but this also defines the print order for the shopping
 * list (roughly the order you'd walk a typical store), with any
 * unrecognized or blank department grouped last under "Other". */
export const DEPARTMENT_ORDER = [
  "Produce",
  "Bakery",
  "Deli",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Frozen",
  "Pantry",
  "Canned Goods",
  "Spices & Seasonings",
  "Condiments",
  "Snacks",
  "Beverages",
  "Household",
  "Other",
];

export const DEPARTMENT_SUGGESTIONS = DEPARTMENT_ORDER.filter((d) => d !== "Other");

/** Where an ingredient's department sorts in the shopping list — known
 * departments in shopping order, anything else (including blank) last. */
export function departmentSortIndex(department: string): number {
  const idx = DEPARTMENT_ORDER.indexOf(department.trim());
  return idx === -1 ? DEPARTMENT_ORDER.length : idx;
}

/** Same as departmentSortIndex, but against a user's own department order
 * (falls back to the built-in order when they haven't customized one). */
export function departmentSortIndexWithOrder(department: string, customOrder: string[]): number {
  const order = customOrder.length > 0 ? customOrder : DEPARTMENT_ORDER;
  const idx = order.indexOf(department.trim());
  return idx === -1 ? order.length : idx;
}
