import { describe, expect, it } from "vitest";
import {
  computeDay,
  DEFAULT_SHIFT,
  nightDiffMinutes,
  parseHHMM,
  type DayEntry,
} from "@/modules/attendance/compute";
import type { Shift } from "@/modules/attendance/types";

const shift: Shift = { ...DEFAULT_SHIFT, lateGraceMinutes: 10 };

function entry(partial: Partial<DayEntry>): DayEntry {
  return {
    dayType: "REGULAR",
    timeIn: null,
    timeOut: null,
    hoursWorked: null,
    lateMinutes: null,
    undertimeMinutes: null,
    otHours: null,
    nightDiffHours: null,
    isAbsent: false,
    ...partial,
  };
}

describe("parseHHMM / nightDiffMinutes", () => {
  it("parses valid times only", () => {
    expect(parseHHMM("08:05")).toBe(485);
    expect(parseHHMM("23:59")).toBe(1439);
    expect(parseHHMM("8:05")).toBeNull();
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("")).toBeNull();
  });
  it("counts minutes inside 22:00–06:00 including across midnight", () => {
    expect(nightDiffMinutes(8 * 60, 17 * 60)).toBe(0);
    expect(nightDiffMinutes(21 * 60, 23 * 60)).toBe(60);
    expect(nightDiffMinutes(22 * 60, 24 * 60 + 6 * 60)).toBe(8 * 60); // 22:00 → 06:00 next day
    expect(nightDiffMinutes(20 * 60, 24 * 60 + 8 * 60)).toBe(8 * 60);
  });
});

describe("computeDay from time in/out", () => {
  it("full regular day: 08:00–17:00 with 1h break = 8h, nothing else", () => {
    const r = computeDay(entry({ timeIn: "08:00", timeOut: "17:00" }), shift);
    expect(r).toMatchObject({
      hoursWorked: 8,
      lateMinutes: 0,
      undertimeMinutes: 0,
      otHours: 0,
      nightDiffHours: 0,
      isAbsent: false,
      derived: true,
    });
  });
  it("late beyond grace, undertime, and early-in not counted", () => {
    // in 08:25 with 10 min grace → 15 late; out 16:30 → 30 UT; net 8.08h → regular 7.5h cap? net = 485-60=425 → 7.08h
    const r = computeDay(entry({ timeIn: "08:25", timeOut: "16:30" }), shift);
    expect(r.lateMinutes).toBe(15);
    expect(r.undertimeMinutes).toBe(30);
    expect(r.hoursWorked).toBe(7.08);
    expect(r.otHours).toBe(0);
    // within grace → 0 late
    expect(computeDay(entry({ timeIn: "08:10", timeOut: "17:00" }), shift).lateMinutes).toBe(0);
    // early in does not add hours
    expect(computeDay(entry({ timeIn: "07:00", timeOut: "17:00" }), shift).hoursWorked).toBe(8);
  });
  it("overtime after the shift end is suggested; typed OT overrides", () => {
    const r = computeDay(entry({ timeIn: "08:00", timeOut: "19:30" }), shift);
    expect(r.hoursWorked).toBe(8);
    expect(r.otHours).toBe(2.5);
    const typed = computeDay(entry({ timeIn: "08:00", timeOut: "19:30", otHours: 2 }), shift);
    expect(typed.otHours).toBe(2);
  });
  it("rest day: no late/undertime, hours up to 8 are regular, rest is OT", () => {
    const r = computeDay(entry({ dayType: "REST_DAY", timeIn: "09:00", timeOut: "20:00" }), shift);
    expect(r).toMatchObject({ hoursWorked: 8, lateMinutes: 0, undertimeMinutes: 0, otHours: 2 });
    const half = computeDay(
      entry({ dayType: "REST_DAY", timeIn: "13:00", timeOut: "17:00" }),
      shift,
    );
    expect(half).toMatchObject({ hoursWorked: 4, otHours: 0 });
  });
  it("night shift crossing midnight", () => {
    const r = computeDay(entry({ timeIn: "22:00", timeOut: "06:00" }), {
      ...shift,
      start: "22:00",
      end: "06:00",
    });
    expect(r.hoursWorked).toBe(7); // 8h span − 1h break
    expect(r.nightDiffHours).toBe(8);
    expect(r.lateMinutes).toBe(0);
    expect(r.undertimeMinutes).toBe(0);
  });
  it("short span keeps the break", () => {
    const r = computeDay(entry({ timeIn: "08:00", timeOut: "12:00" }), shift);
    expect(r.hoursWorked).toBe(4);
    expect(r.undertimeMinutes).toBe(300);
  });
});

describe("computeDay from direct hours / nothing", () => {
  it("direct hours split into regular and OT; typed late/UT kept", () => {
    const r = computeDay(entry({ hoursWorked: 10, lateMinutes: 5 }), shift);
    expect(r).toMatchObject({ hoursWorked: 8, otHours: 2, lateMinutes: 5, derived: false });
  });
  it("absent flag zeroes everything", () => {
    const r = computeDay(entry({ timeIn: "08:00", timeOut: "17:00", isAbsent: true }), shift);
    expect(r).toMatchObject({ hoursWorked: 0, otHours: 0, isAbsent: true });
  });
  it("nothing typed: absent on a regular day, not on a rest day or holiday", () => {
    expect(computeDay(entry({}), shift).isAbsent).toBe(true);
    expect(computeDay(entry({ dayType: "SPECIAL_WORKING" }), shift).isAbsent).toBe(true);
    expect(computeDay(entry({ dayType: "REST_DAY" }), shift).isAbsent).toBe(false);
    expect(computeDay(entry({ dayType: "REGULAR_HOLIDAY" }), shift).isAbsent).toBe(false);
  });
  it("OT typed alone (rest-day OT without punches) counts", () => {
    const r = computeDay(entry({ dayType: "REST_DAY", otHours: 3 }), shift);
    expect(r).toMatchObject({ hoursWorked: 0, otHours: 3, isAbsent: false });
  });
});
