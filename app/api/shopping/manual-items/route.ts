import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const week = searchParams.get("week");
  if (!week || !ISO_DATE.test(week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD." }, { status: 400 });
  }

  const items = await prisma.shoppingManualItem.findMany({
    where: { email: session.user.email, weekStart: week },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const week = typeof body.week === "string" ? body.week : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const amount = typeof body.amount === "string" ? body.amount.trim() : "";
  const unit = typeof body.unit === "string" ? body.unit.trim() : "";
  const department =
    typeof body.department === "string" && body.department.trim() ? body.department.trim() : null;

  if (!ISO_DATE.test(week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const item = await prisma.shoppingManualItem.create({
    data: { email: session.user.email, weekStart: week, name, amount, unit, department },
  });

  return NextResponse.json({ item });
}
