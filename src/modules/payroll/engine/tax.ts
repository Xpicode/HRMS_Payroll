import { Decimal, money, round2 } from "@/lib/money";
import type { TaxBracketInput, TaxTableFrequency } from "./types";

export type TaxComputation = { tax: Decimal; bracket: TaxBracketInput | null; exempt: boolean };

/**
 * BIR withholding on compensation: pick the column for the pay frequency and the row with
 * lower ≤ taxable < upper; tax = baseTax + (taxable − lower) × rateOver, rounded half-up.
 * Minimum-wage earners are exempt. No matching row (empty table) returns null bracket so
 * the caller can flag it rather than silently withhold nothing.
 */
export function computeWithholdingTax(
  taxableIncome: Decimal,
  frequency: TaxTableFrequency,
  brackets: TaxBracketInput[],
  isMinimumWage: boolean,
): TaxComputation {
  const zero = new Decimal(0);
  if (isMinimumWage) return { tax: zero, bracket: null, exempt: true };
  const income = money(taxableIncome);
  const column = brackets.filter((b) => b.frequency === frequency);
  if (column.length === 0) return { tax: zero, bracket: null, exempt: false };
  if (income.lte(0)) {
    const first = column.find((b) => money(b.lower).eq(0)) ?? column[0]!;
    return { tax: zero, bracket: first, exempt: false };
  }
  const bracket =
    column.find((b) => income.gte(b.lower) && (b.upper === null || income.lt(b.upper))) ?? null;
  if (!bracket) return { tax: zero, bracket: null, exempt: false };
  const tax = money(bracket.baseTax).plus(income.minus(bracket.lower).times(bracket.rateOver));
  return { tax: Decimal.max(zero, round2(tax)), bracket, exempt: false };
}
