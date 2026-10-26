"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import WeekCalendar from "@/components/WeekCalendar";
import Pantry from "@/components/Pantry";
import { DragPayload } from "@/components/DaySlot";
import {
  DEFAULT_PREFERENCES,
  Meal,
  MealType,
  PlacedMeal,
  Preferences,
  WeekPlan,
  slotKey,
} from "@/lib/types";
import { colorForTags } from "@/lib/data";
import { applyTheme } from "@/lib/theme";
import { isPatternKey } from "@/lib/patterns";
import { addDays, parseISODateLocal, startOfWeek, toISODate } from "@/lib/date";
import { isVirtualOffMeal, offCodeFromMealId } from "@/lib/openfoodfacts";

type PlanEntry = { id: string; date: string; mealType: MealType; mealId: string };

function buildWeekPlan(entries: PlanEntry[], meals: Meal[]): WeekPlan {
  const plan: WeekPlan = {};
  for (const entry of entries) {
    const meal = meals.find((m) => m.id === entry.mealId);
    if (!meal) continue; // meal deleted, or not (yet) visible to this user
    const key = slotKey(entry.date, entry.mealType);
    const placed: PlacedMeal = { ...meal, instanceId: entry.id };
    plan[key] = [...(plan[key] ?? []), placed];
  }
  return plan;
}

function makeTempId(mealId: string) {
  return `temp-${mealId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function BoardContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealsLoading, setMealsLoading] = useState(true);

  // weekStart stays null until we know the user's firstDayOfWeek preference,
  // and is only ever computed inside an effect (client-only) — computing
  // "today" during the render body would risk a server/client mismatch if
  // the server and browser disagree on the date near a day boundary
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  // raw plan entries per week (date + meal type + meal id) — kept separate
  // from the derived display data (WeekPlan) so editing a meal's info
  // elsewhere is reflected here automatically, without re-fetching
  const [weekEntries, setWeekEntries] = useState<Record<string, PlanEntry[]>>({});
  // per-slot notes ("Thaw shrimp for Saturday", "Date Night"), keyed the
  // same way: weekIso -> slotKey -> note text
  const [weekNotes, setWeekNotes] = useState<Record<string, Record<string, string>>>({});
  const [loadingWeek, setLoadingWeek] = useState(false);

  useEffect(() => {
    fetch("/api/meals")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMeals(data.meals ?? []);
      })
      .finally(() => setMealsLoading(false));
  }, []);

  // load preferences once, then set the initial week — honoring a ?week=
  // query param if we arrived here via "back" from a meal's detail page,
  // so we land on the week that was being viewed rather than always
  // resetting to today
  useEffect(() => {
    let cancelled = false;
    const weekParam = searchParams.get("week");

    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const next: Preferences = data
          ? {
              orientation: data.orientation ?? DEFAULT_PREFERENCES.orientation,
              firstDayOfWeek: data.firstDayOfWeek ?? DEFAULT_PREFERENCES.firstDayOfWeek,
              displayFont: data.displayFont ?? DEFAULT_PREFERENCES.displayFont,
              bodyFont: data.bodyFont ?? DEFAULT_PREFERENCES.bodyFont,
              colors: { ...DEFAULT_PREFERENCES.colors, ...(data.colors ?? {}) },
              backgroundPattern: isPatternKey(data.backgroundPattern) ? data.backgroundPattern : "none",
              visibleNutrients: data.visibleNutrients ?? DEFAULT_PREFERENCES.visibleNutrients,
              hideCheckedItems: data.hideCheckedItems ?? DEFAULT_PREFERENCES.hideCheckedItems,
              hideCompletedDepartments: data.hideCompletedDepartments ?? DEFAULT_PREFERENCES.hideCompletedDepartments,
              departmentOrder: data.departmentOrder ?? DEFAULT_PREFERENCES.departmentOrder,
            }
          : DEFAULT_PREFERENCES;
        setPreferences(next);
        applyTheme(next);

        const base = weekParam ? parseISODateLocal(weekParam) : new Date();
        setWeekStart(startOfWeek(base, next.firstDayOfWeek));
        if (weekParam) router.replace("/"); // tidy up the URL once consumed
      })
      .catch(() => {
        const base = weekParam ? parseISODateLocal(weekParam) : new Date();
        setWeekStart(startOfWeek(base, DEFAULT_PREFERENCES.firstDayOfWeek));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadWeek(start: Date, force = false) {
    const iso = toISODate(start);
    if (!force && weekEntries[iso] !== undefined) return; // already cached this session
    setLoadingWeek(true);
    try {
      const startISO = iso;
      const endISO = toISODate(addDays(start, 6));
      const [planRes, notesRes] = await Promise.all([
        fetch(`/api/plan?start=${startISO}&end=${endISO}`),
        fetch(`/api/notes?start=${startISO}&end=${endISO}`),
      ]);
      if (!planRes.ok) throw new Error("Failed to load week");
      const planData = await planRes.json();
      setWeekEntries((prev) => ({ ...prev, [iso]: planData.entries }));

      if (notesRes.ok) {
        const notesData = await notesRes.json();
        const notesMap: Record<string, string> = {};
        for (const n of notesData.notes ?? []) {
          notesMap[slotKey(n.date, n.mealType)] = n.note;
        }
        setWeekNotes((prev) => ({ ...prev, [iso]: notesMap }));
      }
    } catch {
      // leave whatever's cached (possibly nothing) — the board will just
      // show empty slots rather than throwing
    } finally {
      setLoadingWeek(false);
    }
  }

  useEffect(() => {
    if (!weekStart) return;
    void loadWeek(weekStart);
    // loadWeek intentionally not in deps — it closes over `weekEntries` fresh
    // each render, and we only want this effect to re-run when the visible week changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const weekIso = weekStart ? toISODate(weekStart) : null;
  const plan = useMemo(
    () => (weekIso ? buildWeekPlan(weekEntries[weekIso] ?? [], meals) : {}),
    [weekEntries, weekIso, meals]
  );

  function handleNavigate(direction: "prev" | "next" | "today") {
    setWeekStart((prev) => {
      if (!prev) return prev;
      if (direction === "today") return startOfWeek(new Date(), preferences.firstDayOfWeek);
      return addDays(prev, direction === "next" ? 7 : -7);
    });
  }

  function handleJumpToDate(date: Date) {
    setWeekStart(startOfWeek(date, preferences.firstDayOfWeek));
  }

  async function handleDropOnSlot(
    payload: DragPayload,
    target: { date: string; mealType: MealType }
  ) {
    if (!weekIso) return;

    // a virtual Open Food Facts result isn't a real recipe yet — create
    // (or reuse) the public database row for it first, then plan that
    // real meal, so from here on this behaves exactly like any other
    // pantry drop
    let resolvedPayload = payload;
    if (payload.source === "pantry" && isVirtualOffMeal(payload.meal.id)) {
      const code = offCodeFromMealId(payload.meal.id);
      if (!code) return;
      try {
        const res = await fetch("/api/meals/openfoodfacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error("Failed to import recipe from Open Food Facts");
        const createdMeal: Meal = await res.json();
        setMeals((prev) => (prev.some((m) => m.id === createdMeal.id) ? prev : [...prev, createdMeal]));
        resolvedPayload = { ...payload, meal: { ...createdMeal, instanceId: payload.meal.instanceId } };
      } catch {
        // nothing was planned yet, so there's nothing to roll back —
        // just bail out of the drop
        return;
      }
    }

    const tempId =
      resolvedPayload.source === "pantry" ? makeTempId(resolvedPayload.meal.id) : resolvedPayload.meal.instanceId;

    // optimistic local update so the drag feels instant
    setWeekEntries((prev) => {
      let next = prev[weekIso] ?? [];
      if (resolvedPayload.source === "board") {
        next = next.filter((e) => e.id !== resolvedPayload.meal.instanceId);
      }
      next = [
        ...next,
        { id: tempId, date: target.date, mealType: target.mealType, mealId: resolvedPayload.meal.id },
      ];
      return { ...prev, [weekIso]: next };
    });

    try {
      if (resolvedPayload.source === "pantry") {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: target.date,
            mealType: target.mealType,
            mealId: resolvedPayload.meal.id,
          }),
        });
        if (!res.ok) throw new Error("Failed to save");
        const created = await res.json();
        // swap the temporary id for the real database id
        setWeekEntries((prev) => ({
          ...prev,
          [weekIso]: (prev[weekIso] ?? []).map((e) => (e.id === tempId ? { ...e, id: created.id } : e)),
        }));
      } else {
        const res = await fetch(`/api/plan/${resolvedPayload.meal.instanceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: target.date, mealType: target.mealType }),
        });
        if (!res.ok) throw new Error("Failed to save");
      }
    } catch {
      // resync with the server so local state can't drift from what's saved
      void loadWeek(weekStart!, true);
    }
  }

  async function handleRemoveMeal(instanceId: string) {
    if (!weekIso) return;
    setWeekEntries((prev) => ({
      ...prev,
      [weekIso]: (prev[weekIso] ?? []).filter((e) => e.id !== instanceId),
    }));

    if (instanceId.startsWith("temp-")) return; // never made it to the server

    try {
      const res = await fetch(`/api/plan/${instanceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
    } catch {
      void loadWeek(weekStart!, true);
    }
  }

  function handleReturnToPantry(payload: DragPayload) {
    if (payload.source !== "board") return;
    void handleRemoveMeal(payload.meal.instanceId);
  }

  // a deliberate hold-before-drag delay on touch (matching the shopping
  // list's pattern) so an ordinary scroll swipe over the Pantry or board
  // doesn't get mistaken for the start of a drag; mouse stays near-instant
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const payload = event.active.data.current as DragPayload | undefined;
    setActiveDrag(payload ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const payload = active.data.current as DragPayload | undefined;
    if (!payload) return;

    if (over.id === "pantry") {
      handleReturnToPantry(payload);
      return;
    }

    const overData = over.data.current as { date: string; mealType: MealType } | undefined;
    if (!overData) return;
    if (payload.source === "board" && payload.fromSlot === over.id) return; // dropped back on itself
    void handleDropOnSlot(payload, { date: overData.date, mealType: overData.mealType });
  }

  async function handleSaveNote(date: string, mealType: MealType, note: string) {
    if (!weekIso) return;
    const key = slotKey(date, mealType);
    setWeekNotes((prev) => ({
      ...prev,
      [weekIso]: { ...(prev[weekIso] ?? {}), [key]: note },
    }));
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, note }),
      });
      if (!res.ok) throw new Error("Failed to save note");
    } catch {
      void loadWeek(weekStart!, true);
    }
  }

  async function handleClearWeek() {
    if (!weekStart || !weekIso) return;
    setWeekEntries((prev) => ({ ...prev, [weekIso]: [] }));
    try {
      const start = weekIso;
      const end = toISODate(addDays(weekStart, 6));
      const res = await fetch(`/api/plan?start=${start}&end=${end}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear week");
    } catch {
      void loadWeek(weekStart, true);
    }
  }

  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto mb-3 flex max-w-[1400px] items-center justify-between px-1">
        <p className="text-[12px] text-sage/80">
          Signed in as{" "}
          <span className="text-chalk">{session?.user?.email ?? session?.user?.name}</span>
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="text-[11px] text-sage/90 transition-colors hover:text-gold"
          >
            Settings
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded border border-white/10 px-2.5 py-1 text-[11px] text-sage/90 transition-colors hover:border-tomato/60 hover:text-tomato"
          >
            Sign out
          </button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div className="mx-auto grid h-[calc(100vh-6rem)] max-w-[1400px] grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          {weekStart ? (
            <WeekCalendar
              plan={plan}
              notes={weekIso ? weekNotes[weekIso] ?? {} : {}}
              orientation={preferences.orientation}
              weekStart={weekStart}
              loading={loadingWeek}
              visibleNutrients={preferences.visibleNutrients}
              onNavigate={handleNavigate}
              onJumpToDate={handleJumpToDate}
              onRemoveMeal={handleRemoveMeal}
              onNoteChange={handleSaveNote}
              onClearWeek={handleClearWeek}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl bg-board">
              <p className="text-[13px] text-sage/70">Loading your board…</p>
            </div>
          )}
          <Pantry
            meals={meals}
            loading={mealsLoading}
            weekIso={weekIso ?? undefined}
            visibleNutrients={preferences.visibleNutrients}
          />
        </div>

        <DragOverlay>
          {activeDrag ? (
            <div
              className="rounded-md bg-paper px-3 py-2 text-ink shadow-card"
              style={{ borderBottom: `3px solid ${colorForTags(activeDrag.meal.tags)}` }}
            >
              <p className="text-[13px] font-semibold">{activeDrag.meal.name}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <BoardContent />
    </Suspense>
  );
}
