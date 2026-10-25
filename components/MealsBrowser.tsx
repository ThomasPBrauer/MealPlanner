"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Meal } from "@/lib/types";
import MealCard from "@/components/MealCard";

type MealWithMine = Meal & { isMine: boolean };

// The recipe list's interactive half: search + filter over meals the server
// already fetched and rendered. Because the meals arrive as props, the full
// list is in the page's initial HTML (crawlable, visible before any
// JavaScript runs); this component only narrows it down client-side.
export default function MealsBrowser({
  initialMeals,
  signedIn,
  email,
  weekParam,
}: {
  initialMeals: MealWithMine[];
  signedIn: boolean;
  email: string | null;
  // the board week we arrived from, if any — carried through to "Back to
  // the board" and to each recipe link, so drilling into a meal from here
  // and then backing out lands on the same week rather than resetting to today
  weekParam: string | null;
}) {
  const isAnon = !signedIn;
  const boardHref = weekParam ? `/?week=${weekParam}` : "/";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "public">("all");

  const filtered = useMemo(() => {
    return initialMeals.filter((m) => {
      const matchesQuery = m.name.toLowerCase().includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ? true : filter === "mine" ? m.isMine : m.visibility === "public" && !m.isMine;
      return matchesQuery && matchesFilter;
    });
  }, [initialMeals, query, filter]);

  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          {isAnon ? (
            <Link
              href={`/login?callbackUrl=${encodeURIComponent("/meals")}`}
              className="text-[12px] text-sage/80 transition-colors hover:text-chalk"
            >
              Sign in to plan your week →
            </Link>
          ) : (
            <Link href={boardHref} className="text-[12px] text-sage/80 transition-colors hover:text-chalk">
              ← Back to the board
            </Link>
          )}
          <p className="text-[12px] text-sage/70">{email}</p>
        </div>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-sage">Recipe box</p>
            <h1 className="font-display text-4xl leading-none text-chalk">
              {isAnon ? "Public Recipes" : "Your Meals"}
            </h1>
          </div>
          {!isAnon && (
            <Link
              href="/meals/new"
              className="rounded-md bg-gold px-4 py-2 text-[13px] font-semibold text-ink"
            >
              + New meal
            </Link>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meals…"
            className="flex-1 rounded-md border border-white/10 bg-board-panel px-3 py-2 text-[13px] text-chalk placeholder:text-sage/50 outline-none focus:border-gold/60"
          />
          <div className={`flex gap-1.5 ${isAnon ? "hidden" : ""}`}>
            {(["all", "mine", "public"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                  filter === f
                    ? "border-gold text-gold"
                    : "border-white/10 text-sage/80 hover:border-white/25"
                }`}
              >
                {f === "all" ? "All" : f === "mine" ? "Mine" : "Public"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 py-10 text-center text-[13px] text-sage/60">
            No meals match. Try a new search
            {isAnon ? (
              "."
            ) : (
              <>
                , or{" "}
                <Link href="/meals/new" className="text-gold underline-offset-2 hover:underline">
                  create one
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                variant="browse"
                weekIso={weekParam ?? undefined}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
