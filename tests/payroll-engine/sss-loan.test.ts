import { describe, expect, it } from "vitest";
import { applyLoans, computePayslip } from "@/modules/payroll/engine";
import {
  amountOf,
  COMPONENTS,
  paySetting,
  PERIOD_1ST,
  PERIOD_2ND,
  POLICY,
  summary,
  TABLES,
} from "./fixtures";

/**
 * Same daily-rate employee as daily-rate.test.ts (net before loans 7,462.83) with two loans:
 *   SSS loan      amortization 600.00 per period, balance 1,000.00 → 600.00 this cutoff (400.00 left)
 *   Pag-IBIG loan amortization 250.00 per period, balance   150.00 → 150.00 (capped at balance, final)
 *
 * | Line              | Basis                                   |    Amount |
 * |-------------------|-----------------------------------------|----------:|
 * | GROSS             | as daily-rate example                   |  9,124.50 |
 * | Lates / undertime |                                         |     80.21 |
 * | SSS               |                                         |    925.00 |
 * | Pag-IBIG          |                                         |    200.00 |
 * | PhilHealth        |                                         |    456.46 |
 * | SSS loan          | 600.00 per period                       |    600.00 |
 * | Pag-IBIG loan     | min(250.00, balance 150.00)             |    150.00 |
 * | TOTAL DEDUCTIONS  |                                         |  2,411.67 |
 * | NET PAY           |                                         |  6,712.83 |
 */
describe("worked example: employee with SSS loan", () => {
  const loans = [
    { id: "L1", type: "SSS_LOAN" as const, amortization: "600.00", balance: "1000.00" },
    { id: "L2", type: "PAGIBIG_LOAN" as const, amortization: "250.00", balance: "150.00" },
    { id: "L3", type: "CASH_ADVANCE" as const, amortization: "300.00", balance: "0.00" },
  ];
  const input = {
    paySetting: paySetting({ payType: "DAILY", dailyRate: "700.00" }),
    policy: POLICY,
    summary: summary({
      daysWorked: 11,
      daysWorkedByType: { REGULAR: 10, REST_DAY: 1, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      hoursWorkedByType: { REGULAR: 80, REST_DAY: 8, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      absentDays: 1,
      lateMinutes: 25,
      undertimeMinutes: 30,
      otHoursByType: { REGULAR: 2, REST_DAY: 2, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      otHours: 4,
      regularHolidaysNotWorked: 1,
    }),
    period: PERIOD_2ND,
    tables: TABLES,
    components: COMPONENTS,
    recurring: [],
    adjustments: [],
    loans,
  };
  const r = computePayslip(input);

  it("takes one amortization per period, never beyond the balance", () => {
    expect(amountOf(r, "SSS_LOAN")).toBe("600.00");
    expect(amountOf(r, "HDMF_LOAN")).toBe("150.00");
    expect(amountOf(r, "CASH_ADV")).toBe("0.00");
    expect(r.loanPayments).toEqual([
      { loanId: "L1", amount: "600.00", remainingBalance: "400.00" },
      { loanId: "L2", amount: "150.00", remainingBalance: "0.00" },
    ]);
    expect(r.lines.find((l) => l.componentCode === "HDMF_LOAN")?.note).toBe("final payment");
  });

  it("totals", () => {
    expect(r.gross).toBe("9124.50");
    expect(r.totalDeductions).toBe("2411.67");
    expect(r.net).toBe("6712.83");
    expect(r.flags).toEqual([]);
  });

  it("loans are still taken in the 1st cutoff when statutory deductions are not", () => {
    const first = computePayslip({ ...input, period: PERIOD_1ST });
    expect(amountOf(first, "SSS_EE")).toBe("0.00");
    expect(amountOf(first, "SSS_LOAN")).toBe("600.00");
  });

  it("applyLoans ignores the pay frequency (the record already holds the per-period amount)", () => {
    const { lines } = applyLoans(loans, { ...PERIOD_2ND, frequency: "MONTHLY" });
    expect(lines.map((l) => l.amount)).toEqual(["600.00", "150.00"]);
    expect(lines[0]?.note).toBe("balance after: 400.00");
    expect(lines.every((l) => l.isManual === false)).toBe(true);
  });
});
