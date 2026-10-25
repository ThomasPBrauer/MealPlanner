import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createMealWithSlug,
  listVisibleMeals,
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
  return NextResponse.json({ meals: await listVisibleMeals(email) });
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

  const created = await createMealWithSlug({
    ownerEmail: session.user.email,
    ...toPrismaData(parsed, components),
  });

  return NextResponse.json(serializeMeal(created, session.user.email), { status: 201 });
}
