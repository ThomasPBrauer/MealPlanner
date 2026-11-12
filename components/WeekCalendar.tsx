"use client";

import { useEffect, useRef } from "react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import {
  MEAL_TYPES,
  MealType,
  NUTRITION_FIELDS,
  NutritionKey,
  Orientation,
  WeekPlan,
  slotKey,
} from "@/lib/types";
import {
  addDays,
  formatDayHeader,
  formatWeekRange,
  parseISODateLocal,
  toISODate,
} from "@/lib/date";
import DaySlot from "./DaySlot";

interface WeekCalendarProps {
  plan: WeekPlan;
  notes: Record<string, string>;
  orientation: Orientation;
  weekStart: Date;
  loading: boolean;
  visibleNutrients?: NutritionKey[];
  onNavigate: (direction: "prev" | "next" | "today") => void;
  onJumpToDate: (date: Date) => void;
  onRemoveMeal: (instanceId: string) => void;
  onNoteChange: (date: string, mealType: MealType, note: string) => void;
  onClearWeek: () => void;
}

/** Sums the given nutrition fields across every meal planned for a day
 * (i.e. every meal type's slot), skipping fields a given meal doesn't have
 * a value for rather than treating them as zero. */
function sumDayNutrition(
  plan: WeekPlan,
  dateIso: string,
  keys: NutritionKey[]
): Partial<Record<NutritionKey, number>> {
  const totals: Partial<Record<NutritionKey, number>> = {};
  for (const mt of MEAL_TYPES) {
    const meals = plan[slotKey(dateIso, mt.key)] ?? [];
    for (const meal of meals) {
      for (const key of keys) {
        const value = meal.nutrition[key];
        if (value === undefined) continue;
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }
  return totals;
}

// How long a dragged card has to hover over an arrow before the week flips,
// and how often it keeps flipping while the card stays there.
const HOVER_FLIP_DELAY_MS = 550;
const HOVER_FLIP_REPEAT_MS = 1000;

/** The previous/next-week arrow. Clicking it changes week; so does holding a
 * dragged meal over it, which is how a meal gets moved to another week:
 * hover the arrow until the board slides, then drop on a slot. */
function WeekArrow({
  id,
  direction,
  onNavigate,
}: {
  id: "nav-prev" | "nav-next";
  direction: "prev" | "next";
  onNavigate: (direction: "prev" | "next") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { active } = useDndContext();
  const latest = useRef(onNavigate);
  latest.current = onNavigate;

  useEffect(() => {
    if (!isOver) return;
    let repeat: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      latest.current(direction);
      repeat = setInterval(() => latest.current(direction), HOVER_FLIP_REPEAT_MS);
    }, HOVER_FLIP_DELAY_MS);
    return () => {
      clearTimeout(first);
      if (repeat) clearInterval(repeat);
    };
  }, [isOver, direction]);

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onNavigate(direction)}
      aria-label={direction === "prev" ? "Previous week" : "Next week"}
      className={`rounded-md border px-3 py-1 text-lg leading-none transition-colors ${
        isOver
          ? "chalk-drop-target border-gold text-gold"
          : active
          ? "border-gold/50 text-gold"
          : "border-transparent text-sage/90 hover:bg-white/5 hover:text-gold"
      }`}
    >
      {direction === "prev" ? "‹" : "›"}
    </button>
  );
}

function DayTotals({
  totals,
  keys,
  align = "center",
}: {
  totals: Partial<Record<NutritionKey, number>>;
  keys: NutritionKey[];
  align?: "center" | "start";
}) {
  const fields = NUTRITION_FIELDS.filter((f) => keys.includes(f.key) && totals[f.key] !== undefined);

  if (fields.length === 0) {
    return <span className="text-[10.5px] text-sage/40">—</span>;
  }

  return (
    <div
      className={`flex flex-col gap-0.5 text-[10.5px] leading-tight text-gold/90 ${
        align === "center" ? "items-center text-center" : "items-start text-left"
      }`}
    >
      {fields.map((f) => (
        <span key={f.key} className="whitespace-nowrap">
          {Math.round((totals[f.key] as number) * 10) / 10}
          {f.unit}
          {f.key === "calories" ? " cal" : ` ${f.shortLabel}`}
        </span>
      ))}
    </div>
  );
}

export default function WeekCalendar({
  plan,
  notes,
  orientation,
  weekStart,
  loading,
  visibleNutrients = [],
  onNavigate,
  onJumpToDate,
  onRemoveMeal,
  onNoteChange,
  onClearWeek,
}: WeekCalendarProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayISO = toISODate(new Date());
  const weekStartISO = toISODate(weekStart);
  const plannedCount = Object.values(plan).reduce(
    (sum, meals) => sum + meals.length,
    0
  );

  // which way the week just moved, so the new week slides in from that side.
  // Kept in a ref that only changes when the week does, so the class stays put
  // (and the animation isn't cut short) across the re-renders that follow.
  const slideRef = useRef({ week: weekStartISO, dir: "" });
  if (slideRef.current.week !== weekStartISO) {
    slideRef.current = {
      week: weekStartISO,
      dir: weekStartISO > slideRef.current.week ? "week-slide-next" : "week-slide-prev",
    };
  }

  return (
    <section className="chalk-texture flex flex-col rounded-xl bg-board p-3 sm:p-5 lg:h-full lg:min-h-0">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 sm:mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sage">
            {loading ? "Loading…" : `${plannedCount} meal${plannedCount === 1 ? "" : "s"} planned`}
          </p>
          <h1 className="font-display text-2xl leading-none text-chalk sm:text-4xl">
            The Menu Board
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/print/week?start=${weekStartISO}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-sage/90 transition-colors hover:text-gold"
          >
            Print week
          </a>
          <a
            href={`/print/shopping-list?start=${weekStartISO}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-sage/90 transition-colors hover:text-gold"
          >
            Shopping list
          </a>
          <button
            onClick={onClearWeek}
            className="rounded border border-white/10 px-2.5 py-1 text-[11px] text-sage/90 transition-colors hover:border-tomato/60 hover:text-tomato"
          >
            Clear week
          </button>
        </div>
      </header>

      {/* week navigation */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md border border-white/10 bg-board-panel/60 px-2 py-1 sm:mb-4 sm:px-3 sm:py-2">
        <button
          onClick={() => onNavigate("today")}
          className="rounded border border-white/10 px-2 py-1 text-[11px] text-sage/90 transition-colors hover:border-gold/60 hover:text-gold"
        >
          Today
        </button>

        <div className="flex items-center gap-1 sm:gap-2">
          <WeekArrow id="nav-prev" direction="prev" onNavigate={onNavigate} />
          <p className="min-w-[8.5rem] text-center font-display text-lg leading-none text-chalk sm:min-w-[11rem] sm:text-xl">
            {formatWeekRange(weekStart)}
          </p>
          <WeekArrow id="nav-next" direction="next" onNavigate={onNavigate} />
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-sage/90">
          <span>Jump to</span>
          <input
            type="date"
            value={weekStartISO}
            style={{ colorScheme: "dark" }}
            onChange={(e) => {
              if (e.target.value) onJumpToDate(parseISODateLocal(e.target.value));
            }}
            className="rounded border border-white/10 bg-board-panel px-1.5 py-1 text-chalk outline-none focus:border-gold/60"
          />
        </label>
      </div>

      <div
        key={weekStartISO}
        className={`transition-opacity ${loading ? "pointer-events-none opacity-50" : ""} flex min-h-0 flex-1 overflow-x-hidden ${slideRef.current.dir}`}
      >
        {orientation === "daysTop" ? (
          <div className="grid flex-1 grid-cols-[22px_repeat(7,minmax(0,1fr))] gap-1 overflow-auto sm:grid-cols-[44px_repeat(7,minmax(0,1fr))] sm:gap-1.5 sm:pr-1">
            {/* header row: days across the top */}
            <div />
            {days.map((d) => {
              const iso = toISODate(d);
              const { weekday, dayNum } = formatDayHeader(d);
              const isToday = iso === todayISO;
              return (
                <div
                  key={iso}
                  className="sticky top-0 z-10 bg-board pb-0.5 text-center"
                >
                  <p className="font-display text-base leading-none text-gold sm:text-2xl">
                    {weekday}
                  </p>
                  <p
                    className={`mt-0.5 inline-block text-[10px] ${
                      isToday
                        ? "rounded-full bg-gold px-1.5 text-ink"
                        : "text-sage/70"
                    }`}
                  >
                    {dayNum}
                  </p>
                </div>
              );
            })}

            {/* one row per meal type */}
            {MEAL_TYPES.map((mt) => (
              <div key={mt.key} className="contents">
                <div className="flex items-center justify-center">
                  <p
                    className="font-display text-sm text-sage sm:text-lg"
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                    }}
                  >
                    {mt.label}
                  </p>
                </div>
                {days.map((d) => {
                  const iso = toISODate(d);
                  const key = slotKey(iso, mt.key);
                  return (
                    <DaySlot
                      key={key}
                      slotId={key}
                      date={iso}
                      mealType={mt.key}
                      meals={plan[key] ?? []}
                      note={notes[key] ?? ""}
                      weekIso={weekStartISO}
                      visibleNutrients={visibleNutrients}
                      onRemoveMeal={onRemoveMeal}
                      onNoteChange={(note) => onNoteChange(iso, mt.key, note)}
                    />
                  );
                })}
              </div>
            ))}

            {/* summary row: each day's running nutrition total, per preferences */}
            {visibleNutrients.length > 0 && (
              <div className="contents">
                <div className="flex items-center justify-center border-t border-white/10 pt-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-sage/70">
                    Total
                  </p>
                </div>
                {days.map((d) => {
                  const iso = toISODate(d);
                  return (
                    <div
                      key={`total-${iso}`}
                      className="flex items-center justify-center rounded-md border-t border-white/10 bg-board-rail/20 px-1.5 pt-1.5"
                    >
                      <DayTotals
                        totals={sumDayNutrition(plan, iso, visibleNutrients)}
                        keys={visibleNutrients}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`grid flex-1 gap-1 overflow-auto sm:gap-1.5 sm:pr-1 ${
              visibleNutrients.length > 0
                ? "grid-cols-[34px_repeat(3,minmax(0,1fr))_64px] sm:grid-cols-[56px_repeat(3,minmax(0,1fr))_92px]"
                : "grid-cols-[34px_repeat(3,minmax(0,1fr))] sm:grid-cols-[56px_repeat(3,minmax(0,1fr))]"
            }`}
          >
            {/* header row: meal types across the top */}
            <div />
            {MEAL_TYPES.map((mt) => (
              <div
                key={mt.key}
                className="sticky top-0 z-10 bg-board pb-0.5 text-center"
              >
                <p className="font-display text-base leading-none text-gold sm:text-2xl">
                  {mt.label}
                </p>
              </div>
            ))}
            {visibleNutrients.length > 0 && (
              <div className="sticky top-0 z-10 bg-board pb-0.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-sage/70">
                  Total
                </p>
              </div>
            )}

            {/* one row per day */}
            {days.map((d) => {
              const iso = toISODate(d);
              const { weekday, dayNum } = formatDayHeader(d);
              const isToday = iso === todayISO;
              return (
                <div key={iso} className="contents">
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <p className="font-display text-sm text-chalk sm:text-lg">{weekday}</p>
                    <p
                      className={`text-[10px] ${
                        isToday
                          ? "rounded-full bg-gold px-1.5 text-ink"
                          : "text-sage/70"
                      }`}
                    >
                      {dayNum}
                    </p>
                  </div>
                  {MEAL_TYPES.map((mt) => {
                    const key = slotKey(iso, mt.key);
                    return (
                      <DaySlot
                        key={key}
                        slotId={key}
                        date={iso}
                        mealType={mt.key}
                        meals={plan[key] ?? []}
                        note={notes[key] ?? ""}
                      weekIso={weekStartISO}
                        visibleNutrients={visibleNutrients}
                        onRemoveMeal={onRemoveMeal}
                        onNoteChange={(note) => onNoteChange(iso, mt.key, note)}
                      />
                    );
                  })}
                  {visibleNutrients.length > 0 && (
                    <div className="flex items-center justify-center rounded-md border border-white/5 bg-board-rail/20 px-1.5 py-1.5">
                      <DayTotals
                        totals={sumDayNutrition(plan, iso, visibleNutrients)}
                        keys={visibleNutrients}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
