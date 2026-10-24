"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Meal } from "@/lib/types";
import { colorForTags } from "@/lib/data";
import { parseISODateLocal } from "@/lib/date";
import { resolveIngredients, resolveInstructionGroups } from "@/lib/recipe";

type MealWithMine = Meal & { isMine: boolean };
type HistoryResponse =
  | { isOwner: true; history: { email: string; dates: string[] }[] }
  | { isOwner: false; own: string[] };

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
  return parseISODateLocal(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MealDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [meal, setMeal] = useState<MealWithMine | null>(null);
  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/meals/${params.id}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/meals/${params.id}/history`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/meals`).then((res) => (res.ok ? res.json() : null)),
    ]).then(([mealData, historyData, mealsData]) => {
      if (cancelled) return;
      if (!mealData) {
        setNotFound(true);
      } else {
        setMeal(mealData);
        setHistory(historyData);
        setAllMeals(mealsData?.meals ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleDelete() {
    if (!meal) return;
    if (!confirm(`Delete "${meal.name}"? This also removes it from everyone's planned history.`)) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/meals/${meal.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/meals");
    } else {
      setDeleting(false);
      alert("Couldn't delete this meal — please try again.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-board p-4 md:p-6">
        <p className="mx-auto max-w-2xl text-[13px] text-sage/70">Loading…</p>
      </main>
    );
  }

  if (notFound || !meal) {
    const fromBoardParam = searchParams.get("from") === "board";
    const weekBackParam = searchParams.get("week");
    const notFoundBackHref = fromBoardParam
      ? weekBackParam
        ? `/?week=${weekBackParam}`
        : "/"
      : "/meals";
    return (
      <main className="min-h-screen bg-board p-4 md:p-6">
        <div className="mx-auto max-w-2xl">
          <Link href={notFoundBackHref} className="text-[12px] text-sage/80 hover:text-chalk">
            {fromBoardParam ? "← Back to the board" : "← Back to meals"}
          </Link>
          <p className="mt-4 text-[13px] text-sage/70">
            That meal doesn't exist, or is personal to someone else.
          </p>
        </div>
      </main>
    );
  }

  const accent = colorForTags(meal.tags);

  // where "back" should go: the board (on the same week you were viewing)
  // if that's where you double-clicked from, otherwise the meals list
  const fromBoard = searchParams.get("from") === "board";
  const weekParam = searchParams.get("week");
  const backHref = fromBoard ? (weekParam ? `/?week=${weekParam}` : "/") : "/meals";
  const backLabel = fromBoard ? "← Back to the board" : "← Back to meals";
  const editHref =
    fromBoard && weekParam
      ? `/meals/${meal.id}/edit?from=board&week=${weekParam}`
      : `/meals/${meal.id}/edit`;

  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href={backHref} className="text-[12px] text-sage/80 transition-colors hover:text-chalk">
            {backLabel}
          </Link>
          {meal.isMine && (
            <div className="flex items-center gap-3">
              <Link
                href={editHref}
                className="text-[11px] text-sage/90 transition-colors hover:text-gold"
              >
                Edit
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-[11px] text-sage/90 transition-colors hover:text-tomato disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
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
              {(() => {
                const resolved = resolveIngredients(meal, allMeals);
                if (resolved.length === 0) {
                  return <p className="mt-2 text-[12px] text-ink/50">No ingredients listed.</p>;
                }
                return (
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {resolved.map((ing, i) => (
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
                );
              })()}
            </div>

            <div className="rounded-md bg-paper p-4 text-ink shadow-card">
              <h2 className="font-display text-2xl leading-none">Instructions</h2>
              {(() => {
                const groups = resolveInstructionGroups(meal, allMeals);
                if (groups.length === 0) {
                  return <p className="mt-2 text-[12px] text-ink/50">No instructions yet.</p>;
                }
                return (
                  <div className="mt-2 space-y-3">
                    {groups.map((group, gi) => (
                      <div key={gi}>
                        {groups.length > 1 && (
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
                );
              })()}
            </div>
          </div>
        </div>

        {/* history */}
        <div className="chalk-texture mt-4 rounded-xl bg-board p-6">
          <h2 className="mb-2 font-display text-2xl leading-none text-chalk">History</h2>
          {history && "isOwner" in history && history.isOwner ? (
            history.history.length === 0 ? (
              <p className="text-[12px] text-sage/70">Nobody's planned this meal yet.</p>
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
          ) : history && "own" in history ? (
            history.own.length === 0 ? (
              <p className="text-[12px] text-sage/70">You haven't planned this meal yet.</p>
            ) : (
              <p className="text-[12px] text-sage/80">
                You've planned this {history.own.length} time{history.own.length === 1 ? "" : "s"}:{" "}
                <span className="text-sage/60">{history.own.slice(0, 8).map(formatDate).join(", ")}</span>
                {history.own.length > 8 && ` +${history.own.length - 8} more`}
              </p>
            )
          ) : (
            <p className="text-[12px] text-sage/70">No history yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}

export default function MealDetailPage() {
  return (
    <Suspense fallback={null}>
      <MealDetailContent />
    </Suspense>
  );
}
