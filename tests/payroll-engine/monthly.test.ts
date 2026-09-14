import { describe, expect, it } from "vitest";
import { computePayslip } from "@/modules/payroll/engine";
import { amountOf, COMPONENTS, paySetting, PERIOD_2ND, POLICY, summary, TABLES } from "./fixtures";

/**
 * Monthly employee (Garcia, ₱35,000), 16–31 Aug 2026, 2nd cutoff, allowance ₱1,000 (taxable).
 * Daily rate 35,000 × 12 / 313 = 1,341.85; hourly 167.73.
 * Attendance: all 11 scheduled days worked, RH not worked (already in the monthly pay), 3 h regular OT, 10 min late.
 *
 * | Line                    | Basis                                     |    Amount |
 * |-------------------------|-------------------------------------------|----------:|
 * | Basic pay               | ½ × 35,000.00                             | 17,500.00 |
 * | Overtime (regular day)  | 3 h × 167.73 × 1.25                       |    628.99 |
 * | Allowance               | recurring item                            |  1,000.00 |
 * | GROSS                   |                                           | 19,128.99 |
 * | Lates / undertime       | 10 min × 167.73 / 60                      |     27.96 |
 * | SSS                     | MSC 35,000: 1,000.00 + WISP 750.00        |  1,750.00 |
 * | Pag-IBIG                | 10,000 × 2%                               |    200.00 |
 * | PhilHealth              | 35,000 × 5% ÷ 2                           |    875.00 |
 * | Withholding tax         | taxable 16,276.03: (16,276.03−10,417)×15% |    878.85 |
 * | TOTAL DEDUCTIONS        |                                           |  3,731.81 |
 * | NET PAY                 |                                           | 15,397.18 |
 */
describe("worked example: monthly employee", () => {
  const r = computePayslip({
    paySetting: paySetting({ payType: "MONTHLY", monthlyRate: "35000.00" }),
    policy: POLICY,
    summary: summary({
      daysWorked: 11,
      daysWorkedByType: { REGULAR: 11, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      hoursWorkedByType: { REGULAR: 88, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      lateMinutes: 10,
      otHoursByType: { REGULAR: 3, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      otHours: 3,
      regularHolidaysNotWorked: 1,
    }),
    period: PERIOD_2ND,
    tables: TABLES,
    components: COMPONENTS,
    recurring: [
      { componentCode: "ALLOWANCE", kind: "EARNING", label: "Allowance", amount: "1000.00" },
    ],
    loans: [],
  });

  it("rates", () => {
    expect(r.rates).toEqual({
      monthlyBasic: "35000.00",
      dailyRate: "1341.85",
      hourlyRate: "167.73",
    });
  });

  it("earnings — no holiday pay line for a monthly employee's unworked holiday", () => {
    expect(amountOf(r, "BASIC")).toBe("17500.00");
    expect(amountOf(r, "HOLIDAY_PAY")).toBe("0.00");
    expect(amountOf(r, "OT")).toBe("628.99");
    expect(amountOf(r, "ALLOWANCE")).toBe("1000.00");
    expect(r.gross).toBe("19128.99");
  });

  it("deductions incl. WISP and tax bracket 2", () => {
    expect(amountOf(r, "LATE_UT")).toBe("27.96");
    expect(amountOf(r, "SSS_EE")).toBe("1750.00");
    expect(r.lines.find((l) => l.componentCode === "SSS_EE")?.note).toContain("WISP 750.00");
    expect(amountOf(r, "HDMF_EE")).toBe("200.00");
    expect(amountOf(r, "PHIC_EE")).toBe("875.00");
    expect(r.taxableIncome).toBe("16276.03");
    expect(amountOf(r, "WTAX")).toBe("878.85");
    expect(r.totalDeductions).toBe("3731.81");
  });

  it("net, employer shares, flags", () => {
    expect(r.net).toBe("15397.18");
    expect(r.employer).toEqual({
      sssEr: "3500.00",
      sssEc: "30.00",
      sssWispEr: "1500.00",
      philhealthEr: "875.00",
      pagibigEr: "200.00",
    });
    expect(r.flags).toEqual([]);
  });

  it("deducts absences at the derived daily rate", () => {
    const withAbsence = computePayslip({
      paySetting: paySetting({ payType: "MONTHLY", monthlyRate: "35000.00" }),
      policy: POLICY,
      summary: summary({
        daysWorked: 9,
        daysWorkedByType: { REGULAR: 9, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
        absentDays: 2,
      }),
      period: PERIOD_2ND,
      tables: TABLES,
      components: COMPONENTS,
      recurring: [],
      loans: [],
    });
    // 17,500.00 − 2 × 1,341.85
    expect(amountOf(withAbsence, "BASIC")).toBe("14816.30");
    expect(withAbsence.lines[0]?.note).toBe("½ of 35,000.00 less 2 absence(s) × 1,341.85");
  });
});
