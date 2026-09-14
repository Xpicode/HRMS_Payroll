import { describe, expect, it } from "vitest";
import { computePayslip } from "@/modules/payroll/engine";
import { amountOf, COMPONENTS, paySetting, PERIOD_2ND, POLICY, summary, TABLES } from "./fixtures";

/**
 * Minimum-wage earner (Santos, ₱645.00 daily), 16–31 Aug 2026, 2nd cutoff.
 * Hourly 645 / 8 = 80.625 → 80.63; monthly basic 645 × 313 / 12 = 16,823.75.
 * Attendance: all 11 scheduled days worked, RH not worked, no OT, no lates.
 * `taxWithheld` is left on to prove the exemption comes from the MWE flag, not the setting.
 *
 * | Line                          | Basis                          |   Amount |
 * |-------------------------------|--------------------------------|---------:|
 * | Basic pay                     | 645.00 × 11 days               | 7,095.00 |
 * | Regular holiday (not worked)  | 1 × 645.00                     |   645.00 |
 * | GROSS                         |                                | 7,740.00 |
 * | SSS                           | MSC 17,000 × 5%                |   850.00 |
 * | Pag-IBIG                      | 10,000 × 2%                    |   200.00 |
 * | PhilHealth                    | 16,823.75 × 5% = 841.19 ÷ 2    |   420.60 |
 * | Withholding tax               | minimum-wage earner: exempt    |     0.00 |
 * | TOTAL DEDUCTIONS              |                                | 1,470.60 |
 * | NET PAY                       |                                | 6,269.40 |
 */
describe("worked example: minimum-wage earner", () => {
  const r = computePayslip({
    paySetting: paySetting({ payType: "DAILY", dailyRate: "645.00", isMinimumWageEarner: true }),
    policy: POLICY,
    summary: summary({
      daysWorked: 11,
      daysWorkedByType: { REGULAR: 11, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      hoursWorkedByType: { REGULAR: 88, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      regularHolidaysNotWorked: 1,
    }),
    period: PERIOD_2ND,
    tables: TABLES,
    components: COMPONENTS,
    recurring: [],
    loans: [],
  });

  it("rates round half-up", () => {
    expect(r.rates).toEqual({ monthlyBasic: "16823.75", dailyRate: "645.00", hourlyRate: "80.63" });
  });

  it("earnings", () => {
    expect(amountOf(r, "BASIC")).toBe("7095.00");
    expect(amountOf(r, "HOLIDAY_PAY")).toBe("645.00");
    expect(r.gross).toBe("7740.00");
  });

  it("contributions apply, tax does not", () => {
    expect(amountOf(r, "SSS_EE")).toBe("850.00");
    expect(amountOf(r, "HDMF_EE")).toBe("200.00");
    expect(amountOf(r, "PHIC_EE")).toBe("420.60");
    expect(r.lines.some((l) => l.componentCode === "WTAX")).toBe(false);
    expect(r.taxableIncome).toBe("6269.40");
    expect(r.totalDeductions).toBe("1470.60");
    expect(r.employer.philhealthEr).toBe("420.59");
  });

  it("net", () => {
    expect(r.net).toBe("6269.40");
    expect(r.flags).toEqual([]);
  });
});
