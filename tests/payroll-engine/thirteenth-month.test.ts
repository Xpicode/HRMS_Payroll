import { describe, expect, it } from "vitest";
import {
  computeThirteenthMonth,
  computeWithholdingTax,
  THIRTEENTH_MONTH_NON_TAXABLE_CEILING,
} from "@/modules/payroll/engine";
import { money } from "@/lib/money";
import { amountOf, COMPONENTS, paySetting, POLICY, TABLES } from "./fixtures";

/**
 * 13th-month pay = Σ basic of the year's approved regular periods ÷ 12 (PD 851).
 *
 * | Case                                   | Σ basic     | 13th month |
 * |----------------------------------------|-------------|-----------:|
 * | Monthly ₱35,000, 24 periods of 17,500  | 420,000.00  |  35,000.00 |
 * | Joined July: 12 periods of 17,500      | 210,000.00  |  17,500.00 |
 * | Two months with an absence each        | see below   |            |
 * | ₱1,320,000 basic (110k/mo)             | 1,320,000   | 110,000.00 → 20,000 taxable excess |
 */
const base = {
  paySetting: paySetting({ payType: "MONTHLY", monthlyRate: "35000.00" }),
  policy: POLICY,
  components: COMPONENTS,
  adjustments: [],
  nonTaxableCeiling: THIRTEENTH_MONTH_NON_TAXABLE_CEILING,
};
const periods = (count: number, amount: string) =>
  Array.from({ length: count }, (_, i) => ({
    periodId: `p${i}`,
    start: `2026-${String(Math.floor(i / 2) + 1).padStart(2, "0")}-${i % 2 ? "16" : "01"}`,
    end: `2026-${String(Math.floor(i / 2) + 1).padStart(2, "0")}-${i % 2 ? "28" : "15"}`,
    amount,
  }));

describe("computeThirteenthMonth", () => {
  it("full year: one monthly salary, non-taxable, no deductions", () => {
    const r = computeThirteenthMonth({ ...base, year: 2026, basics: periods(24, "17500.00") });
    expect(amountOf(r, "THIRTEENTH_MONTH")).toBe("35000.00");
    expect(r.gross).toBe("35000.00");
    expect(r.totalDeductions).toBe("0.00");
    expect(r.net).toBe("35000.00");
    expect(r.taxableIncome).toBe("0.00");
    expect(r.flags).toEqual([]);
    expect(r.lines.find((l) => l.componentCode === "THIRTEENTH_MONTH")?.note).toContain(
      "420,000.00 ÷ 12 over 24 period(s)",
    );
    expect(r.employerPeriod?.sssEr).toBe("0.00");
  });

  it("pro-rates by construction: 12 periods → half", () => {
    const r = computeThirteenthMonth({ ...base, year: 2026, basics: periods(12, "17500.00") });
    expect(amountOf(r, "THIRTEENTH_MONTH")).toBe("17500.00");
  });

  it("uses the basic actually paid (absences already deducted)", () => {
    const basics = [...periods(22, "17500.00"), ...periods(2, "16158.15")];
    // 22 × 17,500 + 2 × 16,158.15 = 417,316.30 ÷ 12 = 34,776.36 (half-up from 34,776.358…)
    const r = computeThirteenthMonth({ ...base, year: 2026, basics });
    expect(amountOf(r, "THIRTEENTH_MONTH")).toBe("34776.36");
  });

  it("flags the excess over ₱90,000 as taxable for the annualization", () => {
    const r = computeThirteenthMonth({ ...base, year: 2026, basics: periods(24, "55000.00") });
    expect(amountOf(r, "THIRTEENTH_MONTH")).toBe("110000.00");
    expect(r.taxableIncome).toBe("20000.00");
    expect(r.flags.map((f) => f.code)).toContain("THIRTEENTH_MONTH_EXCESS");
    expect(amountOf(r, "WTAX")).toBe("0.00"); // nothing withheld on the 13th-month slip itself
  });

  it("no approved basic → nothing to pay, flagged", () => {
    const r = computeThirteenthMonth({ ...base, year: 2026, basics: [] });
    expect(r.lines).toEqual([]);
    expect(r.net).toBe("0.00");
    expect(r.flags.map((f) => f.code)).toEqual(["NO_BASIC_IN_YEAR"]);
  });

  it("merges manual adjustments like a regular period", () => {
    const r = computeThirteenthMonth({
      ...base,
      year: 2026,
      basics: periods(24, "17500.00"),
      adjustments: [
        {
          componentCode: "OTHERS",
          kind: "DEDUCTION",
          label: "Uniform",
          amount: "500.00",
          reason: "x",
        },
      ],
    });
    expect(r.net).toBe("34500.00");
    expect(r.lines.find((l) => l.componentCode === "OTHERS")?.isManual).toBe(true);
  });
});

/**
 * Annual tax (TRAIN, from 2023): 0 ≤ 250k; 15% over 250k; 22,500 + 20% over 400k;
 * 102,500 + 25% over 800k; 402,500 + 30% over 2M; 2,202,500 + 35% over 8M.
 */
describe("annual tax table", () => {
  const annual = TABLES.tax.filter((b) => b.frequency === "ANNUAL");
  const due = (taxable: string) =>
    computeWithholdingTax(money(taxable), "ANNUAL", annual, false).tax.toFixed(2);
  it("is seeded with six brackets", () => {
    expect(annual).toHaveLength(6);
  });
  it("matches the BIR schedule at the boundaries", () => {
    expect(due("250000.00")).toBe("0.00");
    expect(due("300000.00")).toBe("7500.00"); // 15% × 50,000
    expect(due("400000.00")).toBe("22500.00");
    expect(due("500000.00")).toBe("42500.00"); // 22,500 + 20% × 100,000
    expect(due("800000.00")).toBe("102500.00");
    expect(due("1000000.00")).toBe("152500.00"); // 102,500 + 25% × 200,000
    expect(due("2000000.00")).toBe("402500.00");
    expect(due("8000000.00")).toBe("2202500.00");
    expect(due("9000000.00")).toBe("2552500.00"); // + 35% × 1M
  });
  it("exempts minimum-wage earners", () => {
    expect(computeWithholdingTax(money("300000"), "ANNUAL", annual, true).tax.toFixed(2)).toBe(
      "0.00",
    );
  });
});
