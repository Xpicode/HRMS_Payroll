import type { DayType } from "@/generated/prisma/enums";

/**
 * Attendance types consumed by the payroll engine (Phase 3).
 * Everything here is plain data: no Prisma, no Dates, no Decimals.
 * Hours are numbers rounded to 2 decimals; minutes are integers.
 */

/** The four pay-relevant groupings of a day. SPECIAL_WORKING days pay like REGULAR. */
export type DayTypeGroup = "REGULAR" | "REST_DAY" | "SPECIAL" | "REGULAR_HOLIDAY";

export const DAY_TYPE_GROUPS: readonly DayTypeGroup[] = [
  "REGULAR",
  "REST_DAY",
  "SPECIAL",
  "REGULAR_HOLIDAY",
];

export type ByDayType<T> = Record<DayTypeGroup, T>;

export function dayTypeGroup(t: DayType): DayTypeGroup {
  switch (t) {
    case "REST_DAY":
      return "REST_DAY";
    case "SPECIAL_NON_WORKING":
      return "SPECIAL";
    case "REGULAR_HOLIDAY":
      return "REGULAR_HOLIDAY";
    default:
      return "REGULAR";
  }
}

/** A day is "scheduled" when absence on it costs pay: regular days and special working days. */
export function isScheduledWorkDay(t: DayType): boolean {
  return t === "REGULAR" || t === "SPECIAL_WORKING";
}

/** One employee-day as stored (or as computed before storing). */
export type AttendanceDay = {
  date: string;
  dayType: DayType;
  timeIn: string | null;
  timeOut: string | null;
  hoursWorked: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otHours: number;
  nightDiffHours: number;
  isAbsent: boolean;
  remarks: string | null;
};

/** Per-employee totals for a cutoff. This is the engine's attendance input. */
export type CutoffSummary = {
  employeeId: string;
  employeeNo: string;
  coverageStart: string;
  coverageEnd: string;
  /** Calendar days in the cutoff. */
  calendarDays: number;
  /** REGULAR + SPECIAL_WORKING days in the cutoff (the employee's scheduled days). */
  scheduledDays: number;
  /** Days with any work (hours or OT), all day types. */
  daysWorked: number;
  daysWorkedByType: ByDayType<number>;
  hoursWorkedByType: ByDayType<number>;
  /** Scheduled days with no work recorded (unrecorded days count as absent). */
  absentDays: number;
  /** Scheduled days with no DTR row at all — surfaced so the officer can encode them. */
  unrecordedDays: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otHoursByType: ByDayType<number>;
  otHours: number;
  nightDiffHours: number;
  /** Regular holidays in the cutoff on which the employee did not work (holiday pay, Phase 3). */
  regularHolidaysNotWorked: number;
  /** Regular holidays in the cutoff on which the employee worked. */
  regularHolidaysWorked: number;
};

/** Shift parameters used to derive lates, undertime and OT from time in/out. */
export type Shift = {
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
  /** Unpaid break deducted when the worked span exceeds 5 hours. */
  breakMinutes: number;
  /** From the company policy. */
  hoursPerDay: number;
  /** From the company policy; lates within the grace are not counted. */
  lateGraceMinutes: number;
};
