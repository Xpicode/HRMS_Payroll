import type { DayType, HolidayType } from "@/generated/prisma/enums";
import {
  DAY_TYPE_GROUPS,
  dayTypeGroup,
  isScheduledWorkDay,
  type AttendanceDay,
  type ByDayType,
  type CutoffSummary,
} from "./types";
import { round2 } from "./compute";

/**
 * Pure cutoff summary. Input is one entry per calendar day of the cutoff with the
 * resolved day type and the stored record (or null when nothing was encoded).
 */

export type SummaryDay = {
  date: string;
  /** Resolved for this employee on this date (holiday > rest day > regular). */
  dayType: DayType;
  record: AttendanceDay | null;
};

export type SummaryInput = {
  employeeId: string;
  employeeNo: string;
  coverageStart: string;
  coverageEnd: string;
  days: SummaryDay[];
};

function zeroByType(): ByDayType<number> {
  return { REGULAR: 0, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 };
}

export function summarizeCutoff(input: SummaryInput): CutoffSummary {
  const daysWorkedByType = zeroByType();
  const hoursWorkedByType = zeroByType();
  const otHoursByType = zeroByType();
  let scheduledDays = 0;
  let absentDays = 0;
  let unrecordedDays = 0;
  let lateMinutes = 0;
  let undertimeMinutes = 0;
  let nightDiffHours = 0;
  let regularHolidaysNotWorked = 0;
  let regularHolidaysWorked = 0;
  let leaveWithPayDays = 0;
  let leaveWithoutPayDays = 0;

  for (const day of input.days) {
    // A stored row may carry an overridden day type (e.g. a swapped rest day).
    const dayType = day.record?.dayType ?? day.dayType;
    const group = dayTypeGroup(dayType);
    const scheduled = isScheduledWorkDay(dayType);
    if (scheduled) scheduledDays++;

    const r = day.record;

    // Approved leave: with pay is paid like a day worked (no hours, no lates); without pay
    // is an absence the office expected, so it never counts as "unrecorded".
    if (dayType === "LEAVE_WITH_PAY" || dayType === "LEAVE_WITHOUT_PAY") {
      if (dayType === "LEAVE_WITH_PAY") {
        leaveWithPayDays++;
        daysWorkedByType.REGULAR += 1;
      } else {
        leaveWithoutPayDays++;
        absentDays++;
      }
      continue;
    }

    const worked = r !== null && !r.isAbsent && (r.hoursWorked > 0 || r.otHours > 0);

    if (worked) {
      daysWorkedByType[group] += 1;
      hoursWorkedByType[group] += r.hoursWorked;
      otHoursByType[group] += r.otHours;
      lateMinutes += r.lateMinutes;
      undertimeMinutes += r.undertimeMinutes;
      nightDiffHours += r.nightDiffHours;
      if (dayType === "REGULAR_HOLIDAY") regularHolidaysWorked++;
    } else {
      if (scheduled) {
        absentDays++;
        if (r === null) unrecordedDays++;
      }
      if (dayType === "REGULAR_HOLIDAY") regularHolidaysNotWorked++;
    }
  }

  for (const g of DAY_TYPE_GROUPS) {
    hoursWorkedByType[g] = round2(hoursWorkedByType[g]);
    otHoursByType[g] = round2(otHoursByType[g]);
  }

  return {
    employeeId: input.employeeId,
    employeeNo: input.employeeNo,
    coverageStart: input.coverageStart,
    coverageEnd: input.coverageEnd,
    calendarDays: input.days.length,
    scheduledDays,
    daysWorked: DAY_TYPE_GROUPS.reduce((n, g) => n + daysWorkedByType[g], 0),
    daysWorkedByType,
    hoursWorkedByType,
    absentDays,
    unrecordedDays,
    lateMinutes,
    undertimeMinutes,
    otHoursByType,
    otHours: round2(DAY_TYPE_GROUPS.reduce((n, g) => n + otHoursByType[g], 0)),
    nightDiffHours: round2(nightDiffHours),
    regularHolidaysNotWorked,
    regularHolidaysWorked,
    leaveWithPayDays,
    leaveWithoutPayDays,
  };
}

/**
 * Default day type for an employee on a date: holiday (company row beats national on the
 * same date; regular beats special) > rest day > REGULAR. A holiday on the rest day is
 * reported as the holiday; the engine applies the rest-day premium on top.
 */
export function resolveDayType(holidayType: HolidayType | null, isRestDay: boolean): DayType {
  if (holidayType === "REGULAR") return "REGULAR_HOLIDAY";
  if (holidayType === "SPECIAL_NON_WORKING") return "SPECIAL_NON_WORKING";
  if (holidayType === "SPECIAL_WORKING") return isRestDay ? "REST_DAY" : "SPECIAL_WORKING";
  return isRestDay ? "REST_DAY" : "REGULAR";
}
