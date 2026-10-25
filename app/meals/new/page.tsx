"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MealForm, { MealFormValues } from "@/components/MealForm";
import { mealPath } from "@/lib/slug";

export default function NewMealPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: MealFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(mealPath(data));
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <Link href="/meals" className="text-[12px] text-sage/80 transition-colors hover:text-chalk">
            ← Back to meals
          </Link>
        </div>

        <div className="chalk-texture rounded-xl bg-board p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-sage">Recipe box</p>
          <h1 className="mb-5 font-display text-4xl leading-none text-chalk">New Meal</h1>

          <MealForm
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
            submitLabel="Create meal"
          />
        </div>
      </div>
    </main>
  );
}
