import { describe, expect, it } from "vitest";
import { computePayslip } from "@/modules/payroll/engine";
import { amountOf, COMPONENTS, paySetting, PERIOD_2ND, POLICY, summary, TABLES } from "./fixtures";

/**
 * Employee above every ceiling (Lim, ₱120,000 monthly), 16–31 Aug 2026, 2nd cutoff, clean attendance.
 * Daily 120,000 × 12 / 313 = 4,600.64; hourly 575.08.
 *
 * | Line             | Basis                                              |    Amount |
 * |------------------|----------------------------------------------------|----------:|
 * | Basic pay        | ½ × 120,000.00                                     | 60,000.00 |
 * | GROSS            |                                                    | 60,000.00 |
 * | SSS              | MSC capped at 35,000: 1,000.00 + WISP 750.00       |  1,750.00 |
 * | Pag-IBIG         | fund salary capped at 10,000 × 2%                  |    200.00 |
 * | PhilHealth       | salary capped at 100,000 × 5% = 5,000 ÷ 2          |  2,500.00 |
 * | Withholding tax  | taxable 55,550.00: 4,270.70 + (55,550−33,333)×25%  |  9,824.95 |
 * | TOTAL DEDUCTIONS |                                                    | 14,274.95 |
 * | NET PAY          |                                                    | 45,725.05 |
 */
describe("worked example: employee at the SSS / PhilHealth ceilings", () => {
  const r = computePayslip({
    paySetting: paySetting({ payType: "MONTHLY", monthlyRate: "120000.00" }),
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

  it("rates", () => {
    expect(r.rates).toEqual({
      monthlyBasic: "120000.00",
      dailyRate: "4600.64",
      hourlyRate: "575.08",
    });
  });

  it("contributions stop at the ceilings", () => {
    expect(amountOf(r, "SSS_EE")).toBe("1750.00");
    expect(amountOf(r, "PHIC_EE")).toBe("2500.00");
    expect(amountOf(r, "HDMF_EE")).toBe("200.00");
    expect(r.employer).toEqual({
      sssEr: "3500.00",
      sssEc: "30.00",
      sssWispEr: "1500.00",
      philhealthEr: "2500.00",
      pagibigEr: "200.00",
    });
  });

  it("tax lands in the 25% bracket", () => {
    expect(r.taxableIncome).toBe("55550.00");
    expect(amountOf(r, "WTAX")).toBe("9824.95");
    expect(r.lines.find((l) => l.componentCode === "WTAX")?.note).toBe(
      "4,270.70 + 25% over 33,333.00 on 55,550.00",
    );
  });

  it("totals", () => {
    expect(r.gross).toBe("60000.00");
    expect(r.totalDeductions).toBe("14274.95");
    expect(r.net).toBe("45725.05");
    expect(r.flags).toEqual([]);
  });
});
