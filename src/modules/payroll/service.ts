import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { PayComponentKind, PayPeriodStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import {
  cutoffFor,
  cutoffsInMonth,
  nextCutoff,
  toDateOnly,
  toIsoDate,
  todayInManila,
  type Cutoff,
} from "@/lib/dates";
import { assertCompanyAccess, isAdmin, type Scope, type ScopedTx } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { getCompany, getPolicyOn } from "@/modules/companies/service";
import { getEmployee, listEmployeesForPayroll } from "@/modules/employees/service";
import { cutoffOverview, paySettingOn } from "@/modules/attendance/service";
import {
  activeLoansForPeriod,
  postPayments,
  reversePayments,
  type PostedPayment,
} from "@/modules/loans/service";
import * as repo from "./repo";
import { isFrozen, type AdjustmentFormInput, type CreatePeriodInput } from "./schema";
import {
  computePayslip,
  type AdjustmentInput,
  type EngineInput,
  type EnginePaySetting,
  type EnginePolicy,
  type LoanInput,
  type PayComponentDef,
  type PayslipComputation,
  type PayslipFlag,
  type RecurringItemInput,
  type StatutoryTables,
} from "./engine";

export { ImmutablePayslipError } from "./repo";

const s = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());

// ---------------------------------------------------------------------------
// Statutory tables and components
// ---------------------------------------------------------------------------

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

export type StatutoryEffective = Awaited<ReturnType<typeof loadStatutoryTables>>["effective"];

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

// ---------------------------------------------------------------------------
// Engine input assembly (shared by the calculator and period compute)
// ---------------------------------------------------------------------------

type PaySettingRecord = {
  effectiveFrom: Date;
  payType: EnginePaySetting["payType"];
  monthlyRate: { toString(): string } | null;
  dailyRate: { toString(): string } | null;
  payFrequency: EnginePaySetting["payFrequency"];
  isMinimumWageEarner: boolean;
  sssCovered: boolean;
  philhealthCovered: boolean;
  pagibigCovered: boolean;
  taxWithheld: boolean;
};

type RecurringRecord = {
  componentCode: string;
  kind: PayComponentKind;
  label: string;
  amount: { toString(): string };
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type PolicyRecord = {
  id: string;
  effectiveFrom: Date;
  workingDaysPerYear: number;
  hoursPerDay: { toString(): string };
  otRegular: { toString(): string };
  otRestDay: { toString(): string };
  otRestDayExcess: { toString(): string };
  otRegularHoliday: { toString(): string };
  otRegularHolidayExcess: { toString(): string };
  nightDiffRate: { toString(): string };
  statutoryTiming: EnginePolicy["statutoryTiming"];
  officerCanApprove: boolean;
};

function toEnginePaySetting(
  setting: PaySettingRecord,
): EnginePaySetting & { effectiveFrom: string } {
  return {
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
}

function toEnginePolicy(
  policy: PolicyRecord,
): EnginePolicy & { id: string; effectiveFrom: string } {
  return {
    id: policy.id,
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
}

function recurringInPeriod(items: RecurringRecord[], cutoff: Cutoff): RecurringItemInput[] {
  const start = toDateOnly(cutoff.start).getTime();
  const end = toDateOnly(cutoff.end).getTime();
  return items
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
}

/** Everything a period computation needs that does not vary per employee. */
async function loadRunContext(scope: Scope, companyId: string, cutoff: Cutoff) {
  const [company, policy, { tables, effective }, components, overview] = await Promise.all([
    getCompany(scope, companyId),
    getPolicyOn(scope, companyId, cutoff.end),
    loadStatutoryTables(scope, cutoff.end),
    listPayComponents(scope),
    cutoffOverview(scope, companyId, cutoff),
  ]);
  if (!company) throw new AppError("Company not found.");
  if (!policy)
    throw new AppError(
      "No payroll policy is in force for this cutoff. Set one in Company settings.",
    );
  const period: EngineInput["period"] = {
    start: cutoff.start,
    end: cutoff.end,
    frequency: company.payFrequency,
    sequenceInMonth: cutoff.sequenceInMonth,
  };
  return {
    company,
    policy,
    enginePolicy: toEnginePolicy(policy),
    tables,
    effective,
    components,
    period,
    summaries: new Map(overview.rows.map((r) => [r.employeeId, r.summary])),
  };
}

// ---------------------------------------------------------------------------
// Calculator (no saving)
// ---------------------------------------------------------------------------

export type CalculatorResult = {
  employee: { id: string; employeeNo: string; name: string; position: string | null };
  paySetting: EnginePaySetting & { effectiveFrom: string };
  policy: EnginePolicy & { effectiveFrom: string };
  period: EngineInput["period"];
  summary: EngineInput["summary"];
  recurring: RecurringItemInput[];
  effective: StatutoryEffective;
  computation: PayslipComputation;
};

/**
 * Run the engine for one employee and cutoff on live data: the Phase 2 attendance summary,
 * the pay setting and policy in force on the cutoff end, recurring items overlapping the
 * cutoff, active loans and the statutory tables in force. Nothing is saved.
 */
export async function calculatePayslip(
  scope: Scope,
  companyId: string,
  employeeId: string,
  cutoff: Cutoff,
): Promise<CalculatorResult> {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const [ctx, employee, loansByEmployee] = await Promise.all([
    loadRunContext(scope, companyId, cutoff),
    getEmployee(scope, companyId, employeeId),
    activeLoansForPeriod(repo.root(scope), companyId, cutoff.end),
  ]);
  if (!employee) throw new AppError("Employee not found.");
  const setting = paySettingOn(employee.paySettings, cutoff.end);
  if (!setting) throw new AppError("The employee has no pay setting.");
  const summary = ctx.summaries.get(employeeId);
  if (!summary) throw new AppError("Employee not found in this cutoff.");

  const paySetting = toEnginePaySetting(setting);
  const recurring = recurringInPeriod(employee.recurringItems, cutoff);
  const computation = computePayslip({
    paySetting,
    policy: ctx.enginePolicy,
    summary,
    period: ctx.period,
    tables: ctx.tables,
    components: ctx.components,
    recurring,
    adjustments: [],
    loans: loansByEmployee.get(employeeId) ?? [],
  });

  return {
    employee: {
      id: employee.id,
      employeeNo: employee.employeeNo,
      name: `${employee.lastName}, ${employee.firstName}`,
      position: employee.position,
    },
    paySetting,
    policy: ctx.enginePolicy,
    period: ctx.period,
    summary,
    recurring,
    effective: ctx.effective,
    computation,
  };
}

// ---------------------------------------------------------------------------
// Pay periods
// ---------------------------------------------------------------------------

export async function listPeriods(scope: Scope, companyId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  return repo.listPeriods(scope, companyId);
}

export async function getPeriod(scope: Scope, companyId: string, periodId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  return repo.getPeriod(repo.root(scope), companyId, periodId);
}

function cutoffOfPeriod(p: {
  coverageStart: Date;
  coverageEnd: Date;
  sequenceInMonth: number;
}): Cutoff {
  return {
    start: toIsoDate(p.coverageStart),
    end: toIsoDate(p.coverageEnd),
    sequenceInMonth: p.sequenceInMonth === 2 ? 2 : 1,
  };
}

/** The cutoff that "Generate next period" would create: after the latest, or today's. */
export async function nextPeriodCutoff(scope: Scope, companyId: string): Promise<Cutoff> {
  assertCompanyAccess(scope, companyId);
  const company = await getCompany(scope, companyId);
  if (!company) throw new AppError("Company not found.");
  const latest = await repo.latestPeriod(repo.root(scope), companyId);
  return latest
    ? nextCutoff(company.payFrequency, cutoffOfPeriod(latest))
    : cutoffFor(company.payFrequency, todayInManila());
}

/** Create a pay period for a cutoff (the next one, or the month/half chosen on the form). */
export async function createPeriod(
  scope: Scope,
  companyId: string,
  input: CreatePeriodInput | null,
) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const company = await getCompany(scope, companyId);
  if (!company) throw new AppError("Company not found.");
  let cutoff: Cutoff;
  if (input) {
    const [y, m] = input.month.split("-").map(Number) as [number, number];
    const list = cutoffsInMonth(company.payFrequency, y, m);
    cutoff = (input.half === "2" && list[1]) || list[0]!;
  } else {
    cutoff = await nextPeriodCutoff(scope, companyId);
  }
  const payDate = input?.payDate ?? cutoff.end;
  if (payDate < cutoff.start) throw new AppError("Pay date cannot be before the coverage start.");
  return repo.transaction(scope, async (tx) => {
    if (await repo.findPeriodByStart(tx, companyId, cutoff.start))
      throw new AppError(`A pay period starting ${cutoff.start} already exists.`);
    const period = await repo.createPeriod(tx, companyId, {
      coverageStart: cutoff.start,
      coverageEnd: cutoff.end,
      payDate,
      frequency: company.payFrequency,
      sequenceInMonth: cutoff.sequenceInMonth,
    });
    await audit("PayPeriod", period.id, "CREATE", null, period, { scope, companyId, tx });
    return period;
  });
}

export async function updatePayDate(
  scope: Scope,
  companyId: string,
  periodId: string,
  payDate: string,
) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  await repo.transaction(scope, async (tx) => {
    const before = await repo.getPeriod(tx, companyId, periodId);
    if (!before) throw new AppError("Pay period not found.");
    if (isFrozen(before.status))
      throw new AppError("The pay date is frozen once the period is approved.");
    if (payDate < toIsoDate(before.coverageStart))
      throw new AppError("Pay date cannot be before the coverage start.");
    const after = await repo.updatePeriod(tx, companyId, periodId, {
      payDate: toDateOnly(payDate),
    });
    await audit("PayPeriod", periodId, "UPDATE", before, after, { scope, companyId, tx });
  });
}

/** A DRAFT period with nothing computed can be discarded. */
export async function deletePeriod(scope: Scope, companyId: string, periodId: string) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  await repo.transaction(scope, async (tx) => {
    const before = await repo.getPeriod(tx, companyId, periodId);
    if (!before) throw new AppError("Pay period not found.");
    if (before.status !== "DRAFT" && before.status !== "COMPUTED")
      throw new AppError("Only draft or computed periods can be deleted.");
    await repo.deletePeriod(tx, companyId, periodId);
    await audit("PayPeriod", periodId, "DELETE", before, null, { scope, companyId, tx });
  });
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------

/** What the payslip row stores as `computation`: the engine's input and output, both plain data. */
export type StoredComputation = {
  input: Omit<EngineInput, "tables" | "components"> & {
    paySetting: EnginePaySetting & { effectiveFrom: string };
    policy: EnginePolicy & { id: string; effectiveFrom: string };
    statutory: StatutoryEffective;
  };
  output: PayslipComputation;
};

type EmployeeForPayroll = Awaited<ReturnType<typeof listEmployeesForPayroll>>[number];

function computeOne(
  ctx: Awaited<ReturnType<typeof loadRunContext>>,
  cutoff: Cutoff,
  employee: EmployeeForPayroll,
  loans: LoanInput[],
  adjustments: AdjustmentInput[],
): StoredComputation | null {
  const setting = paySettingOn(employee.paySettings, cutoff.end);
  const summary = ctx.summaries.get(employee.id);
  if (!setting || !summary) return null;
  const paySetting = toEnginePaySetting(setting);
  const recurring = recurringInPeriod(employee.recurringItems, cutoff);
  const input: StoredComputation["input"] = {
    paySetting,
    policy: ctx.enginePolicy,
    statutory: ctx.effective,
    summary,
    period: ctx.period,
    recurring,
    adjustments,
    loans,
  };
  const output = computePayslip({
    ...input,
    tables: ctx.tables,
    components: ctx.components,
  });
  return { input, output };
}

function payslipRows(c: StoredComputation): { row: repo.PayslipRow; lines: repo.LineRow[] } {
  const o = c.output;
  return {
    row: {
      daysWorked: String(c.input.summary.daysWorked),
      otHours: String(c.input.summary.otHours),
      grossPay: o.gross,
      totalDeductions: o.totalDeductions,
      netPay: o.net,
      taxableIncome: o.taxableIncome,
      flags: o.flags as unknown as Prisma.InputJsonValue,
      computation: c as unknown as Prisma.InputJsonValue,
    },
    lines: o.lines.map((l, i) => ({
      componentCode: l.componentCode,
      label: l.label,
      kind: l.kind,
      quantity: l.quantity,
      unit: l.unit,
      rate: l.rate,
      amount: l.amount,
      taxable: l.taxable,
      isManual: l.isManual,
      note: l.note,
      order: i,
    })),
  };
}

async function adjustmentsByEmployee(tx: ScopedTx, companyId: string, periodId: string) {
  const rows = await repo.listAdjustments(tx, companyId, periodId);
  const out = new Map<string, AdjustmentInput[]>();
  for (const a of rows) {
    const list = out.get(a.employeeId) ?? [];
    list.push({
      componentCode: a.componentCode,
      kind: a.kind,
      label: a.label,
      amount: a.amount.toString(),
      reason: a.reason,
    });
    out.set(a.employeeId, list);
  }
  return out;
}

/**
 * Run the engine for every employee to pay in the period and store the payslips.
 * Allowed while the period is below APPROVED; manual adjustments are re-merged each time.
 * With `onlyEmployeeId` only that employee is recomputed (after an adjustment).
 */
export async function computePeriod(
  scope: Scope,
  companyId: string,
  periodId: string,
  onlyEmployeeId?: string,
) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const period = await repo.getPeriod(repo.root(scope), companyId, periodId);
  if (!period) throw new AppError("Pay period not found.");
  if (isFrozen(period.status))
    throw new AppError("This period is approved. Revert it (admin) before recomputing.");
  const cutoff = cutoffOfPeriod(period);
  const [ctx, employees] = await Promise.all([
    loadRunContext(scope, companyId, cutoff),
    listEmployeesForPayroll(scope, companyId, cutoff.start, cutoff.end),
  ]);
  const targets = onlyEmployeeId ? employees.filter((e) => e.id === onlyEmployeeId) : employees;
  if (onlyEmployeeId && targets.length === 0)
    throw new AppError("Employee is not part of this period.");

  return repo.transaction(scope, async (tx) => {
    const [loansByEmployee, adjustments] = await Promise.all([
      activeLoansForPeriod(tx, companyId, cutoff.end),
      adjustmentsByEmployee(tx, companyId, periodId),
    ]);
    let computed = 0;
    let skipped = 0;
    let flagged = 0;
    for (const e of targets) {
      const c = computeOne(
        ctx,
        cutoff,
        e,
        loansByEmployee.get(e.id) ?? [],
        adjustments.get(e.id) ?? [],
      );
      if (!c) {
        skipped++;
        continue;
      }
      const { row, lines } = payslipRows(c);
      await repo.upsertPayslip(tx, companyId, periodId, e.id, row, lines);
      computed++;
      if (c.output.flags.length) flagged++;
    }
    if (!onlyEmployeeId)
      await repo.deletePayslipsExcept(
        tx,
        companyId,
        periodId,
        employees.map((e) => e.id),
      );
    const after = await repo.updatePeriod(tx, companyId, periodId, {
      status: "COMPUTED",
      computedAt: new Date(),
    });
    await audit(
      "PayPeriod",
      periodId,
      "UPDATE",
      { status: period.status },
      { status: after.status, computed, skipped, flagged, onlyEmployeeId: onlyEmployeeId ?? null },
      { scope, companyId, tx },
    );
    return { computed, skipped, flagged };
  });
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export async function listPayslips(scope: Scope, companyId: string, periodId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const rows = await repo.listPayslips(repo.root(scope), companyId, periodId);
  return rows.map((r) => ({ ...r, flags: r.flags as unknown as PayslipFlag[] }));
}

export async function getPayslip(scope: Scope, companyId: string, payslipId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const slip = await repo.getPayslip(repo.root(scope), companyId, payslipId);
  if (!slip) return null;
  return {
    ...slip,
    flags: slip.flags as unknown as PayslipFlag[],
    computation: slip.computation as unknown as StoredComputation,
    snapshot: slip.snapshot as unknown as PayslipSnapshot | null,
  };
}

/** Payslips with lines, employee and period rows — the documents module builds print data from these. */
export async function listPayslipsForDocuments(scope: Scope, companyId: string, periodId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const rows = await repo.listPayslipsWithLines(repo.root(scope), companyId, periodId);
  return rows.map((r) => ({
    ...r,
    computation: r.computation as unknown as StoredComputation,
    snapshot: r.snapshot as unknown as PayslipSnapshot | null,
  }));
}

export async function getPayslipForDocuments(scope: Scope, companyId: string, payslipId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const r = await repo.getPayslipWithLines(repo.root(scope), companyId, payslipId);
  if (!r) return null;
  return {
    ...r,
    computation: r.computation as unknown as StoredComputation,
    snapshot: r.snapshot as unknown as PayslipSnapshot | null,
  };
}

export async function countPayslips(scope: Scope, companyId: string, periodId: string) {
  assertCompanyAccess(scope, companyId);
  return repo.countPayslips(repo.root(scope), companyId, periodId);
}

/** Record where a payslip's PDF was written — the only write allowed on a frozen payslip. */
export async function markPayslipPdf(
  scope: Scope,
  companyId: string,
  payslipId: string,
  pdfPath: string,
) {
  assertCompanyAccess(scope, companyId);
  await repo.setPayslipPdf(repo.root(scope), companyId, payslipId, pdfPath);
}

export async function listAdjustments(
  scope: Scope,
  companyId: string,
  periodId: string,
  employeeId: string,
) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  return repo.listAdjustments(repo.root(scope), companyId, periodId, employeeId);
}

/** Add a manual line for one employee and recompute that employee only. */
export async function addAdjustment(
  scope: Scope,
  companyId: string,
  periodId: string,
  employeeId: string,
  input: AdjustmentFormInput,
) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const components = await listPayComponents(scope);
  const component = components.find((c) => c.code === input.componentCode);
  if (!component) throw new AppError("Unknown pay component.", { componentCode: ["Unknown"] });
  if (component.kind !== input.kind)
    throw new AppError(
      `${component.name} is a${component.kind === "EARNING" ? "n earning" : " deduction"} component.`,
      {
        componentCode: ["Kind does not match the component"],
      },
    );
  await repo.transaction(scope, async (tx) => {
    const adj = await repo.createAdjustment(tx, companyId, {
      payPeriodId: periodId,
      employeeId,
      componentCode: input.componentCode,
      kind: input.kind,
      label: input.label,
      amount: input.amount,
      reason: input.reason,
      createdById: scope.userId,
    });
    await audit("PayrollAdjustment", adj.id, "CREATE", null, adj, { scope, companyId, tx });
  });
  await computePeriod(scope, companyId, periodId, employeeId);
}

export async function removeAdjustment(scope: Scope, companyId: string, adjustmentId: string) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const adj = await repo.transaction(scope, async (tx) => {
    const removed = await repo.deleteAdjustment(tx, companyId, adjustmentId);
    await audit("PayrollAdjustment", adjustmentId, "DELETE", removed, null, {
      scope,
      companyId,
      tx,
    });
    return removed;
  });
  await computePeriod(scope, companyId, adj.payPeriodId, adj.employeeId);
}

// ---------------------------------------------------------------------------
// Approve / release / lock / revert
// ---------------------------------------------------------------------------

/** Frozen at approval: everything a PDF or report needs, independent of live rows. */
export type PayslipSnapshot = {
  version: 1;
  slipCode: string;
  approvedAt: string;
  approvedById: string;
  company: {
    id: string;
    code: string;
    legalName: string;
    tradeName: string | null;
    address: string;
    tin: string | null;
    logoPath: string | null;
    signatoryName: string;
    signatoryTitle: string;
  };
  employee: {
    id: string;
    employeeNo: string;
    lastName: string;
    firstName: string;
    middleName: string | null;
    suffix: string | null;
    position: string | null;
    department: string | null;
    sssNo: string | null;
    philhealthNo: string | null;
    pagibigMid: string | null;
    tin: string | null;
    taxStatus: string;
  };
  period: EngineInput["period"] & { payDate: string; id: string };
  computation: StoredComputation;
  loanPayments: PostedPayment[];
};

async function requireApprover(scope: Scope, companyId: string, coverageEnd: string) {
  assertPermission(scope, "payroll.approve");
  if (isAdmin(scope)) return;
  const policy = await getPolicyOn(scope, companyId, coverageEnd);
  if (!policy?.officerCanApprove)
    throw new AppError(
      "Only an administrator may approve, release or lock periods for this company.",
    );
}

/**
 * Approve: assign slip codes to payslips that have none, freeze a snapshot on each, post the
 * loan payments and decrement balances, then move the period to APPROVED. All in one
 * transaction; the payslip writes happen while the period is still COMPUTED, so the
 * immutability trigger admits them.
 */
export async function approvePeriod(scope: Scope, companyId: string, periodId: string) {
  assertCompanyAccess(scope, companyId);
  const period = await repo.getPeriod(repo.root(scope), companyId, periodId);
  if (!period) throw new AppError("Pay period not found.");
  await requireApprover(scope, companyId, toIsoDate(period.coverageEnd));
  if (period.status !== "COMPUTED")
    throw new AppError(
      period.status === "DRAFT"
        ? "Compute the period before approving it."
        : "The period is already approved.",
    );
  const company = await getCompany(scope, companyId);
  if (!company) throw new AppError("Company not found.");

  return repo.transaction(scope, async (tx) => {
    const slips = await repo.listPayslipsForApproval(tx, companyId, periodId);
    if (slips.length === 0) throw new AppError("There are no payslips to approve.");
    const unnumbered = slips.filter((p) => !p.slipCode);
    const codes = await repo.allocateSlipCodes(tx, companyId, unnumbered.length);
    let next = codes.first;
    const approvedAt = new Date();
    let paymentsPosted = 0;
    for (const slip of slips) {
      const computation = slip.computation as unknown as StoredComputation;
      const slipCode = slip.slipCode ?? codes.format(next++);
      const loanPayments = await postPayments(
        tx,
        scope,
        companyId,
        periodId,
        slip.id,
        computation.output.loanPayments.map((p) => ({ loanId: p.loanId, amount: p.amount })),
      );
      paymentsPosted += loanPayments.length;
      const e = slip.employee;
      const snapshot: PayslipSnapshot = {
        version: 1,
        slipCode,
        approvedAt: approvedAt.toISOString(),
        approvedById: scope.userId,
        company: {
          id: company.id,
          code: company.code,
          legalName: company.legalName,
          tradeName: company.tradeName,
          address: company.address,
          tin: company.tin,
          logoPath: company.logoPath,
          signatoryName: company.signatoryName,
          signatoryTitle: company.signatoryTitle,
        },
        employee: {
          id: e.id,
          employeeNo: e.employeeNo,
          lastName: e.lastName,
          firstName: e.firstName,
          middleName: e.middleName,
          suffix: e.suffix,
          position: e.position,
          department: e.department,
          sssNo: e.sssNo,
          philhealthNo: e.philhealthNo,
          pagibigMid: e.pagibigMid,
          tin: e.tin,
          taxStatus: e.taxStatus,
        },
        period: { ...computation.input.period, payDate: toIsoDate(period.payDate), id: periodId },
        computation,
        loanPayments,
      };
      await repo.freezePayslip(tx, companyId, slip.id, {
        slipCode,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      });
    }
    const after = await repo.updatePeriod(tx, companyId, periodId, {
      status: "APPROVED",
      approvedById: scope.userId,
      approvedAt,
    });
    await audit(
      "PayPeriod",
      periodId,
      "UPDATE",
      { status: period.status },
      {
        status: after.status,
        payslips: slips.length,
        slipCodesAssigned: unnumbered.length,
        paymentsPosted,
      },
      { scope, companyId, tx },
    );
    return { payslips: slips.length, paymentsPosted };
  });
}

async function transition(
  scope: Scope,
  companyId: string,
  periodId: string,
  from: PayPeriodStatus,
  to: PayPeriodStatus,
  data: Prisma.PayPeriodUncheckedUpdateInput,
  guard?: (period: NonNullable<Awaited<ReturnType<typeof repo.getPeriod>>>) => void,
) {
  assertCompanyAccess(scope, companyId);
  const period = await repo.getPeriod(repo.root(scope), companyId, periodId);
  if (!period) throw new AppError("Pay period not found.");
  await requireApprover(scope, companyId, toIsoDate(period.coverageEnd));
  if (period.status !== from)
    throw new AppError(`Only ${from.toLowerCase()} periods can be ${to.toLowerCase()}.`);
  guard?.(period);
  await repo.transaction(scope, async (tx) => {
    const after = await repo.updatePeriod(tx, companyId, periodId, { status: to, ...data });
    await audit(
      "PayPeriod",
      periodId,
      "UPDATE",
      { status: period.status },
      { status: after.status },
      { scope, companyId, tx },
    );
  });
}

/** Release once the pay date has arrived. */
export function releasePeriod(scope: Scope, companyId: string, periodId: string) {
  return transition(
    scope,
    companyId,
    periodId,
    "APPROVED",
    "RELEASED",
    { releasedAt: new Date() },
    (p) => {
      if (toIsoDate(p.payDate) > todayInManila())
        throw new AppError(`The pay date is ${toIsoDate(p.payDate)}; release on or after it.`);
    },
  );
}

export function lockPeriod(scope: Scope, companyId: string, periodId: string) {
  return transition(scope, companyId, periodId, "RELEASED", "LOCKED", { lockedAt: new Date() });
}

/**
 * ADMIN only, audited: back to COMPUTED so the period can be corrected and re-approved.
 * Reverses the loan payments (balances restored) and clears the frozen snapshots; slip codes
 * stay with their payslips and are reused when the period is approved again.
 */
export async function revertPeriod(
  scope: Scope,
  companyId: string,
  periodId: string,
  reason: string,
) {
  assertPermission(scope, "payroll.revert");
  assertCompanyAccess(scope, companyId);
  const period = await repo.getPeriod(repo.root(scope), companyId, periodId);
  if (!period) throw new AppError("Pay period not found.");
  if (!isFrozen(period.status)) throw new AppError("The period is not approved.");
  if (period.status === "LOCKED") throw new AppError("A locked period cannot be reverted.");
  if (reason.trim().length < 3) throw new AppError("Give a reason for the audit trail.");
  await repo.transaction(scope, async (tx) => {
    // status first: the database trigger admits payslip writes only for non-frozen periods
    await repo.updatePeriod(tx, companyId, periodId, {
      status: "COMPUTED",
      approvedById: null,
      approvedAt: null,
      releasedAt: null,
    });
    const reversed = await reversePayments(tx, scope, companyId, periodId);
    await repo.unfreezePayslips(tx, companyId, periodId);
    await audit(
      "PayPeriod",
      periodId,
      "UPDATE",
      { status: period.status, approvedById: period.approvedById, approvedAt: period.approvedAt },
      { status: "COMPUTED", reason, loanPaymentsReversed: reversed },
      { scope, companyId, tx },
    );
  });
}

/** Whether the current user may approve/release/lock in this company (for buttons). */
export async function canApprove(scope: Scope, companyId: string, coverageEnd: string) {
  try {
    await requireApprover(scope, companyId, coverageEnd);
    return true;
  } catch {
    return false;
  }
}
