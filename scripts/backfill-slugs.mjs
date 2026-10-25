/**
 * Gives every recipe that has no slug yet one made from its name, so
 * "Cancun shrimp tacos" lives at /meals/cancun-shrimp-tacos.
 *
 * USAGE (after `npm run db:push` has added the Meal.slug column):
 *   npm run db:backfill-slugs
 *
 * Safe to re-run — it only touches recipes whose slug is empty, never
 * changes an existing slug, and can be run again after loading more recipes
 * with scripts/import-meals.mjs. Oldest recipes are handled first, so when
 * two have the same name the older one gets the plain slug and the newer
 * one gets "-2".
 *
 * The slug rules below mirror lib/slug.ts (this is plain Node and can't
 * import that TypeScript file). If you change one, change the other.
 */

import { PrismaClient } from "@prisma/client";

const SLUG_MAX = 80;
const RESERVED = new Set(["new", "import", "openfoodfacts"]);

function slugify(name) {
  let s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX) {
    s = s.slice(0, SLUG_MAX);
    const cut = s.lastIndexOf("-");
    if (cut > SLUG_MAX / 2) s = s.slice(0, cut);
    s = s.replace(/-+$/g, "");
  }
  if (!s) s = "recipe";
  if (RESERVED.has(s)) s = `${s}-recipe`;
  return s;
}

const prisma = new PrismaClient();

async function main() {
  const taken = new Set(
    (await prisma.meal.findMany({ where: { slug: { not: null } }, select: { slug: true } })).map((m) => m.slug)
  );
  const todo = await prisma.meal.findMany({
    where: { slug: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });

  if (todo.length === 0) {
    console.log("Every recipe already has a slug. Nothing to do.");
    return;
  }

  let done = 0;
  for (const meal of todo) {
    const base = slugify(meal.name);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    await prisma.meal.update({ where: { id: meal.id }, data: { slug } });
    taken.add(slug);
    done++;
    console.log(`${slug}   ←  ${meal.name}`);
  }
  console.log(`\nDone: ${done} recipe${done === 1 ? "" : "s"} given a slug.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
