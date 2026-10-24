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
    return NextResponse.json({ error: "start and end must be YYYY-MM-DD." }, { status: 400 });
  }

  const rows = await prisma.slotNote.findMany({
    where: { email: session.user.email, date: { gte: start, lte: end } },
  });

  return NextResponse.json({
    notes: rows.map((r) => ({ date: r.date, mealType: r.mealType, note: r.note })),
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { date, mealType } = body;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!ISO_DATE.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (!VALID_MEAL_TYPES.includes(mealType)) {
    return NextResponse.json({ error: "Invalid meal type." }, { status: 400 });
  }

  if (!note) {
    // an empty note means "clear it" — delete rather than store a blank row
    await prisma.slotNote.deleteMany({
      where: { email: session.user.email, date, mealType },
    });
    return NextResponse.json({ date, mealType, note: "" });
  }

  const saved = await prisma.slotNote.upsert({
    where: { email_date_mealType: { email: session.user.email, date, mealType } },
    update: { note },
    create: { email: session.user.email, date, mealType, note },
  });

  return NextResponse.json({ date: saved.date, mealType: saved.mealType, note: saved.note });
}
