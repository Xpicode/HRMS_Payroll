import type { DayType } from "@/generated/prisma/enums";
import { isScheduledWorkDay, type Shift } from "./types";

/**
 * Pure per-day attendance arithmetic. Shared by the server (source of truth on save)
 * and the DTR grid (live feedback while typing). No Prisma, no Date.now().
 */

export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "08:05" -> 485 minutes since midnight; null when blank or malformed. */
export function parseHHMM(s: string | null | undefined): number | null {
  if (!s || !HHMM_RE.test(s)) return null;
  const [h, m] = s.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Break is unpaid only when the span is long enough to include a meal period. */
export const BREAK_THRESHOLD_MINUTES = 5 * 60;

export const NIGHT_START = 22 * 60; // 22:00
export const NIGHT_END = 6 * 60; // 06:00

/**
 * Minutes of [inMin, outMin) that fall between 22:00 and 06:00. `outMin` may exceed
 * 1440 for shifts that cross midnight.
 */
export function nightDiffMinutes(inMin: number, outMin: number): number {
  let total = 0;
  for (let day = 0; day * 1440 <= outMin; day++) {
    const base = day * 1440;
    for (const [ws, we] of [
      [base + NIGHT_START, base + 1440],
      [base, base + NIGHT_END],
    ]) {
      const s = Math.max(inMin, ws!);
      const e = Math.min(outMin, we!);
      if (e > s) total += e - s;
    }
  }
  return total;
}

/** What the encoder typed or the import supplied for one day. */
export type DayEntry = {
  dayType: DayType;
  timeIn: string | null;
  timeOut: string | null;
  /** Direct hours, used only when time in/out are absent. */
  hoursWorked: number | null;
  lateMinutes: number | null;
  undertimeMinutes: number | null;
  /** When null, the suggested value is used. */
  otHours: number | null;
  /** When null, the suggested value is used. */
  nightDiffHours: number | null;
  isAbsent: boolean;
};

export type ComputedDay = {
  hoursWorked: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otHours: number;
  nightDiffHours: number;
  isAbsent: boolean;
  /** true when hours/late/undertime were derived from time in/out (not typed). */
  derived: boolean;
};

const ZERO: ComputedDay = {
  hoursWorked: 0,
  lateMinutes: 0,
  undertimeMinutes: 0,
  otHours: 0,
  nightDiffHours: 0,
  isAbsent: false,
  derived: false,
};

/**
 * Rules
 * - Absent flag wins: everything is zero.
 * - Time in + out: span = out − in (out before in means the next day); the unpaid break is
 *   deducted when the span exceeds 5 hours. On scheduled days: late = minutes after the
 *   shift start beyond the grace, undertime = minutes before the shift end, OT = minutes
 *   after the shift end; regular hours = net minus OT, capped at the policy hours per day.
 *   On rest days and holidays there is no late/undertime: hours up to hours-per-day are
 *   regular, the rest is OT. Night differential is the span inside 22:00–06:00.
 *   Typed OT / night-diff values override the suggestions.
 * - Direct hours (no in/out): hours up to hours-per-day are regular, excess is OT unless OT
 *   was typed; late/undertime/night-diff are whatever was typed.
 * - Nothing at all: absent on scheduled days, an ordinary non-working day otherwise.
 */
export function computeDay(entry: DayEntry, shift: Shift): ComputedDay {
  if (entry.isAbsent) return { ...ZERO, isAbsent: true };

  const inMin = parseHHMM(entry.timeIn);
  const outMinRaw = parseHHMM(entry.timeOut);
  const scheduled = isScheduledWorkDay(entry.dayType);
  const schedMinutes = Math.round(shift.hoursPerDay * 60);

  if (inMin !== null && outMinRaw !== null) {
    const outMin = outMinRaw <= inMin ? outMinRaw + 1440 : outMinRaw;
    const span = outMin - inMin;
    const net = Math.max(0, span - (span > BREAK_THRESHOLD_MINUTES ? shift.breakMinutes : 0));

    let late = 0;
    let undertime = 0;
    let otMinutes: number;
    let regularMinutes: number;

    if (scheduled) {
      const start = parseHHMM(shift.start) ?? 8 * 60;
      const endRaw = parseHHMM(shift.end) ?? 17 * 60;
      const end = endRaw <= start ? endRaw + 1440 : endRaw;
      late = Math.max(0, inMin - start - shift.lateGraceMinutes);
      undertime = Math.max(0, end - outMin);
      otMinutes = Math.max(0, outMin - end);
      regularMinutes = Math.min(Math.max(0, net - otMinutes), schedMinutes);
    } else {
      regularMinutes = Math.min(net, schedMinutes);
      otMinutes = Math.max(0, net - schedMinutes);
    }

    return {
      hoursWorked: round2(regularMinutes / 60),
      lateMinutes: late,
      undertimeMinutes: undertime,
      otHours: entry.otHours ?? round2(otMinutes / 60),
      nightDiffHours: entry.nightDiffHours ?? round2(nightDiffMinutes(inMin, outMin) / 60),
      isAbsent: false,
      derived: true,
    };
  }

  if (entry.hoursWorked !== null && entry.hoursWorked > 0) {
    const h = entry.hoursWorked;
    return {
      hoursWorked: round2(Math.min(h, shift.hoursPerDay)),
      lateMinutes: entry.lateMinutes ?? 0,
      undertimeMinutes: entry.undertimeMinutes ?? 0,
      otHours: entry.otHours ?? round2(Math.max(0, h - shift.hoursPerDay)),
      nightDiffHours: entry.nightDiffHours ?? 0,
      isAbsent: false,
      derived: false,
    };
  }

  // Nothing typed. Typed OT alone (e.g. OT on a rest day without punches) still counts.
  const otOnly = entry.otHours ?? 0;
  if (otOnly > 0) {
    return { ...ZERO, otHours: round2(otOnly), nightDiffHours: entry.nightDiffHours ?? 0 };
  }
  return { ...ZERO, isAbsent: scheduled };
}

export const DEFAULT_SHIFT: Shift = {
  start: "08:00",
  end: "17:00",
  breakMinutes: 60,
  hoursPerDay: 8,
  lateGraceMinutes: 0,
};
