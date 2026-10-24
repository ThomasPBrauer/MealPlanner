export type MealType = "breakfast" | "lunch" | "dinner";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type MealVisibility = "public" | "personal";

export const PROTEIN_OPTIONS = [
  "None",
  "Beef",
  "Chicken",
  "Pork",
  "Turkey",
  "Fish",
  "Shellfish",
  "Eggs",
  "Tofu",
  "Beans/Legumes",
  "Other",
] as const;

export const CARB_OPTIONS = [
  "None",
  "Pasta",
  "Rice",
  "Bread",
  "Tortillas",
  "Potato",
  "Quinoa",
  "Oats",
  "Beans/Legumes",
  "Other",
] as const;

export interface NutritionInfo {
  calories?: number;
  protein?: number; // grams
  carbs?: number; // grams
  fiber?: number; // grams
  netCarbs?: number; // grams
  fat?: number; // grams
  sugar?: number; // grams
  sodium?: number; // mg
}

export type NutritionKey = keyof NutritionInfo;

// Shared metadata for every nutrition field — used by the meal form, the
// settings page (to pick which fields show on Meal Cards), and the Meal
// Card / day-total rendering itself, so labels and units only live in one place.
export const NUTRITION_FIELDS: { key: NutritionKey; label: string; shortLabel: string; unit: string }[] = [
  { key: "calories", label: "Calories", shortLabel: "cal", unit: "" },
  { key: "protein", label: "Protein", shortLabel: "protein", unit: "g" },
  { key: "carbs", label: "Total Carbohydrate", shortLabel: "carbs", unit: "g" },
  { key: "fiber", label: "Dietary Fiber", shortLabel: "fiber", unit: "g" },
  { key: "netCarbs", label: "Net Carbs", shortLabel: "net carbs", unit: "g" },
  { key: "fat", label: "Fat", shortLabel: "fat", unit: "g" },
  { key: "sugar", label: "Sugar", shortLabel: "sugar", unit: "g" },
  { key: "sodium", label: "Sodium", shortLabel: "sodium", unit: "mg" },
];

export const NUTRITION_KEYS: NutritionKey[] = NUTRITION_FIELDS.map((f) => f.key);

export type TagMode = "and" | "or";

export type PantrySortKey = "name" | "minutes" | "lastPlanned" | NutritionKey;

// Metadata for the Pantry's sort dropdown — name/prep-time/last-made plus every
// nutrition field. `numeric: false` (name) sorts alphabetically; everything else
// sorts as a number where a missing value always sorts to the end regardless of direction.
export const PANTRY_SORT_OPTIONS: { key: PantrySortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Name", numeric: false },
  { key: "minutes", label: "Prep time", numeric: true },
  { key: "lastPlanned", label: "Last made", numeric: true },
  ...NUTRITION_FIELDS.map((f) => ({ key: f.key, label: f.label, numeric: true as const })),
];

export interface Ingredient {
  id: string;
  name: string;
  amount: string; // free text, e.g. "2", "1/2", "a pinch"
  unit: string; // free text, e.g. "cups", "tbsp", "" for count items
  department: string; // free text grocery section, e.g. "Produce" — used to group the printed shopping list
}

export interface Meal {
  id: string;
  name: string;
  tags: string[]; // free-form category labels, e.g. ["Vegetarian", "Quick", "Family"]
  primaryProtein: string;
  primaryCarb: string;
  minutes: number;
  servings: number;
  ownerEmail: string;
  visibility: MealVisibility;
  source: string; // where the recipe came from — cookbook, URL, person, etc.
  notes: string; // personal comments
  nutrition: NutritionInfo;
  ingredients: Ingredient[];
  instructions: string[]; // ordered steps
  components: string[]; // other Meal ids this recipe is built from, in order
  photo?: string | null; // base64 data URL, resized/compressed client-side before upload
  isMine?: boolean; // present when fetched via /api/meals; absent elsewhere
  // the viewer's most recent planned date for this meal ("YYYY-MM-DD"), or
  // null if they've never planned it — present only via /api/meals, used
  // for the Pantry's "least/most recently made" sort
  lastPlannedDate?: string | null;
}

// An instance of a meal placed on the board (same recipe can appear more than once)
export interface PlacedMeal extends Meal {
  instanceId: string;
}

export type WeekPlan = Record<string, PlacedMeal[]>;

export const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

export function slotKey(isoDate: string, meal: MealType): string {
  return `${isoDate}-${meal}`;
}

export type Orientation = "daysTop" | "daysSide";

export interface ThemeColors {
  board: string; // main page background
  panel: string; // calendar/pantry panel surface
  gold: string; // primary accent
  tomato: string; // secondary accent (also used for remove/error states)
  chalk: string; // main text color on dark surfaces
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  board: "#1F2A24",
  panel: "#26332C",
  gold: "#E8B04B",
  tomato: "#C1502E",
  chalk: "#F3EFE3",
};

export const FONT_OPTIONS = [
  { key: "caveat", label: "Caveat — handwritten", family: "'Caveat', cursive" },
  { key: "playfair", label: "Playfair Display — elegant serif", family: "'Playfair Display', serif" },
  { key: "poppins", label: "Poppins — rounded sans", family: "'Poppins', sans-serif" },
  { key: "specialElite", label: "Special Elite — typewriter", family: "'Special Elite', monospace" },
] as const;

export const BODY_FONT_OPTIONS = [
  { key: "workSans", label: "Work Sans", family: "'Work Sans', sans-serif" },
  { key: "inter", label: "Inter", family: "'Inter', sans-serif" },
  { key: "merriweather", label: "Merriweather — serif", family: "'Merriweather', serif" },
  { key: "jetbrainsMono", label: "JetBrains Mono", family: "'JetBrains Mono', monospace" },
] as const;

export type DisplayFontKey = (typeof FONT_OPTIONS)[number]["key"];
export type BodyFontKey = (typeof BODY_FONT_OPTIONS)[number]["key"];

export interface Preferences {
  orientation: Orientation;
  firstDayOfWeek: DayKey;
  displayFont: DisplayFontKey;
  bodyFont: BodyFontKey;
  colors: ThemeColors;
  visibleNutrients: NutritionKey[]; // which nutrition fields to surface on Meal Cards & day totals
  hideCheckedItems: boolean; // shopping list: hide checked items instead of showing them struck through
  hideCompletedDepartments: boolean; // shopping list: hide a whole department once every item in it is checked
  departmentOrder: string[]; // shopping list: user's preferred department order (includes custom ones); [] = use the built-in default
}

export const DEFAULT_PREFERENCES: Preferences = {
  orientation: "daysTop",
  firstDayOfWeek: "mon",
  displayFont: "caveat",
  bodyFont: "workSans",
  colors: DEFAULT_THEME_COLORS,
  visibleNutrients: ["calories"],
  hideCheckedItems: false,
  hideCompletedDepartments: false,
  departmentOrder: [],
};

// A user's lasting department/position override for one ingredient (by
// name), as returned by /api/shopping/ingredient-prefs.
export interface IngredientPrefEntry {
  department: string | null;
  sortOrder: number | null;
}
