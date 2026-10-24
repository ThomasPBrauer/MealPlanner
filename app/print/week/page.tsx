"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_PREFERENCES, MEAL_TYPES, Meal, MealType, Orientation, slotKey } from "@/lib/types";
import { addDays, formatDayHeader, formatWeekRange, startOfWeek, toISODate } from "@/lib/date";

type PlanEntry = { id: string; date: string; mealType: MealType; mealId: string };
type NoteEntry = { date: string; mealType: MealType; note: string };

function PrintWeekContent() {
  const searchParams = useSearchParams();
  const startParam = searchParams.get("start");

  const [orientation, setOrientation] = useState<Orientation>(DEFAULT_PREFERENCES.orientation);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const firstDayOfWeek = data?.firstDayOfWeek ?? DEFAULT_PREFERENCES.firstDayOfWeek;
        setOrientation(data?.orientation ?? DEFAULT_PREFERENCES.orientation);
        const start = startParam
          ? new Date(`${startParam}T00:00:00`)
          : startOfWeek(new Date(), firstDayOfWeek);
        setWeekStart(start);
      })
      .catch(() => {
        setWeekStart(
          startParam ? new Date(`${startParam}T00:00:00`) : startOfWeek(new Date(), "mon")
        );
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startParam]);

  useEffect(() => {
    if (!weekStart) return;
    const start = toISODate(weekStart);
    const end = toISODate(addDays(weekStart, 6));
    Promise.all([
      fetch(`/api/plan?start=${start}&end=${end}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/notes?start=${start}&end=${end}`).then((r) => (r.ok ? r.json() : { notes: [] })),
      fetch(`/api/meals`).then((r) => (r.ok ? r.json() : { meals: [] })),
    ]).then(([planData, notesData, mealsData]) => {
      setEntries(planData.entries ?? []);
      setNotes(notesData.notes ?? []);
      setMeals(mealsData.meals ?? []);
      setLoading(false);
    });
  }, [weekStart]);

  const days = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [];

  function mealsFor(dateISO: string, mealType: MealType) {
    return entries
      .filter((e) => e.date === dateISO && e.mealType === mealType)
      .map((e) => meals.find((m) => m.id === e.mealId))
      .filter((m): m is Meal => Boolean(m));
  }

  function noteFor(dateISO: string, mealType: MealType) {
    return notes.find((n) => n.date === dateISO && n.mealType === mealType)?.note;
  }

  function Cell({ dateISO, mealType }: { dateISO: string; mealType: MealType }) {
    const dayMeals = mealsFor(dateISO, mealType);
    const note = noteFor(dateISO, mealType);
    return (
      <td className="border border-neutral-300 p-2 align-top">
        {note && (
          <p className="mb-1 rounded bg-yellow-100 px-1.5 py-0.5 text-[10.5px] text-yellow-900">
            {note}
          </p>
        )}
        {dayMeals.length === 0 ? (
          <span className="text-neutral-300">—</span>
        ) : (
          <ul className="space-y-1">
            {dayMeals.map((m, i) => (
              <li key={i}>{m.name}</li>
            ))}
          </ul>
        )}
      </td>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-neutral-900 print:p-0">
      <div className="print:hidden mb-4 flex items-center justify-between">
        <a href="/" className="text-[13px] text-neutral-500 hover:text-neutral-900">
          ← Back to the board
        </a>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      {loading || !weekStart ? (
        <p className="text-[13px] text-neutral-500">Loading…</p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Weekly Menu</h1>
          <p className="mb-4 text-[13px] text-neutral-500">{formatWeekRange(weekStart)}</p>

          <table className="w-full table-fixed border-collapse text-[12px]">
            {orientation === "daysTop" ? (
              <>
                <thead>
                  <tr>
                    <th className="w-20 border border-neutral-300 bg-neutral-50 p-2 text-left" />
                    {days.map((d) => {
                      const { weekday, dayNum } = formatDayHeader(d);
                      return (
                        <th
                          key={toISODate(d)}
                          className="border border-neutral-300 bg-neutral-50 p-2 text-left"
                        >
                          {weekday} {dayNum}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {MEAL_TYPES.map((mt) => (
                    <tr key={mt.key}>
                      <td className="border border-neutral-300 bg-neutral-50 p-2 align-top font-semibold">
                        {mt.label}
                      </td>
                      {days.map((d) => {
                        const iso = toISODate(d);
                        return <Cell key={slotKey(iso, mt.key)} dateISO={iso} mealType={mt.key} />;
                      })}
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th className="w-20 border border-neutral-300 bg-neutral-50 p-2 text-left" />
                    {MEAL_TYPES.map((mt) => (
                      <th
                        key={mt.key}
                        className="border border-neutral-300 bg-neutral-50 p-2 text-left"
                      >
                        {mt.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const iso = toISODate(d);
                    const { weekday, dayNum } = formatDayHeader(d);
                    return (
                      <tr key={iso}>
                        <td className="border border-neutral-300 bg-neutral-50 p-2 align-top font-semibold">
                          {weekday} {dayNum}
                        </td>
                        {MEAL_TYPES.map((mt) => (
                          <Cell key={slotKey(iso, mt.key)} dateISO={iso} mealType={mt.key} />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </>
            )}
          </table>
        </>
      )}
    </main>
  );
}

export default function PrintWeekPage() {
  return (
    <Suspense fallback={null}>
      <PrintWeekContent />
    </Suspense>
  );
}
