import { describe, expect, it } from "vitest";
import { computePayslip } from "@/modules/payroll/engine";
import { amountOf, COMPONENTS, paySetting, PERIOD_2ND, POLICY, summary, TABLES } from "./fixtures";

/**
 * Phase 6: approved leave changes the attendance summary, and the engine prices it.
 *
 * Monthly employee (₱35,000, 16–31 Aug 2026, 11 scheduled days, daily 1,341.85):
 *   1 day leave without pay → basic = 17,500.00 − 1 × 1,341.85 = 16,158.15
 *   1 day leave with pay    → basic stays 17,500.00 (no absence)
 * Daily employee (₱645, same period):
 *   1 day leave with pay    → paid like a worked day: 11 × 645 = 7,095.00
 *   1 day leave without pay → 10 × 645 = 6,450.00
 */
const base = {
  policy: POLICY,
  period: PERIOD_2ND,
  tables: TABLES,
  components: COMPONENTS,
  recurring: [],
  adjustments: [],
  loans: [],
};

describe("leave without pay reduces basic for a monthly employee", () => {
  const r = computePayslip({
    ...base,
    paySetting: paySetting({ payType: "MONTHLY", monthlyRate: "35000.00" }),
    summary: summary({
      daysWorked: 10,
      daysWorkedByType: { REGULAR: 10, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      hoursWorkedByType: { REGULAR: 80, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      absentDays: 1,
      leaveWithoutPayDays: 1,
      regularHolidaysNotWorked: 1,
    }),
  });

  it("deducts one derived daily rate", () => {
    expect(r.rates.dailyRate).toBe("1341.85");
    expect(amountOf(r, "BASIC")).toBe("16158.15");
  });

  it("explains the leave in the basic line and raises no unrecorded flag", () => {
    const basic = r.lines.find((l) => l.componentCode === "BASIC");
    expect(basic?.note).toContain("1 absence(s) incl. 1 leave w/o pay");
    expect(r.flags.map((f) => f.code)).not.toContain("UNRECORDED_DAYS");
  });
});

describe("leave with pay keeps a monthly employee whole", () => {
  const r = computePayslip({
    ...base,
    paySetting: paySetting({ payType: "MONTHLY", monthlyRate: "35000.00" }),
    summary: summary({
      daysWorked: 11,
      daysWorkedByType: { REGULAR: 11, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      hoursWorkedByType: { REGULAR: 80, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      leaveWithPayDays: 1,
      regularHolidaysNotWorked: 1,
    }),
  });
  it("basic is the full half month", () => {
    expect(amountOf(r, "BASIC")).toBe("17500.00");
  });
});

describe("daily employee", () => {
  it("leave with pay is paid like a worked day", () => {
    const r = computePayslip({
      ...base,
      paySetting: paySetting({ payType: "DAILY", dailyRate: "645.00" }),
      summary: summary({
        daysWorked: 11,
        daysWorkedByType: { REGULAR: 11, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
        leaveWithPayDays: 1,
        regularHolidaysNotWorked: 1,
      }),
    });
    expect(amountOf(r, "BASIC")).toBe("7095.00");
  });
  it("leave without pay is simply not paid", () => {
    const r = computePayslip({
      ...base,
      paySetting: paySetting({ payType: "DAILY", dailyRate: "645.00" }),
      summary: summary({
        daysWorked: 10,
        daysWorkedByType: { REGULAR: 10, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
        absentDays: 1,
        leaveWithoutPayDays: 1,
        regularHolidaysNotWorked: 1,
      }),
    });
    expect(amountOf(r, "BASIC")).toBe("6450.00");
  });
});
