import "server-only";
import { AppError } from "@/lib/action-result";
import { toDateOnly, toIsoDate, type Cutoff } from "@/lib/dates";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { getCompany, getPolicyOn } from "@/modules/companies/service";
import { getEmployee } from "@/modules/employees/service";
import { cutoffSummaryFor, paySettingOn } from "@/modules/attendance/service";
import * as repo from "./repo";
import {
  computePayslip,
  type EngineInput,
  type EnginePaySetting,
  type EnginePolicy,
  type PayComponentDef,
  type PayslipComputation,
  type RecurringItemInput,
  type StatutoryTables,
} from "./engine";

const s = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());

/** Statutory tables in force on a date, as plain engine input plus their effective dates. */
export async function loadStatutoryTables(scope: Scope, asOf: string) {
  const [sss, philhealth, pagibig, tax] = await Promise.all([
    repo.findSssTableOn(scope, asOf),
    repo.findPhilhealthRuleOn(scope, asOf),
    repo.findPagibigRuleOn(scope, asOf),
    repo.findTaxBracketsOn(scope, asOf),
  ]);
  const tables: StatutoryTables = {
    sss: sss.rows.map((r) => ({
      minSalary: r.minSalary.toString(),
      maxSalary: s(r.maxSalary),
      msc: r.msc.toString(),
      eeShare: r.eeShare.toString(),
      erShare: r.erShare.toString(),
      ecShare: r.ecShare.toString(),
      wispEe: r.wispEe.toString(),
      wispEr: r.wispEr.toString(),
    })),
    philhealth: philhealth
      ? {
          rate: philhealth.rate.toString(),
          floorSalary: philhealth.floorSalary.toString(),
          ceilingSalary: philhealth.ceilingSalary.toString(),
        }
      : null,
    pagibig: pagibig
      ? {
          eeRate: pagibig.eeRate.toString(),
          erRate: pagibig.erRate.toString(),
          maxFundSalary: pagibig.maxFundSalary.toString(),
          lowIncomeThreshold: pagibig.lowIncomeThreshold.toString(),
          lowIncomeEeRate: pagibig.lowIncomeEeRate.toString(),
        }
      : null,
    tax: tax.rows.map((r) => ({
      frequency: r.frequency,
      lower: r.lower.toString(),
      upper: s(r.upper),
      baseTax: r.baseTax.toString(),
      rateOver: r.rateOver.toString(),
    })),
  };
  return {
    tables,
    effective: {
      sss: sss.effectiveFrom ? toIsoDate(sss.effectiveFrom) : null,
      philhealth: philhealth ? toIsoDate(philhealth.effectiveFrom) : null,
      pagibig: pagibig ? toIsoDate(pagibig.effectiveFrom) : null,
      tax: tax.effectiveFrom ? toIsoDate(tax.effectiveFrom) : null,
    },
  };
}

export async function listPayComponents(scope: Scope): Promise<PayComponentDef[]> {
  const rows = await repo.listPayComponents(scope);
  return rows.map((c) => ({
    code: c.code,
    name: c.name,
    kind: c.kind,
    taxable: c.taxable,
    order: c.order,
  }));
}

export type CalculatorResult = {
  employee: { id: string; employeeNo: string; name: string; position: string | null };
  paySetting: EnginePaySetting & { effectiveFrom: string };
  policy: EnginePolicy & { effectiveFrom: string };
  period: EngineInput["period"];
  summary: EngineInput["summary"];
  recurring: RecurringItemInput[];
  effective: Awaited<ReturnType<typeof loadStatutoryTables>>["effective"];
  computation: PayslipComputation;
};

/**
 * Run the engine for one employee and cutoff on live data: the Phase 2 attendance summary,
 * the pay setting and policy in force on the cutoff end, recurring items overlapping the
 * cutoff, and the statutory tables in force. Nothing is saved.
 */
export async function calculatePayslip(
  scope: Scope,
  companyId: string,
  employeeId: string,
  cutoff: Cutoff,
): Promise<CalculatorResult> {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const [company, employee, policy] = await Promise.all([
    getCompany(scope, companyId),
    getEmployee(scope, companyId, employeeId),
    getPolicyOn(scope, companyId, cutoff.end),
  ]);
  if (!company) throw new AppError("Company not found.");
  if (!employee) throw new AppError("Employee not found.");
  if (!policy)
    throw new AppError(
      "No payroll policy is in force for this cutoff. Set one in Company settings.",
    );
  const setting = paySettingOn(employee.paySettings, cutoff.end);
  if (!setting) throw new AppError("The employee has no pay setting.");

  const [summary, { tables, effective }, components] = await Promise.all([
    cutoffSummaryFor(scope, companyId, employeeId, cutoff),
    loadStatutoryTables(scope, cutoff.end),
    listPayComponents(scope),
  ]);

  const start = toDateOnly(cutoff.start).getTime();
  const end = toDateOnly(cutoff.end).getTime();
  const recurring: RecurringItemInput[] = employee.recurringItems
    .filter(
      (r) =>
        r.effectiveFrom.getTime() <= end &&
        (r.effectiveTo === null || r.effectiveTo.getTime() >= start),
    )
    .map((r) => ({
      componentCode: r.componentCode,
      kind: r.kind,
      label: r.label,
      amount: r.amount.toString(),
    }));

  const paySetting: CalculatorResult["paySetting"] = {
    effectiveFrom: toIsoDate(setting.effectiveFrom),
    payType: setting.payType,
    monthlyRate: s(setting.monthlyRate),
    dailyRate: s(setting.dailyRate),
    payFrequency: setting.payFrequency,
    isMinimumWageEarner: setting.isMinimumWageEarner,
    sssCovered: setting.sssCovered,
    philhealthCovered: setting.philhealthCovered,
    pagibigCovered: setting.pagibigCovered,
    taxWithheld: setting.taxWithheld,
  };
  const enginePolicy: CalculatorResult["policy"] = {
    effectiveFrom: toIsoDate(policy.effectiveFrom),
    workingDaysPerYear: policy.workingDaysPerYear,
    hoursPerDay: policy.hoursPerDay.toString(),
    otRegular: policy.otRegular.toString(),
    otRestDay: policy.otRestDay.toString(),
    otRestDayExcess: policy.otRestDayExcess.toString(),
    otRegularHoliday: policy.otRegularHoliday.toString(),
    otRegularHolidayExcess: policy.otRegularHolidayExcess.toString(),
    nightDiffRate: policy.nightDiffRate.toString(),
    statutoryTiming: policy.statutoryTiming,
  };
  const period: EngineInput["period"] = {
    start: cutoff.start,
    end: cutoff.end,
    frequency: company.payFrequency,
    sequenceInMonth: cutoff.sequenceInMonth,
  };

  const computation = computePayslip({
    paySetting,
    policy: enginePolicy,
    summary,
    period,
    tables,
    components,
    recurring,
    loans: [], // loans arrive with the Loan table in Phase 4
  });

  return {
    employee: {
      id: employee.id,
      employeeNo: employee.employeeNo,
      name: `${employee.lastName}, ${employee.firstName}`,
      position: employee.position,
    },
    paySetting,
    policy: enginePolicy,
    period,
    summary,
    recurring,
    effective,
    computation,
  };
}
