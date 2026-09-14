import { describe, expect, it } from "vitest";
import { computePayslip } from "@/modules/payroll/engine";
import { amountOf, COMPONENTS, paySetting, PERIOD_2ND, POLICY, summary, TABLES } from "./fixtures";

/**
 * Negative net: minimum-wage daily employee (₱645.00) who worked only 2 of 11 scheduled days
 * (3 of the 9 absences are unrecorded), RH not worked, with a cash advance being amortized
 * (₱2,000 per period, balance ₱5,000). Contributions are still on the full monthly basic.
 *
 * | Line                          | Basis                        |    Amount |
 * |-------------------------------|------------------------------|----------:|
 * | Basic pay                     | 645.00 × 2 days              |  1,290.00 |
 * | Regular holiday (not worked)  | 1 × 645.00                   |    645.00 |
 * | GROSS                         |                              |  1,935.00 |
 * | SSS                           | MSC 17,000 × 5%              |    850.00 |
 * | Pag-IBIG                      | 10,000 × 2%                  |    200.00 |
 * | PhilHealth                    | 16,823.75 × 5% ÷ 2           |    420.60 |
 * | Cash advance                  | 2,000.00 per period          |  2,000.00 |
 * | TOTAL DEDUCTIONS              |                              |  3,470.60 |
 * | NET PAY                       | flagged, not clamped         | −1,535.60 |
 */
describe("worked example: negative net", () => {
  const r = computePayslip({
    paySetting: paySetting({ payType: "DAILY", dailyRate: "645.00", isMinimumWageEarner: true }),
    policy: POLICY,
    summary: summary({
      daysWorked: 2,
      daysWorkedByType: { REGULAR: 2, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      hoursWorkedByType: { REGULAR: 16, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      absentDays: 9,
      unrecordedDays: 3,
      regularHolidaysNotWorked: 1,
    }),
    period: PERIOD_2ND,
    tables: TABLES,
    components: COMPONENTS,
    recurring: [],
    adjustments: [],
    loans: [{ id: "CA1", type: "CASH_ADVANCE", amortization: "2000.00", balance: "5000.00" }],
  });

  it("computes the lines", () => {
    expect(r.gross).toBe("1935.00");
    expect(amountOf(r, "SSS_EE")).toBe("850.00");
    expect(amountOf(r, "HDMF_EE")).toBe("200.00");
    expect(amountOf(r, "PHIC_EE")).toBe("420.60");
    expect(amountOf(r, "CASH_ADV")).toBe("2000.00");
    expect(amountOf(r, "WTAX")).toBe("0.00");
    expect(r.totalDeductions).toBe("3470.60");
  });

  it("keeps the negative net and flags it, plus the unrecorded days", () => {
    expect(r.net).toBe("-1535.60");
    expect(r.flags.map((f) => f.code)).toEqual(["UNRECORDED_DAYS", "NEGATIVE_NET"]);
    expect(r.flags.find((f) => f.code === "NEGATIVE_NET")?.message).toContain("1,535.60");
  });
});
