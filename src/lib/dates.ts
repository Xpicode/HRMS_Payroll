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
