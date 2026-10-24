import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BODY_FONT_OPTIONS,
  DAYS,
  DEFAULT_PREFERENCES,
  DayKey,
  FONT_OPTIONS,
  NUTRITION_KEYS,
  NutritionKey,
  Orientation,
} from "@/lib/types";

const VALID_DAYS = DAYS.map((d) => d.key);
const VALID_DISPLAY_FONTS = FONT_OPTIONS.map((f) => f.key);
const VALID_BODY_FONTS = BODY_FONT_OPTIONS.map((f) => f.key);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// "" is a valid stored value meaning "show nothing" — only an entirely
// missing/invalid value (e.g. a row created before this column existed)
// falls back to the default.
function parseVisibleNutrients(value: string | undefined | null): NutritionKey[] {
  if (value === undefined || value === null) return DEFAULT_PREFERENCES.visibleNutrients;
  if (value === "") return [];
  return value
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is NutritionKey => (NUTRITION_KEYS as string[]).includes(k));
}

function sanitizeVisibleNutrients(value: unknown): NutritionKey[] {
  if (!Array.isArray(value)) return DEFAULT_PREFERENCES.visibleNutrients;
  return value.filter((k): k is NutritionKey => (NUTRITION_KEYS as string[]).includes(k));
}

function sanitizeHex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

// "" (empty array) is valid and means "use the built-in default order" —
// only non-array input falls back further, to the default preference value.
function parseDepartmentOrder(value: string | undefined | null): string[] {
  if (!value) return DEFAULT_PREFERENCES.departmentOrder;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

function sanitizeDepartmentOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of value) {
    if (typeof d !== "string") continue;
    const trimmed = d.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const prefs = await prisma.userPreference.findUnique({
    where: { email: session.user.email },
  });

  return NextResponse.json({
    orientation: (prefs?.orientation as Orientation) ?? DEFAULT_PREFERENCES.orientation,
    firstDayOfWeek:
      (prefs?.firstDayOfWeek as DayKey) ?? DEFAULT_PREFERENCES.firstDayOfWeek,
    displayFont: prefs?.displayFont ?? DEFAULT_PREFERENCES.displayFont,
    bodyFont: prefs?.bodyFont ?? DEFAULT_PREFERENCES.bodyFont,
    colors: {
      board: prefs?.colorBoard ?? DEFAULT_PREFERENCES.colors.board,
      panel: prefs?.colorPanel ?? DEFAULT_PREFERENCES.colors.panel,
      gold: prefs?.colorGold ?? DEFAULT_PREFERENCES.colors.gold,
      tomato: prefs?.colorTomato ?? DEFAULT_PREFERENCES.colors.tomato,
      chalk: prefs?.colorChalk ?? DEFAULT_PREFERENCES.colors.chalk,
    },
    visibleNutrients: parseVisibleNutrients(prefs?.visibleNutrients),
    hideCheckedItems: prefs?.hideCheckedItems ?? DEFAULT_PREFERENCES.hideCheckedItems,
    hideCompletedDepartments: prefs?.hideCompletedDepartments ?? DEFAULT_PREFERENCES.hideCompletedDepartments,
    departmentOrder: parseDepartmentOrder(prefs?.departmentOrder),
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const orientation: Orientation =
    body.orientation === "daysSide" ? "daysSide" : "daysTop";

  const firstDayOfWeek: DayKey = VALID_DAYS.includes(body.firstDayOfWeek)
    ? body.firstDayOfWeek
    : "mon";

  const displayFont = VALID_DISPLAY_FONTS.includes(body.displayFont)
    ? body.displayFont
    : DEFAULT_PREFERENCES.displayFont;

  const bodyFont = VALID_BODY_FONTS.includes(body.bodyFont)
    ? body.bodyFont
    : DEFAULT_PREFERENCES.bodyFont;

  const colors = body.colors ?? {};
  const colorBoard = sanitizeHex(colors.board, DEFAULT_PREFERENCES.colors.board);
  const colorPanel = sanitizeHex(colors.panel, DEFAULT_PREFERENCES.colors.panel);
  const colorGold = sanitizeHex(colors.gold, DEFAULT_PREFERENCES.colors.gold);
  const colorTomato = sanitizeHex(colors.tomato, DEFAULT_PREFERENCES.colors.tomato);
  const colorChalk = sanitizeHex(colors.chalk, DEFAULT_PREFERENCES.colors.chalk);
  const visibleNutrients = sanitizeVisibleNutrients(body.visibleNutrients).join(",");
  const hideCheckedItems = Boolean(body.hideCheckedItems);
  const hideCompletedDepartments = Boolean(body.hideCompletedDepartments);
  const departmentOrderList = sanitizeDepartmentOrder(body.departmentOrder);
  const departmentOrder = departmentOrderList.length > 0 ? JSON.stringify(departmentOrderList) : null;

  const data = {
    orientation,
    firstDayOfWeek,
    displayFont,
    bodyFont,
    colorBoard,
    colorPanel,
    colorGold,
    colorTomato,
    colorChalk,
    visibleNutrients,
    hideCheckedItems,
    hideCompletedDepartments,
    departmentOrder,
  };

  const prefs = await prisma.userPreference.upsert({
    where: { email: session.user.email },
    update: data,
    create: { email: session.user.email, ...data },
  });

  return NextResponse.json({
    orientation: prefs.orientation,
    firstDayOfWeek: prefs.firstDayOfWeek,
    displayFont: prefs.displayFont,
    bodyFont: prefs.bodyFont,
    colors: {
      board: prefs.colorBoard,
      panel: prefs.colorPanel,
      gold: prefs.colorGold,
      tomato: prefs.colorTomato,
      chalk: prefs.colorChalk,
    },
    visibleNutrients: parseVisibleNutrients(prefs.visibleNutrients),
    hideCheckedItems: prefs.hideCheckedItems,
    hideCompletedDepartments: prefs.hideCompletedDepartments,
    departmentOrder: parseDepartmentOrder(prefs.departmentOrder),
  });
}
