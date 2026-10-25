import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMealHistory, getVisibleMeal } from "@/lib/meals";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;

  const meal = await getVisibleMeal(params.id, email);
  if (!meal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // owners see everyone's usage; other signed-in users only their own; an
  // anonymous visitor can read a public recipe but has no history at all
  return NextResponse.json(await getMealHistory(meal.id, meal.isMine, email));
}
