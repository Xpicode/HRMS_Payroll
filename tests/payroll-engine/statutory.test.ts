import { describe, expect, it } from "vitest";
import { Decimal } from "@/lib/money";
import {
  computePagibig,
  computePhilhealth,
  computeSss,
  computeWithholdingTax,
  periodShare,
} from "@/modules/payroll/engine";
import { PERIOD_1ST, PERIOD_2ND, TABLES } from "./fixtures";

const d = (s: string | number) => new Decimal(s);

describe("SSS schedule (seeded 2026 table)", () => {
  it("has 61 brackets from ₱5,000 to ₱35,000 in ₱500 steps", () => {
    expect(TABLES.sss).toHaveLength(61);
    expect(TABLES.sss[0]).toMatchObject({
      minSalary: "0.00",
      maxSalary: "5249.99",
      msc: "5000.00",
    });
    expect(TABLES.sss.at(-1)).toMatchObject({
      minSalary: "34750.00",
      maxSalary: null,
      msc: "35000.00",
    });
  });
  it("floor: below ₱5,250 uses MSC 5,000 (EE 250, ER 500, EC 10)", () => {
    const s = computeSss(d(3000), TABLES.sss)!;
    expect([s.msc.toFixed(2), s.ee.toFixed(2), s.er.toFixed(2), s.ec.toFixed(2)]).toEqual([
      "5000.00",
      "250.00",
      "500.00",
      "10.00",
    ]);
  });
  it("EC steps to ₱30 at MSC 15,000", () => {
    expect(computeSss(d(14749.99), TABLES.sss)!.ec.toFixed(2)).toBe("10.00");
    expect(computeSss(d(14750), TABLES.sss)!.ec.toFixed(2)).toBe("30.00");
  });
  it("WISP applies to the MSC portion above ₱20,000", () => {
    const at20k = computeSss(d(20000), TABLES.sss)!;
    expect(at20k.wispEe.toFixed(2)).toBe("0.00");
    const at20500 = computeSss(d(20250), TABLES.sss)!;
    expect(at20500.msc.toFixed(2)).toBe("20500.00");
    expect(at20500.regularEe.toFixed(2)).toBe("1000.00");
    expect(at20500.wispEe.toFixed(2)).toBe("25.00");
    expect(at20500.ee.toFixed(2)).toBe("1025.00");
    expect(at20500.er.toFixed(2)).toBe("2050.00");
  });
  it("bracket edges", () => {
    expect(computeSss(d(18249.99), TABLES.sss)!.msc.toFixed(2)).toBe("18000.00");
    expect(computeSss(d(18250), TABLES.sss)!.msc.toFixed(2)).toBe("18500.00");
  });
});

describe("PhilHealth", () => {
  it("floor ₱10,000 → ₱250 each", () => {
    const p = computePhilhealth(d(9000), TABLES.philhealth!);
    expect([p.premium.toFixed(2), p.ee.toFixed(2), p.er.toFixed(2)]).toEqual([
      "500.00",
      "250.00",
      "250.00",
    ]);
  });
  it("ceiling ₱100,000 → ₱2,500 each", () => {
    const p = computePhilhealth(d(250000), TABLES.philhealth!);
    expect([p.ee.toFixed(2), p.er.toFixed(2)]).toEqual(["2500.00", "2500.00"]);
  });
  it("odd centavo goes to the employer", () => {
    const p = computePhilhealth(d(16823.75), TABLES.philhealth!);
    expect([p.premium.toFixed(2), p.ee.toFixed(2), p.er.toFixed(2)]).toEqual([
      "841.19",
      "420.60",
      "420.59",
    ]);
  });
});

describe("Pag-IBIG", () => {
  it("1% employee share at or below ₱1,500", () => {
    const p = computePagibig(d(1500), TABLES.pagibig!);
    expect([p.ee.toFixed(2), p.er.toFixed(2)]).toEqual(["15.00", "30.00"]);
  });
  it("2% above ₱1,500", () => {
    const p = computePagibig(d(1500.01), TABLES.pagibig!);
    expect(p.ee.toFixed(2)).toBe("30.00");
  });
  it("capped at the ₱10,000 fund salary", () => {
    const p = computePagibig(d(12000), TABLES.pagibig!);
    expect([p.ee.toFixed(2), p.er.toFixed(2)]).toEqual(["200.00", "200.00"]);
  });
});

describe("withholding tax (2023 table)", () => {
  const tax = (n: number, f: "SEMI_MONTHLY" | "MONTHLY" = "SEMI_MONTHLY") =>
    computeWithholdingTax(d(n), f, TABLES.tax, false).tax.toFixed(2);
  it("semi-monthly boundaries", () => {
    expect(tax(10416.99)).toBe("0.00");
    expect(tax(10417)).toBe("0.00");
    expect(tax(16667)).toBe("937.50");
    expect(tax(33333)).toBe("4270.70");
    expect(tax(83333)).toBe("16770.70");
    expect(tax(333333)).toBe("91770.70");
    expect(tax(400000)).toBe("115104.15"); // 91,770.70 + 66,667 × 35%
  });
  it("monthly boundaries", () => {
    expect(tax(20833, "MONTHLY")).toBe("0.00");
    expect(tax(33333, "MONTHLY")).toBe("1875.00");
    expect(tax(66667, "MONTHLY")).toBe("8541.80");
    expect(tax(166667, "MONTHLY")).toBe("33541.80");
    expect(tax(666667, "MONTHLY")).toBe("183541.80");
  });
  it("minimum-wage earners are exempt; nothing on non-positive income", () => {
    expect(computeWithholdingTax(d(50000), "SEMI_MONTHLY", TABLES.tax, true).exempt).toBe(true);
    expect(tax(-100)).toBe("0.00");
  });
});

describe("periodShare", () => {
  const monthly = { ...PERIOD_2ND, frequency: "MONTHLY" as const };
  it("SECOND_CUTOFF / FIRST_CUTOFF", () => {
    expect(periodShare(d(925), PERIOD_2ND, "SECOND_CUTOFF").toFixed(2)).toBe("925.00");
    expect(periodShare(d(925), PERIOD_1ST, "SECOND_CUTOFF").toFixed(2)).toBe("0.00");
    expect(periodShare(d(925), PERIOD_1ST, "FIRST_CUTOFF").toFixed(2)).toBe("925.00");
    expect(periodShare(d(925), PERIOD_2ND, "FIRST_CUTOFF").toFixed(2)).toBe("0.00");
  });
  it("SPLIT adds up to the month exactly", () => {
    expect(periodShare(d("456.45"), PERIOD_1ST, "SPLIT").toFixed(2)).toBe("228.23");
    expect(periodShare(d("456.45"), PERIOD_2ND, "SPLIT").toFixed(2)).toBe("228.22");
    expect(periodShare(d("0.01"), PERIOD_1ST, "SPLIT").toFixed(2)).toBe("0.01");
    expect(periodShare(d("0.01"), PERIOD_2ND, "SPLIT").toFixed(2)).toBe("0.00");
  });
  it("monthly payroll takes everything regardless of timing", () => {
    expect(periodShare(d(925), monthly, "SPLIT").toFixed(2)).toBe("925.00");
    expect(periodShare(d(925), monthly, "FIRST_CUTOFF").toFixed(2)).toBe("925.00");
  });
});
