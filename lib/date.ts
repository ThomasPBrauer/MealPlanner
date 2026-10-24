import { DayKey } from "./types";

const DOW_INDEX: Record<DayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Start of the calendar week containing `date`, where the week begins on `firstDayOfWeek`. */
export function startOfWeek(date: Date, firstDayOfWeek: DayKey): Date {
  const target = DOW_INDEX[firstDayOfWeek];
  const d = startOfDay(date);
  let diff = d.getDay() - target;
  if (diff < 0) diff += 7;
  return addDays(d, -diff);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses a "YYYY-MM-DD" string as a local-time Date — avoids the
 * timezone shift you'd get from `new Date("YYYY-MM-DD")`, which parses as
 * UTC midnight and can land on the wrong local day. */
export function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth =
    weekStart.getMonth() === weekEnd.getMonth() &&
    weekStart.getFullYear() === weekEnd.getFullYear();
  const startStr = weekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (sameMonth) {
    return `${startStr}–${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }
  const endStr = weekEnd.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

export function formatDayHeader(date: Date): { weekday: string; dayNum: string } {
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    dayNum: String(date.getDate()),
  };
}

export function isSameDate(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}
