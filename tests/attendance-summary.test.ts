import { describe, expect, it } from "vitest";
import { eachDay, dayOfWeek } from "@/lib/dates";
import { resolveDayType, summarizeCutoff, type SummaryDay } from "@/modules/attendance/summary";
import type { AttendanceDay } from "@/modules/attendance/types";
import type { DayType } from "@/generated/prisma/enums";

/**
 * Worked example: cutoff 16–31 Aug 2026 (16 days).
 *   Sundays (rest day): 16, 23, 30
 *   21 Aug  Ninoy Aquino Day        SPECIAL_NON_WORKING
 *   31 Aug  National Heroes Day     REGULAR holiday
 *   Scheduled days = 16 − 3 Sundays − 1 special − 1 regular holiday = 11
 */
const START = "2026-08-16";
const END = "2026-08-31";
const HOLIDAYS: Record<string, "REGULAR" | "SPECIAL_NON_WORKING"> = {
  "2026-08-21": "SPECIAL_NON_WORKING",
  "2026-08-31": "REGULAR",
};

function typeOn(date: string): DayType {
  return resolveDayType(HOLIDAYS[date] ?? null, dayOfWeek(date) === 0);
}

function rec(date: string, partial: Partial<AttendanceDay>): AttendanceDay {
  return {
    date,
    dayType: typeOn(date),
    timeIn: null,
    timeOut: null,
    hoursWorked: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
    otHours: 0,
    nightDiffHours: 0,
    isAbsent: false,
    remarks: null,
    ...partial,
  };
}

function days(records: Record<string, AttendanceDay>): SummaryDay[] {
  return eachDay(START, END).map((date) => ({
    date,
    dayType: typeOn(date),
    record: records[date] ?? null,
  }));
}

describe("resolveDayType", () => {
  it("holiday beats rest day, rest day beats regular", () => {
    expect(resolveDayType(null, false)).toBe("REGULAR");
    expect(resolveDayType(null, true)).toBe("REST_DAY");
    expect(resolveDayType("REGULAR", true)).toBe("REGULAR_HOLIDAY");
    expect(resolveDayType("SPECIAL_NON_WORKING", false)).toBe("SPECIAL_NON_WORKING");
    expect(resolveDayType("SPECIAL_WORKING", false)).toBe("SPECIAL_WORKING");
    expect(resolveDayType("SPECIAL_WORKING", true)).toBe("REST_DAY");
  });
});

describe("summarizeCutoff — 16–31 Aug 2026", () => {
  it("counts the calendar correctly with nothing encoded", () => {
    const s = summarizeCutoff({
      employeeId: "e1",
      employeeNo: "EMP-0001",
      coverageStart: START,
      coverageEnd: END,
      days: days({}),
    });
    expect(s.calendarDays).toBe(16);
    expect(s.scheduledDays).toBe(11);
    expect(s.absentDays).toBe(11);
    expect(s.unrecordedDays).toBe(11);
    expect(s.daysWorked).toBe(0);
    expect(s.regularHolidaysNotWorked).toBe(1);
  });

  it("employee A: perfect attendance, worked the regular holiday", () => {
    // 11 scheduled days at 8h + 31 Aug holiday 8h
    const records: Record<string, AttendanceDay> = {};
    for (const d of eachDay(START, END)) {
      const t = typeOn(d);
      if (t === "REGULAR" || t === "REGULAR_HOLIDAY") records[d] = rec(d, { hoursWorked: 8 });
    }
    const s = summarizeCutoff({
      employeeId: "a",
      employeeNo: "A",
      coverageStart: START,
      coverageEnd: END,
      days: days(records),
    });
    expect(s.daysWorked).toBe(12);
    expect(s.daysWorkedByType).toEqual({
      REGULAR: 11,
      REST_DAY: 0,
      SPECIAL: 0,
      REGULAR_HOLIDAY: 1,
    });
    expect(s.hoursWorkedByType.REGULAR).toBe(88);
    expect(s.hoursWorkedByType.REGULAR_HOLIDAY).toBe(8);
    expect(s.absentDays).toBe(0);
    expect(s.regularHolidaysWorked).toBe(1);
    expect(s.regularHolidaysNotWorked).toBe(0);
  });

  it("employee B: one absence, lates, undertime, rest-day OT, holiday not worked", () => {
    const records: Record<string, AttendanceDay> = {};
    for (const d of eachDay(START, END))
      if (typeOn(d) === "REGULAR") records[d] = rec(d, { hoursWorked: 8 });
    // 18 Aug absent, 19 Aug late 15 min + 20 Aug undertime 30 min
    records["2026-08-18"] = rec("2026-08-18", { isAbsent: true });
    records["2026-08-19"] = rec("2026-08-19", { hoursWorked: 7.75, lateMinutes: 15 });
    records["2026-08-20"] = rec("2026-08-20", { hoursWorked: 7.5, undertimeMinutes: 30 });
    // 23 Aug (Sunday) worked 8h + 2h OT
    records["2026-08-23"] = rec("2026-08-23", { hoursWorked: 8, otHours: 2 });
    // 26 Aug regular OT 1.5h with 1h night diff
    records["2026-08-26"] = rec("2026-08-26", { hoursWorked: 8, otHours: 1.5, nightDiffHours: 1 });
    const s = summarizeCutoff({
      employeeId: "b",
      employeeNo: "B",
      coverageStart: START,
      coverageEnd: END,
      days: days(records),
    });
    expect(s.scheduledDays).toBe(11);
    expect(s.absentDays).toBe(1);
    expect(s.unrecordedDays).toBe(0);
    expect(s.daysWorkedByType).toEqual({
      REGULAR: 10,
      REST_DAY: 1,
      SPECIAL: 0,
      REGULAR_HOLIDAY: 0,
    });
    expect(s.daysWorked).toBe(11);
    expect(s.hoursWorkedByType.REGULAR).toBe(8 * 8 + 7.75 + 7.5); // 79.25
    expect(s.hoursWorkedByType.REST_DAY).toBe(8);
    expect(s.lateMinutes).toBe(15);
    expect(s.undertimeMinutes).toBe(30);
    expect(s.otHoursByType).toEqual({ REGULAR: 1.5, REST_DAY: 2, SPECIAL: 0, REGULAR_HOLIDAY: 0 });
    expect(s.otHours).toBe(3.5);
    expect(s.nightDiffHours).toBe(1);
    expect(s.regularHolidaysNotWorked).toBe(1);
  });

  it("employee C: special non-working day worked counts under SPECIAL; unrecorded regular days are absences", () => {
    const records: Record<string, AttendanceDay> = {
      "2026-08-17": rec("2026-08-17", { hoursWorked: 8 }),
      "2026-08-21": rec("2026-08-21", { hoursWorked: 8, otHours: 1 }),
    };
    const s = summarizeCutoff({
      employeeId: "c",
      employeeNo: "C",
      coverageStart: START,
      coverageEnd: END,
      days: days(records),
    });
    expect(s.daysWorkedByType.SPECIAL).toBe(1);
    expect(s.otHoursByType.SPECIAL).toBe(1);
    expect(s.daysWorkedByType.REGULAR).toBe(1);
    expect(s.absentDays).toBe(10);
    expect(s.unrecordedDays).toBe(10);
  });

  it("a stored day-type override (swapped rest day) wins over the calendar default", () => {
    const records: Record<string, AttendanceDay> = {
      // Sunday 23 Aug recorded as a REGULAR working day (rest day swapped)
      "2026-08-23": rec("2026-08-23", { dayType: "REGULAR", hoursWorked: 8 }),
      // Monday 24 Aug recorded as the rest day
      "2026-08-24": rec("2026-08-24", { dayType: "REST_DAY" }),
    };
    const s = summarizeCutoff({
      employeeId: "d",
      employeeNo: "D",
      coverageStart: START,
      coverageEnd: END,
      days: days(records),
    });
    expect(s.daysWorkedByType.REGULAR).toBe(1);
    expect(s.daysWorkedByType.REST_DAY).toBe(0);
    expect(s.scheduledDays).toBe(11); // one swapped in, one swapped out
  });
});
