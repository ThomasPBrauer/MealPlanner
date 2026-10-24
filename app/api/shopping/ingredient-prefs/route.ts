import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IngredientPrefEntry } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMap(rows: any[]): Record<string, IngredientPrefEntry> {
  const map: Record<string, IngredientPrefEntry> = {};
  for (const row of rows) {
    map[row.ingredientKey] = { department: row.department ?? null, sortOrder: row.sortOrder ?? null };
  }
  return map;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const rows = await prisma.ingredientPreference.findMany({
    where: { email: session.user.email },
  });

  return NextResponse.json({ prefs: toMap(rows) });
}

interface UpdateInput {
  ingredientKey: string;
  department?: string | null;
  sortOrder?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseUpdate(raw: any): UpdateInput | null {
  const ingredientKey =
    typeof raw?.ingredientKey === "string" ? raw.ingredientKey.trim().toLowerCase() : "";
  if (!ingredientKey) return null;

  const update: UpdateInput = { ingredientKey };
  if ("department" in raw) {
    update.department =
      typeof raw.department === "string" && raw.department.trim() ? raw.department.trim() : null;
  }
  if ("sortOrder" in raw) {
    update.sortOrder = typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder)
      ? Math.round(raw.sortOrder)
      : null;
  }
  return update;
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const email = session.user.email;

  const body = await req.json().catch(() => ({}));
  const rawUpdates: unknown[] = Array.isArray(body.updates) ? body.updates : [];
  const updates: UpdateInput[] = rawUpdates
    .map((raw) => parseUpdate(raw))
    .filter((u): u is UpdateInput => u !== null);

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid updates." }, { status: 400 });
  }
  // a handful of items at a time (one department change, or reordering one
  // department's worth of items) — no need to worry about batch size limits
  if (updates.length > 200) {
    return NextResponse.json({ error: "Too many updates at once." }, { status: 400 });
  }

  await Promise.all(
    updates.map((u: UpdateInput) => {
      const setFields: { department?: string | null; sortOrder?: number | null } = {};
      if ("department" in u) setFields.department = u.department;
      if ("sortOrder" in u) setFields.sortOrder = u.sortOrder;
      return prisma.ingredientPreference.upsert({
        where: { email_ingredientKey: { email, ingredientKey: u.ingredientKey } },
        update: setFields,
        create: {
          email,
          ingredientKey: u.ingredientKey,
          department: u.department ?? null,
          sortOrder: u.sortOrder ?? null,
        },
      });
    })
  );

  const rows = await prisma.ingredientPreference.findMany({ where: { email } });
  return NextResponse.json({ prefs: toMap(rows) });
}
