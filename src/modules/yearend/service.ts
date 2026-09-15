import "server-only";
import { AppError } from "@/lib/action-result";
import { toIsoDate } from "@/lib/dates";
import { Decimal, money, round2 } from "@/lib/money";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { getEmployee } from "@/modules/employees/service";
import {
  computeWithholdingTax,
  THIRTEENTH_MONTH_NON_TAXABLE_CEILING,
} from "@/modules/payroll/engine";
import * as payroll from "@/modules/payroll/service";
import { ANNUALIZATION_CODES } from "@/modules/payroll/schema";

/**
 * Year-end tax annualization (Phase 7).
 *
 * Per employee: annual taxable compensation = Σ taxable income of the year's regular payslips
 * + the 13th-month excess over the tax-free ceiling; annual tax due from the ANNUAL column of
 * the withholding table in force on Dec 31; withheld = Σ WTAX lines (existing annualization
 * lines are ignored so a re-run starts from the same base). The difference becomes a refund
 * (earning) or additional tax (deduction) adjustment on the last unapproved regular period of
 * the year, then that period is recomputed. Re-applying replaces the earlier line.
 */

const zero = new Decimal(0);
const fmt = (d: Decimal) => round2(d).toFixed(2);

export type AnnualizationRow = {
  employeeId: string;
  employeeNo: string;
  name: string;
  tin: string | null;
  periods: number;
  /** Periods below APPROVED that were included as provisional figures. */
  provisional: number;
  taxable: string;
  thirteenthExcess: string;
  withheld: string;
  due: string;
  /** due − withheld: positive = additional tax, negative = refund. */
  difference: string;
  minimumWage: boolean;
  /** An annualization line already sits in the last period (its signed amount). */
  applied: string | null;
};

export type Annualization = {
  year: number;
  hasTaxTable: boolean;
  lastPeriod: {
    id: string;
    start: string;
    end: string;
    status: string;
    frozen: boolean;
  } | null;
  rows: AnnualizationRow[];
  totals: { withheld: string; due: string; refunds: string; additional: string };
};

export async function annualize(
  scope: Scope,
  companyId: string,
  year: number,
): Promise<Annualization> {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const periods = await payroll.listPeriodsEndingBetween(
    scope,
    companyId,
    `${year}-01-01`,
    `${year}-12-31`,
  );
  const usable = periods.filter((p) => p.status !== "DRAFT");
  const regular = usable.filter((p) => p.type === "REGULAR");
  const last = regular.length ? regular[regular.length - 1]! : null;
  const { tables } = await payroll.loadStatutoryTables(scope, `${year}-12-31`);
  const annual = tables.tax.filter((b) => b.frequency === "ANNUAL");

  type Acc = {
    employeeNo: string;
    name: string;
    tin: string | null;
    periods: number;
    provisional: number;
    taxable: Decimal;
    thirteenth: Decimal;
    withheld: Decimal;
    minimumWage: boolean;
    applied: Decimal | null;
  };
  const acc = new Map<string, Acc>();
  for (const p of usable) {
    const frozen = payroll.isFrozenStatus(p.status);
    const slips = await payroll.listPayslipsForDocuments(scope, companyId, p.id);
    for (const s of slips) {
      const c = s.snapshot?.computation ?? s.computation;
      const e = s.snapshot?.employee ?? s.employee;
      const a = acc.get(s.employeeId) ?? {
        employeeNo: e.employeeNo,
        name: `${e.lastName}, ${e.firstName}`,
        tin: e.tin,
        periods: 0,
        provisional: 0,
        taxable: zero,
        thirteenth: zero,
        withheld: zero,
        minimumWage: true,
        applied: null,
      };
      a.periods++;
      if (!frozen) a.provisional++;
      a.minimumWage = a.minimumWage && c.input.paySetting.isMinimumWageEarner;
      if (p.type === "REGULAR") a.taxable = a.taxable.plus(s.taxableIncome.toString());
      for (const l of s.lines) {
        if (l.componentCode === "WTAX") a.withheld = a.withheld.plus(l.amount.toString());
        if (l.componentCode === "THIRTEENTH_MONTH")
          a.thirteenth = a.thirteenth.plus(l.amount.toString());
        if (
          last &&
          p.id === last.id &&
          (ANNUALIZATION_CODES as readonly string[]).includes(l.componentCode)
        ) {
          const signed =
            l.componentCode === "TAX_REFUND"
              ? money(l.amount.toString()).neg()
              : money(l.amount.toString());
          a.applied = (a.applied ?? zero).plus(signed);
        }
      }
      acc.set(s.employeeId, a);
    }
  }

  const rows: AnnualizationRow[] = [...acc.entries()]
    .map(([employeeId, a]) => {
      const excess = Decimal.max(zero, a.thirteenth.minus(THIRTEENTH_MONTH_NON_TAXABLE_CEILING));
      const taxable = a.minimumWage ? zero : round2(a.taxable.plus(excess));
      const due =
        annual.length === 0
          ? zero
          : computeWithholdingTax(taxable, "ANNUAL", annual, a.minimumWage).tax;
      return {
        employeeId,
        employeeNo: a.employeeNo,
        name: a.name,
        tin: a.tin,
        periods: a.periods,
        provisional: a.provisional,
        taxable: fmt(taxable),
        thirteenthExcess: fmt(excess),
        withheld: fmt(a.withheld),
        due: fmt(due),
        difference: fmt(due.minus(a.withheld)),
        minimumWage: a.minimumWage,
        applied: a.applied === null ? null : fmt(a.applied),
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
  const sum = (f: (r: AnnualizationRow) => Decimal) =>
    fmt(rows.reduce((t, r) => t.plus(f(r)), zero));
  return {
    year,
    hasTaxTable: annual.length > 0,
    lastPeriod: last
      ? {
          id: last.id,
          start: toIsoDate(last.coverageStart),
          end: toIsoDate(last.coverageEnd),
          status: last.status,
          frozen: payroll.isFrozenStatus(last.status),
        }
      : null,
    rows,
    totals: {
      withheld: sum((r) => money(r.withheld)),
      due: sum((r) => money(r.due)),
      refunds: sum((r) => Decimal.max(zero, money(r.difference).neg())),
      additional: sum((r) => Decimal.max(zero, money(r.difference))),
    },
  };
}

/**
 * Write the refund / additional-tax lines into the last regular period of the year and
 * recompute it. Employees with no difference get any earlier annualization line removed.
 */
export async function applyAnnualization(scope: Scope, companyId: string, year: number) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const a = await annualize(scope, companyId, year);
  if (!a.hasTaxTable) throw new AppError(`No annual tax table is in force for ${year}.`);
  if (!a.lastPeriod) throw new AppError(`No computed regular period ends in ${year}.`);
  if (a.lastPeriod.frozen)
    throw new AppError(
      `The last period of ${year} (${a.lastPeriod.start} – ${a.lastPeriod.end}) is already approved. Revert it (admin) or create the year's final period first.`,
    );
  let applied = 0;
  let cleared = 0;
  for (const r of a.rows) {
    const employee = await getEmployee(scope, companyId, r.employeeId);
    if (!employee) continue;
    const diff = money(r.difference);
    const reason = `Year-end annualization ${year}: taxable ${r.taxable}, tax due ${r.due}, withheld ${r.withheld}`;
    if (diff.abs().lt("0.01")) {
      if (r.applied !== null) {
        await payroll.setAnnualizationAdjustment(
          scope,
          companyId,
          a.lastPeriod.id,
          r.employeeId,
          null,
        );
        cleared++;
      }
      continue;
    }
    if (r.applied !== null && money(r.applied).eq(diff)) continue; // already in place
    await payroll.setAnnualizationAdjustment(scope, companyId, a.lastPeriod.id, r.employeeId, {
      kind: diff.gt(0) ? "ADDITIONAL" : "REFUND",
      amount: diff.abs().toFixed(2),
      reason,
    });
    applied++;
  }
  return { applied, cleared, periodId: a.lastPeriod.id };
}
