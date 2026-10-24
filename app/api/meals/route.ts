import { NextResponse } from "next/server";
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const email = session.user.email;

  const [rows, lastPlanned] = await Promise.all([
    prisma.meal.findMany({
      where: { OR: [{ visibility: "public" }, { ownerEmail: email }] },
      orderBy: { name: "asc" },
    }),
    getLastPlannedDates(email),
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
