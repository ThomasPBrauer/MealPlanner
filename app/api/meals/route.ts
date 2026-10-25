import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getLastPlannedDates,
  parseMealInput,
  sanitizeComponentIds,
  serializeMeal,
  toPrismaData,
} from "@/lib/meals";

export async function GET() {
  // signed-in users see public recipes plus their own; anonymous visitors
  // get public recipes only (this route is open to GET without a session)
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;

  const where: Prisma.MealWhereInput = email
    ? { OR: [{ visibility: "public" }, { ownerEmail: email }] }
    : { visibility: "public" };

  const [rows, lastPlanned] = await Promise.all([
    prisma.meal.findMany({ where, orderBy: { name: "asc" } }),
    email ? getLastPlannedDates(email) : Promise.resolve(new Map<string, string>()),
  ]);

  return NextResponse.json({
    meals: rows.map((r) => ({
      ...serializeMeal(r, email),
      lastPlannedDate: lastPlanned.get(r.id) ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = parseMealInput(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const components = await sanitizeComponentIds(session.user.email, parsed.components);

  const created = await prisma.meal.create({
    data: { ownerEmail: session.user.email, ...toPrismaData(parsed, components) },
  });

  return NextResponse.json(serializeMeal(created, session.user.email), { status: 201 });
}
