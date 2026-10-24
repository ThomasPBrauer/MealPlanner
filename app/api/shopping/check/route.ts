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

  const rows = await prisma.shoppingCheck.findMany({
    where: { email: session.user.email, weekStart: week },
    select: { itemKey: true },
  });

  return NextResponse.json({ checked: rows.map((r) => r.itemKey) });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const email = session.user.email;

  const body = await req.json().catch(() => ({}));
  const week = typeof body.week === "string" ? body.week : "";
  const itemKey = typeof body.itemKey === "string" ? body.itemKey.trim() : "";
  const checked = Boolean(body.checked);

  if (!ISO_DATE.test(week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!itemKey) {
    return NextResponse.json({ error: "itemKey is required." }, { status: 400 });
  }

  if (checked) {
    await prisma.shoppingCheck.upsert({
      where: { email_weekStart_itemKey: { email, weekStart: week, itemKey } },
      update: {},
      create: { email, weekStart: week, itemKey },
    });
  } else {
    // presence = checked, so unchecking just deletes the row — same
    // pattern as SlotNote (an empty note deletes rather than storing blank)
    await prisma.shoppingCheck.deleteMany({
      where: { email, weekStart: week, itemKey },
    });
  }

  return NextResponse.json({ week, itemKey, checked });
}
