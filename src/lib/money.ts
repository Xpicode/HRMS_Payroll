import Decimal from "decimal.js";

/**
 * Money helpers. Currency is never a JS number: Postgres numeric(12,2) <-> Decimal.
 * Rounding is half-up to 2 decimals per line (AGENTS.md).
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export type MoneyInput = Decimal | string | number | { toString(): string };

export const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

export function isMoneyString(value: string): boolean {
  return MONEY_RE.test(value.trim());
}

export function money(value: MoneyInput): Decimal {
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

export function round2(value: MoneyInput): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

const FORMATTER = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1234.5" -> "1,234.50"; null/undefined -> blank (defaults to "-" like the payslip). */
export function formatMoney(value: MoneyInput | null | undefined, blank = "-"): string {
  if (value === null || value === undefined || value === "") return blank;
  return FORMATTER.format(Number(round2(value).toFixed(2)));
}

/** Monthly employees: daily rate = monthly x 12 / working days per year (policy). */
export function dailyFromMonthly(monthly: MoneyInput, workingDaysPerYear: number): Decimal {
  if (workingDaysPerYear <= 0) throw new Error("workingDaysPerYear must be positive");
  return round2(money(monthly).times(12).dividedBy(workingDaysPerYear));
}

/** Hourly rate = daily rate / hours per day (policy). */
export function hourlyFromDaily(daily: MoneyInput, hoursPerDay: MoneyInput): Decimal {
  const h = money(hoursPerDay);
  if (h.lte(0)) throw new Error("hoursPerDay must be positive");
  return round2(money(daily).dividedBy(h));
}
