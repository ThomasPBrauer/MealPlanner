"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import MealForm, { MealFormValues } from "@/components/MealForm";
import { Meal } from "@/lib/types";

type MealWithMine = Meal & { isMine: boolean };

function EditMealContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [meal, setMeal] = useState<MealWithMine | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // preserve "came from the board, on this week" through save-and-return
  const fromBoard = searchParams.get("from") === "board";
  const weekParam = searchParams.get("week");
  const contextSuffix = fromBoard && weekParam ? `?from=board&week=${weekParam}` : "";
  const detailHref = `/meals/${params.id}${contextSuffix}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/meals/${params.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setMeal(data);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleSubmit(values: MealFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      // the URL may carry the slug; the API's write routes take the id
      const res = await fetch(`/api/meals/${meal?.id ?? params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(detailHref);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <Link
            href={detailHref}
            className="text-[12px] text-sage/80 transition-colors hover:text-chalk"
          >
            ← Back to meal
          </Link>
        </div>

        <div className="chalk-texture rounded-xl bg-board p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-sage">Recipe box</p>
          <h1 className="mb-5 font-display text-4xl leading-none text-chalk">Edit Meal</h1>

          {loading ? (
            <p className="text-[13px] text-sage/70">Loading…</p>
          ) : !meal ? (
            <p className="text-[13px] text-sage/70">That meal doesn't exist.</p>
          ) : !meal.isMine ? (
            <p className="text-[13px] text-sage/70">
              Only the owner can edit this meal.
            </p>
          ) : (
            <MealForm
              initial={meal}
              onSubmit={handleSubmit}
              submitting={submitting}
              error={error}
              submitLabel="Save changes"
            />
          )}
        </div>
      </div>
    </main>
  );
}

export default function EditMealPage() {
  return (
    <Suspense fallback={null}>
      <EditMealContent />
    </Suspense>
  );
}
