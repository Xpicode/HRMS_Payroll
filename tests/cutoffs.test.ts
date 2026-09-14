import { describe, expect, it } from "vitest";
import {
  addDays,
  cutoffFor,
  cutoffsInMonth,
  dayOfWeek,
  daysInMonth,
  eachDay,
  formatCutoff,
  nextCutoff,
  previousCutoff,
} from "@/lib/dates";

describe("cutoffs", () => {
  it("semi-monthly: 1–15 and 16–end, including February and 31-day months", () => {
    expect(cutoffFor("SEMI_MONTHLY", "2026-02-03")).toEqual({
      start: "2026-02-01",
      end: "2026-02-15",
      sequenceInMonth: 1,
    });
    expect(cutoffFor("SEMI_MONTHLY", "2026-02-16")).toEqual({
      start: "2026-02-16",
      end: "2026-02-28",
      sequenceInMonth: 2,
    });
    expect(cutoffFor("SEMI_MONTHLY", "2028-02-29")).toEqual({
      start: "2028-02-16",
      end: "2028-02-29",
      sequenceInMonth: 2,
    });
    expect(cutoffFor("SEMI_MONTHLY", "2026-08-15").end).toBe("2026-08-15");
    expect(cutoffFor("SEMI_MONTHLY", "2026-08-31")).toEqual({
      start: "2026-08-16",
      end: "2026-08-31",
      sequenceInMonth: 2,
    });
    expect(cutoffFor("SEMI_MONTHLY", "2026-04-30").end).toBe("2026-04-30");
  });

  it("monthly: whole month", () => {
    expect(cutoffFor("MONTHLY", "2026-02-20")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
      sequenceInMonth: 1,
    });
    expect(cutoffFor("MONTHLY", "2026-12-01").end).toBe("2026-12-31");
  });

  it("lists cutoffs in a month and walks forward/backward across month and year ends", () => {
    expect(cutoffsInMonth("SEMI_MONTHLY", 2026, 2).map((c) => c.end)).toEqual([
      "2026-02-15",
      "2026-02-28",
    ]);
    expect(cutoffsInMonth("MONTHLY", 2026, 2)).toHaveLength(1);
    const dec2 = cutoffFor("SEMI_MONTHLY", "2026-12-20");
    expect(nextCutoff("SEMI_MONTHLY", dec2)).toEqual({
      start: "2027-01-01",
      end: "2027-01-15",
      sequenceInMonth: 1,
    });
    expect(previousCutoff("SEMI_MONTHLY", cutoffFor("SEMI_MONTHLY", "2026-03-01")).end).toBe(
      "2026-02-28",
    );
  });

  it("day helpers", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(eachDay("2026-08-16", "2026-08-31")).toHaveLength(16);
    expect(() => eachDay("2026-08-31", "2026-08-16")).toThrow();
    expect(dayOfWeek("2026-08-16")).toBe(0); // Sunday
    expect(dayOfWeek("2026-08-31")).toBe(1); // Monday
    expect(formatCutoff({ start: "2026-08-16", end: "2026-08-31", sequenceInMonth: 2 })).toBe(
      "16–31 Aug 2026",
    );
  });

  it("rejects bad dates", () => {
    expect(() => cutoffFor("SEMI_MONTHLY", "2026-02-30")).toThrow();
  });
});
