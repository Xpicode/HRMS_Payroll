import { Decimal, money, round2 } from "@/lib/money";
import type {
  EnginePeriod,
  EngineStatutoryTiming,
  PagibigRuleInput,
  PhilhealthRuleInput,
  SssTableRow,
} from "./types";

export type SssComputation = {
  msc: Decimal;
  /** Total employee share for the month (regular + WISP). */
  ee: Decimal;
  /** Total employer share for the month (regular + WISP), excluding EC. */
  er: Decimal;
  ec: Decimal;
  regularEe: Decimal;
  wispEe: Decimal;
  regularEr: Decimal;
  wispEr: Decimal;
};

/** Bracket lookup on the monthly basic salary: min ≤ salary ≤ max (max null = open). */
export function computeSss(monthlyBasic: Decimal, table: SssTableRow[]): SssComputation | null {
  const salary = money(monthlyBasic);
  const row = table.find(
    (r) => salary.gte(r.minSalary) && (r.maxSalary === null || salary.lte(r.maxSalary)),
  );
  if (!row) return null;
  const regularEe = money(row.eeShare);
  const wispEe = money(row.wispEe);
  const regularEr = money(row.erShare);
  const wispEr = money(row.wispEr);
  return {
    msc: money(row.msc),
    ee: round2(regularEe.plus(wispEe)),
    er: round2(regularEr.plus(wispEr)),
    ec: money(row.ecShare),
    regularEe,
    wispEe,
    regularEr,
    wispEr,
  };
}

export type PhilhealthComputation = { base: Decimal; premium: Decimal; ee: Decimal; er: Decimal };

/** Premium = rate × salary clamped to [floor, ceiling]; employee pays half (rounded), employer the rest. */
export function computePhilhealth(
  monthlyBasic: Decimal,
  rule: PhilhealthRuleInput,
): PhilhealthComputation {
  const base = Decimal.max(
    money(rule.floorSalary),
    Decimal.min(money(rule.ceilingSalary), monthlyBasic),
  );
  const premium = round2(base.times(rule.rate));
  const ee = round2(premium.dividedBy(2));
  return { base, premium, ee, er: premium.minus(ee) };
}

export type PagibigComputation = { base: Decimal; eeRate: Decimal; ee: Decimal; er: Decimal };

/** Employee 2% (1% at or below the low-income threshold), employer 2%, on compensation up to the fund salary cap. */
export function computePagibig(
  monthlyCompensation: Decimal,
  rule: PagibigRuleInput,
): PagibigComputation {
  const base = Decimal.min(money(rule.maxFundSalary), monthlyCompensation);
  const eeRate = monthlyCompensation.lte(rule.lowIncomeThreshold)
    ? money(rule.lowIncomeEeRate)
    : money(rule.eeRate);
  return { base, eeRate, ee: round2(base.times(eeRate)), er: round2(base.times(rule.erRate)) };
}

/**
 * How much of a monthly amount is taken in this period.
 *   MONTHLY payroll: all of it.  FIRST_CUTOFF / SECOND_CUTOFF: all of it in that cutoff, none in the other.
 *   SPLIT: half in the first cutoff (rounded), the remainder in the second so the month adds up exactly.
 */
export function periodShare(
  monthlyAmount: Decimal,
  period: EnginePeriod,
  timing: EngineStatutoryTiming,
): Decimal {
  const full = round2(monthlyAmount);
  if (period.frequency === "MONTHLY") return full;
  if (timing === "FIRST_CUTOFF") return period.sequenceInMonth === 1 ? full : new Decimal(0);
  if (timing === "SECOND_CUTOFF") return period.sequenceInMonth === 2 ? full : new Decimal(0);
  const first = round2(full.dividedBy(2));
  return period.sequenceInMonth === 1 ? first : full.minus(first);
}
