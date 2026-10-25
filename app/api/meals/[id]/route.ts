import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  containsCycle,
  ensureMealSlug,
  getVisibleMeal,
  parseMealInput,
  sanitizeComponentIds,
  serializeMeal,
  toPrismaData,
} from "@/lib/meals";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  // open to anonymous visitors, but getVisibleMeal only ever returns a
  // personal meal to its owner — everyone else gets public meals only
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;
  const meal = await getVisibleMeal(params.id, email);
  if (!meal) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(meal);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const existing = await prisma.meal.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.ownerEmail !== session.user.email) {
    return NextResponse.json(
      { error: "Only the owner can edit this meal." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = parseMealInput(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const components = await sanitizeComponentIds(session.user.email, parsed.components, params.id);
  if (await containsCycle(params.id, components)) {
    return NextResponse.json(
      { error: "Can't include a recipe that (directly or indirectly) already includes this one." },
      { status: 400 }
    );
  }

  let updated = await prisma.meal.update({
    where: { id: params.id },
    data: toPrismaData(parsed, components),
  });
  // a recipe from before slugs existed gets its slug the first time it's
  // saved; one that already has a slug keeps it even if it was renamed
  if (!updated.slug) updated = await ensureMealSlug(updated.id, updated.name);

  return NextResponse.json(serializeMeal(updated, session.user.email));
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const existing = await prisma.meal.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.ownerEmail !== session.user.email) {
    return NextResponse.json(
      { error: "Only the owner can delete this meal." },
      { status: 403 }
    );
  }

  // deleting a meal also clears it from everyone's planned history —
  // otherwise every week that ever used it would be left pointing at a
  // meal id that no longer exists
  //
  // it also needs to be stripped out of any other meal's `components`
  // list, or those recipes would silently keep pointing at a deleted
  // sub-recipe (resolveIngredients/resolveInstructionGroups already skip
  // missing ids gracefully, but leaving the dangling id around is untidy
  // and would resurface if that id were ever reused)
  const referencing = await prisma.meal.findMany({
    where: { components: { contains: params.id } },
  });
  const cleanupOps = referencing.flatMap((m) => {
    let components: string[] = [];
    try {
      components = JSON.parse(m.components);
    } catch {
      return [];
    }
    if (!components.includes(params.id)) return [];
    return [
      prisma.meal.update({
        where: { id: m.id },
        data: { components: JSON.stringify(components.filter((id) => id !== params.id)) },
      }),
    ];
  });

  await prisma.$transaction([
    prisma.plannedMeal.deleteMany({ where: { mealId: params.id } }),
    ...cleanupOps,
    prisma.meal.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
