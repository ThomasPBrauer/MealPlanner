import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireOwnedItem(email: string, id: string) {
  const item = await prisma.shoppingManualItem.findUnique({ where: { id } });
  if (!item || item.email !== email) return null;
  return item;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const existing = await requireOwnedItem(session.user.email, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (typeof body.checked === "boolean") data.checked = body.checked;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.amount === "string") data.amount = body.amount.trim();
  if (typeof body.unit === "string") data.unit = body.unit.trim();
  if ("department" in body) {
    data.department =
      typeof body.department === "string" && body.department.trim() ? body.department.trim() : null;
  }
  if ("sortOrder" in body) {
    data.sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? Math.round(body.sortOrder)
        : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const item = await prisma.shoppingManualItem.update({ where: { id: params.id }, data });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const existing = await requireOwnedItem(session.user.email, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.shoppingManualItem.delete({ where: { id: params.id } });
  return NextResponse.json({ deleted: true });
}
