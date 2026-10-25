import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMealHistory, getVisibleMeal, listVisibleMeals } from "@/lib/meals";
import { Meal } from "@/lib/types";
import { colorForTags } from "@/lib/data";
import { parseISODateLocal } from "@/lib/date";
import { resolveIngredients, resolveInstructionGroups } from "@/lib/recipe";
import DeleteMealButton from "@/components/DeleteMealButton";

// reads the session (cookies) and the database on every request
export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function isUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

const NUTRITION_ROWS: { key: keyof Meal["nutrition"]; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "carbs", label: "Total Carbohydrate", unit: "g" },
  { key: "fiber", label: "Dietary Fiber", unit: "g" },
  { key: "netCarbs", label: "Net Carbs", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
];

function formatDate(iso: string) {
  return parseISODateLocal(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function describeMeal(meal: Meal): string {
  const note = meal.notes.trim().split("\n")[0];
  if (note) return note.length > 200 ? `${note.slice(0, 197)}…` : note;
  const bits = [meal.tags.join(", ")];
  if (meal.minutes > 0) bits.push(`${meal.minutes} min`);
  bits.push(`${meal.servings} serving${meal.servings === 1 ? "" : "s"}`);
  return `${meal.name} — ${bits.join(" · ")}.`;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const session = await getServerSession(authOptions);
  const meal = await getVisibleMeal(params.id, session?.user?.email ?? undefined);
  if (!meal) return { title: "Recipe not found — The Weekly Board" };

  const title = `${meal.name} — The Weekly Board`;
  const description = describeMeal(meal);
  // uploaded photos are stored as base64 data URLs, which are no use as a
  // link-preview image — only offer one when it's a real URL
  const image = meal.photo && /^https?:\/\//i.test(meal.photo) ? meal.photo : undefined;

  return {
    title,
    description,
    // only public recipes are meant to be found; an owner's personal recipe
    // should never be indexed even if its URL leaks
    robots: meal.visibility === "public" ? undefined : { index: false, follow: false },
    openGraph: { title, description, images: image ? [image] : undefined },
  };
}

export default async function MealDetailPage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;
  const signedIn = !!email;

  const [meal, allMeals] = await Promise.all([
    getVisibleMeal(params.id, email),
    listVisibleMeals(email, { withLastPlanned: false }),
  ]);
  if (!meal) notFound();

  // planning history is per-user, so there's nothing to show signed out
  const history = signedIn ? await getMealHistory(meal.id, meal.isMine, email) : null;

  const accent = colorForTags(meal.tags);

  // where "back" should go: the board (on the same week you were viewing)
  // if that's where you double-clicked from, otherwise the meals list
  const fromBoard = first(searchParams.from) === "board" && signedIn;
  const weekParam = first(searchParams.week);
  const backHref = fromBoard ? (weekParam ? `/?week=${weekParam}` : "/") : "/meals";
  const backLabel = fromBoard ? "← Back to the board" : "← Back to meals";
  const editHref =
    fromBoard && weekParam
      ? `/meals/${meal.id}/edit?from=board&week=${weekParam}`
      : `/meals/${meal.id}/edit`;

  const resolvedIngredients = resolveIngredients(meal, allMeals);
  const instructionGroups = resolveInstructionGroups(meal, allMeals);

  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href={backHref} className="text-[12px] text-sage/80 transition-colors hover:text-chalk">
            {backLabel}
          </Link>
          {!signedIn && (
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/meals/${meal.id}`)}`}
              className="text-[11px] text-sage/90 transition-colors hover:text-gold"
            >
              Sign in to plan this meal
            </Link>
          )}
          {meal.isMine && (
            <div className="flex items-center gap-3">
              <Link
                href={editHref}
                className="text-[11px] text-sage/90 transition-colors hover:text-gold"
              >
                Edit
              </Link>
              <DeleteMealButton mealId={meal.id} mealName={meal.name} />
            </div>
          )}
        </div>

        <div className="chalk-texture mb-4 rounded-xl bg-board p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              {meal.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={meal.photo}
                  alt={meal.name}
                  className="h-24 w-24 shrink-0 rounded-lg object-cover shadow-card sm:h-32 sm:w-32"
                />
              )}
              <div>
                <p
                  className="text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: accent }}
                >
                  {meal.tags.join(", ")} · {meal.minutes} min · {meal.servings} serving{meal.servings === 1 ? "" : "s"}
                </p>
                <h1 className="font-display text-4xl leading-none text-chalk">{meal.name}</h1>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] text-sage/80">
              {meal.visibility === "public" ? "Public" : "Personal"}
            </span>
          </div>
          <p className="mt-3 text-[12px] text-sage/70">
            {meal.primaryProtein !== "None" && `Protein: ${meal.primaryProtein}`}
            {meal.primaryProtein !== "None" && meal.primaryCarb !== "None" && " · "}
            {meal.primaryCarb !== "None" && `Carb: ${meal.primaryCarb}`}
            {meal.primaryProtein === "None" && meal.primaryCarb === "None" && "No primary protein/carb set"}
          </p>

          {meal.components.length > 0 && (
            <p className="mt-2 text-[12px] text-sage/80">
              Built from:{" "}
              {meal.components.map((id, i) => {
                const sub = allMeals.find((m) => m.id === id);
                return (
                  <span key={id}>
                    {i > 0 && ", "}
                    {sub ? (
                      <Link href={`/meals/${sub.id}`} className="text-gold hover:underline">
                        {sub.name}
                      </Link>
                    ) : (
                      <span className="text-sage/50">a deleted recipe</span>
                    )}
                  </span>
                );
              })}
            </p>
          )}

          {meal.source && (
            <p className="mt-2 text-[12px] text-sage/70">
              Source:{" "}
              {isUrl(meal.source) ? (
                <a
                  href={meal.source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold hover:underline"
                >
                  {meal.source}
                </a>
              ) : (
                meal.source
              )}
            </p>
          )}

          {meal.notes && (
            <p className="mt-2 whitespace-pre-wrap text-[12px] text-sage/80">{meal.notes}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          {/* nutrition facts label */}
          <div className="h-fit rounded-md bg-paper p-4 text-ink shadow-card">
            <h2 className="border-b-4 border-ink pb-1 font-display text-2xl leading-none">
              Nutrition Facts
            </h2>
            <p className="mt-1 border-b border-ink/30 pb-1 text-[11px] text-ink/60">Per serving</p>
            <dl className="mt-1">
              {NUTRITION_ROWS.map((row) => {
                const value = meal.nutrition[row.key];
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between border-b border-ink/15 py-1 text-[12.5px]"
                  >
                    <dt>{row.label}</dt>
                    <dd className="font-semibold">
                      {value === undefined || value === null ? "—" : `${value}${row.unit}`}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <div className="space-y-4">
            <div className="rounded-md bg-paper p-4 text-ink shadow-card">
              <h2 className="font-display text-2xl leading-none">Ingredients</h2>
              {resolvedIngredients.length === 0 ? (
                <p className="mt-2 text-[12px] text-ink/50">No ingredients listed.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-[13px]">
                  {resolvedIngredients.map((ing, i) => (
                    <li key={`${ing.id}-${i}`}>
                      <span className="font-semibold">
                        {ing.amount} {ing.unit}
                      </span>{" "}
                      {ing.name}
                      {ing.fromMealName && (
                        <span className="text-ink/45"> — {ing.fromMealName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md bg-paper p-4 text-ink shadow-card">
              <h2 className="font-display text-2xl leading-none">Instructions</h2>
              {instructionGroups.length === 0 ? (
                <p className="mt-2 text-[12px] text-ink/50">No instructions yet.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {instructionGroups.map((group, gi) => (
                    <div key={gi}>
                      {instructionGroups.length > 1 && (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                          {group.mealName}
                        </p>
                      )}
                      <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
                        {group.steps.map((step, si) => (
                          <li key={si}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* history — only meaningful for a signed-in user */}
        {history && (
          <div className="chalk-texture mt-4 rounded-xl bg-board p-6">
            <h2 className="mb-2 font-display text-2xl leading-none text-chalk">History</h2>
            {history.isOwner ? (
              history.history.length === 0 ? (
                <p className="text-[12px] text-sage/70">Nobody&apos;s planned this meal yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.history.map((entry) => (
                    <div key={entry.email}>
                      <p className="text-[12px] text-chalk">
                        {entry.email}{" "}
                        <span className="text-sage/60">
                          · {entry.dates.length} time{entry.dates.length === 1 ? "" : "s"}
                        </span>
                      </p>
                      <p className="text-[11px] text-sage/70">
                        {entry.dates.slice(0, 8).map(formatDate).join(", ")}
                        {entry.dates.length > 8 && `, +${entry.dates.length - 8} more`}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : history.own.length === 0 ? (
              <p className="text-[12px] text-sage/70">You haven&apos;t planned this meal yet.</p>
            ) : (
              <p className="text-[12px] text-sage/80">
                You&apos;ve planned this {history.own.length} time{history.own.length === 1 ? "" : "s"}:{" "}
                <span className="text-sage/60">{history.own.slice(0, 8).map(formatDate).join(", ")}</span>
                {history.own.length > 8 && ` +${history.own.length - 8} more`}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
