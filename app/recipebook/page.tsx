import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ANONYMOUS_CONTRIBUTOR, serializeMeal } from "@/lib/meals";
import { OFF_OWNER_EMAIL } from "@/lib/openfoodfacts";
import type { BookRecipe } from "@/lib/recipeBook";
import RecipeBook from "@/components/RecipeBook";

// the book is public and always current, so it reads the database per request
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recipe Book — The Weekly Board",
  description:
    "A recipe book written by everyone who cooks here: browse public recipes by chapter, or search by name or ingredient.",
};

export default async function RecipeBookPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // public recipes people wrote — Open Food Facts product entries aren't recipes
  const rows = await prisma.meal.findMany({
    where: { visibility: "public", NOT: { ownerEmail: OFF_OWNER_EMAIL } },
    orderBy: { name: "asc" },
  });

  // credit each recipe to its owner's display name (never their email)
  const owners = await prisma.user.findMany({
    where: { email: { in: Array.from(new Set(rows.map((r) => r.ownerEmail))) } },
    select: { email: true, displayName: true },
  });
  const nameByEmail = new Map(owners.map((o) => [o.email, o.displayName] as const));

  const recipes: BookRecipe[] = rows.map((row) => {
    // no viewer: the owner's address is blanked, and it isn't sent anyway
    const m = serializeMeal(row);
    return {
      id: m.id,
      slug: m.slug ?? null,
      name: m.name,
      tags: m.tags,
      minutes: m.minutes,
      servings: m.servings,
      primaryProtein: m.primaryProtein,
      primaryCarb: m.primaryCarb,
      ingredientNames: m.ingredients.map((i) => i.name),
      hasPhoto: !!m.photo,
      contributor: nameByEmail.get(row.ownerEmail) || ANONYMOUS_CONTRIBUTOR,
    };
  });

  const chapter = typeof searchParams.chapter === "string" ? searchParams.chapter : null;
  return <RecipeBook recipes={recipes} initialChapter={chapter} />;
}
