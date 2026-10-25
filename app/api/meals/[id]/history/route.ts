import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;

  const meal = await prisma.meal.findUnique({ where: { id: params.id } });
  if (!meal) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (meal.visibility !== "public" && meal.ownerEmail !== email) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // anonymous visitors can read a public recipe but have no planning
  // history of their own — and must never see anyone else's
  if (!email) {
    return NextResponse.json({ isOwner: false, own: [] });
  }

  const isOwner = meal.ownerEmail === email;

  if (isOwner) {
    // owners get the full picture: every user who's planned this meal, and when
    const rows = await prisma.plannedMeal.findMany({
      where: { mealId: params.id },
      orderBy: { date: "desc" },
    });
    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      const list = byUser.get(r.email) ?? [];
      list.push(r.date);
      byUser.set(r.email, list);
    }
    return NextResponse.json({
      isOwner: true,
      history: Array.from(byUser.entries()).map(([userEmail, dates]) => ({
        email: userEmail,
        dates,
      })),
    });
  }

  // non-owners (viewing a public meal) only get their own usage, not
  // everyone else's — that stays private to the owner
  const rows = await prisma.plannedMeal.findMany({
    where: { mealId: params.id, email },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ isOwner: false, own: rows.map((r) => r.date) });
}
