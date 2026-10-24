import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MEAL_TYPES } from "@/lib/types";

const VALID_MEAL_TYPES = MEAL_TYPES.map((m) => m.key);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const existing = await prisma.plannedMeal.findUnique({
    where: { id: params.id },
  });
  if (!existing || existing.email !== session.user.email) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const date = ISO_DATE.test(body.date) ? body.date : existing.date;
  const mealType = VALID_MEAL_TYPES.includes(body.mealType)
    ? body.mealType
    : existing.mealType;

  const updated = await prisma.plannedMeal.update({
    where: { id: params.id },
    data: { date, mealType },
  });

  return NextResponse.json({
    id: updated.id,
    date: updated.date,
    mealType: updated.mealType,
    mealId: updated.mealId,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const existing = await prisma.plannedMeal.findUnique({
    where: { id: params.id },
  });
  if (!existing || existing.email !== session.user.email) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.plannedMeal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
