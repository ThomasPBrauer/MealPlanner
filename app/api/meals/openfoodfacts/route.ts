import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMealWithSlug, serializeMeal, toPrismaData } from "@/lib/meals";
import {
  buildOffMealInput,
  mapRawOffProduct,
  OFF_OWNER_EMAIL,
  OFF_USER_AGENT,
  offProductUrl,
} from "@/lib/openfoodfacts";

const CODE_PATTERN = /^[a-zA-Z0-9]+$/;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code || !CODE_PATTERN.test(code)) {
    return NextResponse.json({ error: "Invalid Open Food Facts product code." }, { status: 400 });
  }

  const source = offProductUrl(code);

  // already imported (by this user or anyone else, previously) — reuse
  // the same public recipe rather than creating a duplicate every time
  // the same product gets dropped onto a board
  const existing = await prisma.meal.findFirst({ where: { ownerEmail: OFF_OWNER_EMAIL, source } });
  if (existing) {
    return NextResponse.json(serializeMeal(existing, session.user.email));
  }

  let raw: unknown;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,image_front_url,image_url,image_small_url,categories,nutriments`,
      { headers: { "User-Agent": OFF_USER_AGENT } }
    );
    if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
    raw = await res.json();
  } catch (err) {
    console.error("Open Food Facts product lookup failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach Open Food Facts. Try again in a moment." },
      { status: 502 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (raw as any)?.status;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const product = mapRawOffProduct((raw as any)?.product);
  if (status !== 1 || !product) {
    return NextResponse.json({ error: "That product couldn't be found on Open Food Facts." }, { status: 404 });
  }

  const input = buildOffMealInput(product);
  const created = await createMealWithSlug({ ownerEmail: OFF_OWNER_EMAIL, ...toPrismaData(input, []) });

  return NextResponse.json(serializeMeal(created, session.user.email), { status: 201 });
}
