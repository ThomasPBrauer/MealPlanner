"use client";

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

  return (
    <section className="chalk-texture flex h-full min-h-0 flex-col rounded-xl bg-board p-5">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sage">
            {loading ? "Loading…" : `${plannedCount} meal${plannedCount === 1 ? "" : "s"} planned`}
          </p>
          <h1 className="font-display text-4xl leading-none text-chalk">
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-board-panel/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onNavigate("prev")}
            aria-label="Previous week"
            className="rounded px-2 py-1 text-sage/90 transition-colors hover:bg-white/5 hover:text-gold"
          >
            ‹
          </button>
          <button
            onClick={() => onNavigate("today")}
            className="rounded border border-white/10 px-2 py-1 text-[11px] text-sage/90 transition-colors hover:border-gold/60 hover:text-gold"
          >
            Today
          </button>
          <button
            onClick={() => onNavigate("next")}
            aria-label="Next week"
            className="rounded px-2 py-1 text-sage/90 transition-colors hover:bg-white/5 hover:text-gold"
          >
            ›
          </button>
        </div>

        <p className="font-display text-xl leading-none text-chalk">
          {formatWeekRange(weekStart)}
        </p>

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
        className={`transition-opacity ${loading ? "pointer-events-none opacity-50" : ""} flex flex-1 min-h-0`}
      >
        {orientation === "daysTop" ? (
          <div className="grid flex-1 grid-cols-[44px_repeat(7,1fr)] gap-1.5 overflow-auto pr-1">
            {/* header row: days across the top */}
            <div />
            {days.map((d) => {
              const iso = toISODate(d);
              const { weekday, dayNum } = formatDayHeader(d);
              const isToday = iso === todayISO;
              return (
                <div
                  key={iso}
                  className="sticky top-0 z-10 bg-board pb-1 text-center"
                >
                  <p className="font-display text-2xl leading-none text-gold">
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
                    className="font-display text-lg text-sage"
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
            className={`grid flex-1 gap-1.5 overflow-auto pr-1 ${
              visibleNutrients.length > 0
                ? "grid-cols-[56px_repeat(3,1fr)_92px]"
                : "grid-cols-[56px_repeat(3,1fr)]"
            }`}
          >
            {/* header row: meal types across the top */}
            <div />
            {MEAL_TYPES.map((mt) => (
              <div
                key={mt.key}
                className="sticky top-0 z-10 bg-board pb-1 text-center"
              >
                <p className="font-display text-2xl leading-none text-gold">
                  {mt.label}
                </p>
              </div>
            ))}
            {visibleNutrients.length > 0 && (
              <div className="sticky top-0 z-10 bg-board pb-1 text-center">
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
                    <p className="font-display text-lg text-chalk">{weekday}</p>
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
