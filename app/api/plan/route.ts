import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MEAL_TYPES } from "@/lib/types";

const VALID_MEAL_TYPES = MEAL_TYPES.map((m) => m.key);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return NextResponse.json(
      { error: "start and end must be YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const rows = await prisma.plannedMeal.findMany({
    where: { email: session.user.email, date: { gte: start, lte: end } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      date: r.date,
      mealType: r.mealType,
      mealId: r.mealId,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { date, mealType, mealId } = body;

  if (!ISO_DATE.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (!VALID_MEAL_TYPES.includes(mealType)) {
    return NextResponse.json({ error: "Invalid meal type." }, { status: 400 });
  }

  // re-verify visibility server-side rather than trusting the client — a
  // personal meal owned by someone else must never be plannable, even if
  // its id were guessed or replayed
  const meal = await prisma.meal.findUnique({ where: { id: mealId } });
  const visible =
    meal && (meal.visibility === "public" || meal.ownerEmail === session.user.email);
  if (!visible) {
    return NextResponse.json({ error: "Unknown meal." }, { status: 400 });
  }

  const entry = await prisma.plannedMeal.create({
    data: { email: session.user.email, date, mealType, mealId },
  });

  return NextResponse.json(
    { id: entry.id, date: entry.date, mealType: entry.mealType, mealId: entry.mealId },
    { status: 201 }
  );
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return NextResponse.json(
      { error: "start and end must be YYYY-MM-DD." },
      { status: 400 }
    );
  }

  await prisma.plannedMeal.deleteMany({
    where: { email: session.user.email, date: { gte: start, lte: end } },
  });

  return NextResponse.json({ ok: true });
}
