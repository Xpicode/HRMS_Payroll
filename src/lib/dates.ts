/**
 * Date helpers. The business timezone is Asia/Manila everywhere.
 *
 * Calendar dates (holidays, effective dates, cutoffs) are stored as Postgres `date`.
 * Prisma represents a `date` column as a JS Date at 00:00:00 UTC, so:
 *   - parse "YYYY-MM-DD" -> Date with `toDateOnly`
 *   - format Date -> "YYYY-MM-DD" with `toIsoDate`
 * Never use `new Date(y, m, d)` (local time) for calendar dates.
 */

export const APP_TZ = "Asia/Manila";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** "2026-01-15" -> Date at 2026-01-15T00:00:00Z (what Prisma expects for @db.Date). */
export function toDateOnly(iso: string): Date {
  if (!isIsoDate(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Date (UTC midnight) -> "2026-01-15". */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in Manila as "YYYY-MM-DD", independent of server TZ. */
export function todayInManila(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "2026-08-15" -> "15 Aug 2026" (payslip style). */
export function formatDateOnly(date: Date | string): string {
  const d = typeof date === "string" ? toDateOnly(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Timestamp -> "15 Aug 2026, 14:05" in Manila time. */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function yearOf(date: Date): number {
  return date.getUTCFullYear();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

// ---------------------------------------------------------------------------
// Cutoffs
// ---------------------------------------------------------------------------

export type CutoffFrequency = "SEMI_MONTHLY" | "MONTHLY";

export type Cutoff = {
  /** Inclusive, "YYYY-MM-DD". */
  start: string;
  /** Inclusive, "YYYY-MM-DD". */
  end: string;
  /** 1 = first cutoff of the month (1–15 or the whole month), 2 = 16–end. */
  sequenceInMonth: 1 | 2;
};

/** Number of days in a month; `month` is 1–12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The cutoff that contains `iso` for the given pay frequency.
 * Semi-monthly: 1–15 and 16–end of month. Monthly: 1–end of month.
 */
export function cutoffFor(frequency: CutoffFrequency, iso: string): Cutoff {
  if (!isIsoDate(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const last = daysInMonth(y, m);
  const ym = `${y}-${pad2(m)}`;
  if (frequency === "MONTHLY")
    return { start: `${ym}-01`, end: `${ym}-${pad2(last)}`, sequenceInMonth: 1 };
  return d <= 15
    ? { start: `${ym}-01`, end: `${ym}-15`, sequenceInMonth: 1 }
    : { start: `${ym}-16`, end: `${ym}-${pad2(last)}`, sequenceInMonth: 2 };
}

export function cutoffsInMonth(frequency: CutoffFrequency, year: number, month: number): Cutoff[] {
  const first = cutoffFor(frequency, `${year}-${pad2(month)}-01`);
  return frequency === "MONTHLY"
    ? [first]
    : [first, cutoffFor(frequency, `${year}-${pad2(month)}-16`)];
}

export function addDays(iso: string, days: number): string {
  const d = toDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function previousCutoff(frequency: CutoffFrequency, c: Cutoff): Cutoff {
  return cutoffFor(frequency, addDays(c.start, -1));
}

export function nextCutoff(frequency: CutoffFrequency, c: Cutoff): Cutoff {
  return cutoffFor(frequency, addDays(c.end, 1));
}

/** Every calendar day from start to end inclusive. */
export function eachDay(start: string, end: string): string[] {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end)
    throw new Error(`Invalid range: ${start}..${end}`);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return toDateOnly(iso).getUTCDay();
}

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "16–31 Aug 2026" (same month) or "1 Aug – 15 Sep 2026" otherwise. */
export function formatCutoff(c: Cutoff): string {
  const [sy, sm, sd] = c.start.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = c.end.split("-").map(Number) as [number, number, number];
  const mon = (m: number, y: number) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
  if (sy === ey && sm === em) return `${sd}–${ed} ${mon(sm, sy)} ${sy}`;
  return `${sd} ${mon(sm, sy)}${sy !== ey ? ` ${sy}` : ""} – ${ed} ${mon(em, ey)} ${ey}`;
}
