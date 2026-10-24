"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import {
  Meal,
  NutritionKey,
  PANTRY_SORT_OPTIONS,
  PantrySortKey,
  TagMode,
} from "@/lib/types";
import { colorForTag } from "@/lib/data";
import { buildVirtualOffMeal, OFF_OWNER_EMAIL, offProductUrl, OffSearchResult } from "@/lib/openfoodfacts";
import DraggableMealCard from "./DraggableMealCard";
import { DragPayload } from "./DaySlot";

interface PantryProps {
  meals: Meal[];
  loading?: boolean;
  weekIso?: string;
  visibleNutrients?: NutritionKey[];
}

/** Compares two meals on a single sort key. `dir` is +1 for ascending, -1
 * for descending. Missing nutrition values always sort to the end (in
 * either direction) since they're not meaningful to rank; a missing
 * `lastPlannedDate` (never planned) is treated as infinitely long ago, so
 * it naturally sorts first under "least recently made". */
function compareMeals(a: Meal, b: Meal, key: PantrySortKey, dir: 1 | -1): number {
  if (key === "name") return dir * a.name.localeCompare(b.name);
  if (key === "minutes") return dir * (a.minutes - b.minutes);
  if (key === "lastPlanned") {
    const av = a.lastPlannedDate ?? "0000-00-00";
    const bv = b.lastPlannedDate ?? "0000-00-00";
    return dir * av.localeCompare(bv);
  }
  const av = a.nutrition[key as NutritionKey];
  const bv = b.nutrition[key as NutritionKey];
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1; // always last, regardless of direction
  if (bv === undefined) return -1;
  return dir * (av - bv);
}

function sortDirLabel(key: PantrySortKey, dir: 1 | -1): string {
  if (key === "name") return dir === 1 ? "A → Z" : "Z → A";
  if (key === "lastPlanned") return dir === 1 ? "Least recently made first" : "Most recently made first";
  return dir === 1 ? "Low → High" : "High → Low";
}

// Persists the Pantry's search/filter/sort choices across navigation (e.g.
// double-clicking a card to view the recipe, then hitting "Back to the
// board") — sessionStorage rather than localStorage so it clears with the
// tab rather than sticking around indefinitely across devices/sessions.
const PANTRY_UI_STORAGE_KEY = "mealplanner:pantryUiState";

interface PantryUiState {
  query: string;
  activeTags: string[];
  tagMode: TagMode;
  sortKey: PantrySortKey;
  sortDir: 1 | -1;
}

export default function Pantry({
  meals,
  loading,
  weekIso,
  visibleNutrients,
}: PantryProps) {
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagMode>("or");
  const [sortKey, setSortKey] = useState<PantrySortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  // guards the persist effect so it doesn't fire (and clobber storage with
  // defaults) before the restore effect below has had a chance to run
  const [hydrated, setHydrated] = useState(false);

  // Open Food Facts search — deliberately separate from the local
  // query/filter state above: it only runs when the button is pressed,
  // against whatever query text is currently typed in.
  const [offResults, setOffResults] = useState<OffSearchResult[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const [offSearchedFor, setOffSearchedFor] = useState("");

  // restore on mount — runs client-side only, after the initial render, so
  // server and client render the same defaults first (no hydration mismatch)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PANTRY_UI_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PantryUiState>;
        if (typeof saved.query === "string") setQuery(saved.query);
        if (Array.isArray(saved.activeTags)) setActiveTags(saved.activeTags);
        if (saved.tagMode === "and" || saved.tagMode === "or") setTagMode(saved.tagMode);
        if (typeof saved.sortKey === "string") setSortKey(saved.sortKey as PantrySortKey);
        if (saved.sortDir === 1 || saved.sortDir === -1) setSortDir(saved.sortDir);
      }
    } catch {
      /* corrupt or inaccessible storage — just fall back to defaults */
    }
    setHydrated(true);
  }, []);

  // persist on every change, once hydrated
  useEffect(() => {
    if (!hydrated) return;
    try {
      const state: PantryUiState = { query, activeTags, tagMode, sortKey, sortDir };
      sessionStorage.setItem(PANTRY_UI_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable/full — filters just won't persist this time */
    }
  }, [hydrated, query, activeTags, tagMode, sortKey, sortDir]);

  const tags = useMemo(
    () => Array.from(new Set(meals.flatMap((m) => m.tags))).sort(),
    [meals]
  );

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const filtered = useMemo(() => {
    const result = meals.filter((m) => {
      const matchesQuery = m.name.toLowerCase().includes(query.toLowerCase());
      const matchesTags =
        activeTags.length === 0
          ? true
          : tagMode === "and"
          ? activeTags.every((t) => m.tags.includes(t))
          : activeTags.some((t) => m.tags.includes(t));
      return matchesQuery && matchesTags;
    });
    return result.sort((a, b) => compareMeals(a, b, sortKey, sortDir));
  }, [meals, query, activeTags, tagMode, sortKey, sortDir]);

  async function handleOffSearch() {
    const q = query.trim();
    if (!q) return;
    setOffLoading(true);
    setOffError(null);
    try {
      const res = await fetch(`/api/openfoodfacts/search?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Search failed.");
      setOffResults(data.results ?? []);
      setOffSearchedFor(q);
    } catch (err) {
      setOffResults([]);
      setOffError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setOffLoading(false);
    }
  }

  // once a search result has actually been dragged onto the board, it
  // becomes a real row in `meals` (owned by Open Food Facts) — drop the
  // now-redundant virtual card from the results list rather than leaving
  // a stale duplicate sitting there until the next search
  const importedOffSources = useMemo(
    () => new Set(meals.filter((m) => m.ownerEmail === OFF_OWNER_EMAIL).map((m) => m.source)),
    [meals]
  );
  const visibleOffResults = useMemo(
    () => offResults.filter((r) => !importedOffSources.has(offProductUrl(r.code))),
    [offResults, importedOffSources]
  );

  // dropping a board-origin card here removes it from the week — resolved
  // by the top-level DndContext's onDragEnd, this just marks the zone
  const { setNodeRef, isOver } = useDroppable({ id: "pantry" });

  return (
    <section
      ref={setNodeRef}
      className={`chalk-texture flex h-full min-h-0 flex-col rounded-xl bg-board p-5 transition-colors ${
        isOver ? "chalk-drop-target" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sage">
            Recipe Box
          </p>
          <h2 className="font-display text-3xl leading-none text-chalk">
            Pantry
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/meals/new"
            className="rounded-md bg-gold px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-gold/90"
          >
            + New meal
          </Link>
          <Link
            href={weekIso ? `/meals?week=${weekIso}` : "/meals"}
            className="rounded border border-white/10 px-2.5 py-1 text-[11px] text-sage/90 transition-colors hover:border-gold/60 hover:text-gold"
          >
            Manage
          </Link>
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOffError(null);
        }}
        placeholder="Search recipes…"
        className="mt-4 rounded-md border border-white/10 bg-board-panel px-3 py-2 text-[13px] text-chalk placeholder:text-sage/50 outline-none focus:border-gold/60"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleOffSearch}
          disabled={!query.trim() || offLoading}
          className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-sage/90 transition-colors hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-sage/90"
        >
          {offLoading ? "Searching Open Food Facts…" : "Search Open Food Facts"}
        </button>
        {offError && <p className="text-[10.5px] text-tomato">{offError}</p>}
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTags([])}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              activeTags.length === 0
                ? "border-gold text-gold"
                : "border-white/10 text-sage/80 hover:border-white/25"
            }`}
          >
            All
          </button>
          {tags.map((tag) => {
            const accent = colorForTag(tag);
            const isActive = activeTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                style={{
                  borderColor: isActive ? accent : "rgba(255,255,255,0.1)",
                  color: isActive ? accent : "rgba(143,169,152,0.9)",
                  backgroundColor: isActive ? `${accent}1a` : "transparent",
                }}
              >
                {tag}
              </button>
            );
          })}
          {activeTags.length > 1 && (
            <div className="ml-auto flex items-center gap-1 rounded-full border border-white/10 p-0.5 text-[10.5px]">
              {(["or", "and"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTagMode(mode)}
                  className={`rounded-full px-2 py-0.5 transition-colors ${
                    tagMode === mode
                      ? "bg-gold text-ink"
                      : "text-sage/80 hover:text-chalk"
                  }`}
                  title={
                    mode === "or"
                      ? "Match any selected tag"
                      : "Match all selected tags"
                  }
                >
                  {mode === "or" ? "Any" : "All"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <label className="text-[10.5px] text-sage/70">Sort</label>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as PantrySortKey)}
          className="flex-1 rounded-md border border-white/10 bg-board-panel px-2 py-1.5 text-[11.5px] text-chalk outline-none focus:border-gold/60"
        >
          {PANTRY_SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-white/10 p-0.5">
          <button
            type="button"
            onClick={() => setSortDir(1)}
            title={sortDirLabel(sortKey, 1)}
            aria-label={`Sort ascending: ${sortDirLabel(sortKey, 1)}`}
            aria-pressed={sortDir === 1}
            className={`rounded px-2 py-1 text-[12px] transition-colors ${
              sortDir === 1
                ? "bg-gold text-ink"
                : "text-sage/80 hover:text-chalk"
            }`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => setSortDir(-1)}
            title={sortDirLabel(sortKey, -1)}
            aria-label={`Sort descending: ${sortDirLabel(sortKey, -1)}`}
            aria-pressed={sortDir === -1}
            className={`rounded px-2 py-1 text-[12px] transition-colors ${
              sortDir === -1
                ? "bg-gold text-ink"
                : "text-sage/80 hover:text-chalk"
            }`}
          >
            ↓
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-auto pr-1 pt-2">
        {visibleOffResults.length > 0 && (
          <div className="space-y-2 rounded-md border border-gold/25 bg-gold/5 p-2">
            <p className="text-[10.5px] uppercase tracking-[0.15em] text-gold/80">
              From Open Food Facts — drag onto the board to add
            </p>
            {visibleOffResults.map((result) => {
              const virtualMeal = buildVirtualOffMeal(result);
              return (
                <DraggableMealCard
                  key={virtualMeal.id}
                  dragId={`pantry:${virtualMeal.id}`}
                  payload={{ source: "pantry", meal: { ...virtualMeal, instanceId: "" } } satisfies DragPayload}
                  meal={virtualMeal}
                  variant="pantry"
                  weekIso={weekIso}
                  visibleNutrients={visibleNutrients}
                />
              );
            })}
          </div>
        )}
        {offSearchedFor && !offLoading && visibleOffResults.length === 0 && !offError && (
          <p className="text-center text-[11px] text-sage/60">
            No Open Food Facts results for “{offSearchedFor}”.
          </p>
        )}

        {loading ? (
          <p className="pt-6 text-center text-[12px] text-sage/60">Loading meals…</p>
        ) : filtered.length === 0 ? (
          <p className="pt-6 text-center text-[12px] text-sage/60">
            {meals.length === 0 ? (
              <>
                No meals yet.{" "}
                <Link href="/meals/new" className="text-gold underline-offset-2 hover:underline">
                  Create one
                </Link>
                .
              </>
            ) : (
              "No recipes match. Try another search, tag, or match setting."
            )}
          </p>
        ) : (
          filtered.map((meal) => (
            <DraggableMealCard
              key={meal.id}
              dragId={`pantry:${meal.id}`}
              payload={{ source: "pantry", meal: { ...meal, instanceId: "" } } satisfies DragPayload}
              meal={meal}
              variant="pantry"
              weekIso={weekIso}
              visibleNutrients={visibleNutrients}
            />
          ))
        )}
      </div>

      <p className="mt-3 pt-2 text-center text-[10.5px] leading-snug text-sage/50">
        Drag a card onto the board to plan it. Drag a planned card back here
        to remove it.
      </p>
    </section>
  );
}
