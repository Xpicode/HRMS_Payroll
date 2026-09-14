import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { PayComponentKind, PayFrequency } from "@/generated/prisma/enums";
import { AppError } from "@/lib/action-result";
import { scoped, type Scope, type ScopedDb, type ScopedTx } from "@/lib/scope";
import { toDateOnly } from "@/lib/dates";
import { isFrozen } from "./schema";

export type Db = ScopedDb | ScopedTx;

/** Scoped root client for reads outside a transaction. */
export function root(scope: Scope): ScopedDb {
  return scoped(scope);
}

export function transaction<T>(scope: Scope, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return scoped(scope).$transaction(fn, { timeout: 60_000 });
}

// ---------------------------------------------------------------------------
// Statutory tables and pay components are global (no company_id). They still go through
// `scoped()` so every query in the app shares one entry point; the scope hook passes
// non-tenant models through untouched.
// ---------------------------------------------------------------------------

/** The SSS schedule in force on a date: all brackets of the latest effective_from ≤ date. */
export async function findSssTableOn(scope: Scope, date: string) {
  const db = scoped(scope);
  const latest = await db.sssTable.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
    select: { effectiveFrom: true },
  });
  if (!latest) return { effectiveFrom: null, rows: [] };
  const rows = await db.sssTable.findMany({
    where: { effectiveFrom: latest.effectiveFrom },
    orderBy: { msc: "asc" },
  });
  return { effectiveFrom: latest.effectiveFrom, rows };
}

export function findPhilhealthRuleOn(scope: Scope, date: string) {
  return scoped(scope).philhealthRule.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function findPagibigRuleOn(scope: Scope, date: string) {
  return scoped(scope).pagibigRule.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
  });
}

/** Both frequency columns of the withholding table in force on a date. */
export async function findTaxBracketsOn(scope: Scope, date: string) {
  const db = scoped(scope);
  const latest = await db.taxBracket.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
    select: { effectiveFrom: true },
  });
  if (!latest) return { effectiveFrom: null, rows: [] };
  const rows = await db.taxBracket.findMany({
    where: { effectiveFrom: latest.effectiveFrom },
    orderBy: [{ frequency: "asc" }, { lower: "asc" }],
  });
  return { effectiveFrom: latest.effectiveFrom, rows };
}

export function listPayComponents(scope: Scope) {
  return scoped(scope).payComponent.findMany({ orderBy: { order: "asc" } });
}

// ---------------------------------------------------------------------------
// Pay periods, payslips, lines, adjustments (tenant models)
// ---------------------------------------------------------------------------

/** Thrown when a write would touch a payslip of an APPROVED / RELEASED / LOCKED period. */
export class ImmutablePayslipError extends AppError {
  constructor(message = "This payslip belongs to an approved period and cannot be changed.") {
    super(message);
    this.name = "ImmutablePayslipError";
  }
}

export function listPeriods(scope: Scope, companyId: string) {
  return scoped(scope).payPeriod.findMany({
    where: { companyId },
    orderBy: { coverageStart: "desc" },
    include: { _count: { select: { payslips: true } } },
  });
}

export function latestPeriod(db: Db, companyId: string) {
  return db.payPeriod.findFirst({ where: { companyId }, orderBy: { coverageStart: "desc" } });
}

export function getPeriod(db: Db, companyId: string, id: string) {
  return db.payPeriod.findFirst({
    where: { id, companyId },
    include: { approvedBy: { select: { id: true, name: true } } },
  });
}

export function findPeriodByStart(db: Db, companyId: string, coverageStart: string) {
  return db.payPeriod.findFirst({
    where: { companyId, coverageStart: toDateOnly(coverageStart) },
  });
}

export function createPeriod(
  db: Db,
  companyId: string,
  data: {
    coverageStart: string;
    coverageEnd: string;
    payDate: string;
    frequency: PayFrequency;
    sequenceInMonth: number;
  },
) {
  return db.payPeriod.create({
    data: {
      companyId,
      coverageStart: toDateOnly(data.coverageStart),
      coverageEnd: toDateOnly(data.coverageEnd),
      payDate: toDateOnly(data.payDate),
      frequency: data.frequency,
      sequenceInMonth: data.sequenceInMonth,
    },
  });
}

export function updatePeriod(
  db: Db,
  companyId: string,
  id: string,
  data: Prisma.PayPeriodUncheckedUpdateInput,
) {
  return db.payPeriod.update({ where: { id, companyId }, data });
}

export function deletePeriod(db: Db, companyId: string, id: string) {
  return db.payPeriod.delete({ where: { id, companyId } });
}

async function assertPeriodMutable(db: Db, companyId: string, payPeriodId: string) {
  const period = await db.payPeriod.findFirst({
    where: { id: payPeriodId, companyId },
    select: { status: true },
  });
  if (!period) throw new AppError("Pay period not found.");
  if (isFrozen(period.status)) throw new ImmutablePayslipError();
}

/** The immutability guard: every payslip/line write goes through this or assertPeriodMutable. */
export async function assertPayslipMutable(db: Db, companyId: string, payslipId: string) {
  const slip = await db.payslip.findFirst({
    where: { id: payslipId, companyId },
    select: { payPeriod: { select: { status: true } } },
  });
  if (!slip) throw new AppError("Payslip not found.");
  if (isFrozen(slip.payPeriod.status)) throw new ImmutablePayslipError();
}

export const payslipListSelect = {
  id: true,
  employeeId: true,
  slipCode: true,
  daysWorked: true,
  otHours: true,
  grossPay: true,
  totalDeductions: true,
  netPay: true,
  flags: true,
  computedAt: true,
  employee: {
    select: { id: true, employeeNo: true, lastName: true, firstName: true, department: true },
  },
} satisfies Prisma.PayslipSelect;

export function listPayslips(db: Db, companyId: string, payPeriodId: string) {
  return db.payslip.findMany({
    where: { companyId, payPeriodId },
    select: payslipListSelect,
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
  });
}

/** Approval reads every payslip with its employee row (snapshot source). */
export function listPayslipsForApproval(db: Db, companyId: string, payPeriodId: string) {
  return db.payslip.findMany({
    where: { companyId, payPeriodId },
    include: { employee: true },
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
  });
}

export function getPayslip(db: Db, companyId: string, id: string) {
  return db.payslip.findFirst({
    where: { id, companyId },
    include: {
      lines: { orderBy: { order: "asc" } },
      employee: {
        select: { id: true, employeeNo: true, lastName: true, firstName: true, position: true },
      },
      payPeriod: true,
      loanPayments: true,
    },
  });
}

export function findPayslipByEmployee(
  db: Db,
  companyId: string,
  payPeriodId: string,
  employeeId: string,
) {
  return db.payslip.findFirst({ where: { companyId, payPeriodId, employeeId } });
}

export type PayslipRow = {
  daysWorked: string;
  otHours: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  taxableIncome: string;
  flags: Prisma.InputJsonValue;
  computation: Prisma.InputJsonValue;
};

export type LineRow = {
  componentCode: string;
  label: string;
  kind: PayComponentKind;
  quantity: string | null;
  unit: string | null;
  rate: string | null;
  amount: string;
  taxable: boolean;
  isManual: boolean;
  note: string | null;
  order: number;
};

/**
 * Create or replace one employee's payslip and lines for a period. Refused (here and by the
 * database trigger) once the period is APPROVED.
 */
export async function upsertPayslip(
  tx: ScopedTx,
  companyId: string,
  payPeriodId: string,
  employeeId: string,
  data: PayslipRow,
  lines: LineRow[],
) {
  await assertPeriodMutable(tx, companyId, payPeriodId);
  const existing = await findPayslipByEmployee(tx, companyId, payPeriodId, employeeId);
  const row = { ...data, computedAt: new Date() };
  const slip = existing
    ? await tx.payslip.update({ where: { id: existing.id, companyId }, data: row })
    : await tx.payslip.create({ data: { companyId, payPeriodId, employeeId, ...row } });
  if (existing) await tx.payslipLine.deleteMany({ where: { payslipId: slip.id, companyId } });
  if (lines.length)
    await tx.payslipLine.createMany({
      data: lines.map((l) => ({ companyId, payslipId: slip.id, ...l })),
    });
  return slip;
}

/** Remove payslips of employees that dropped out of the period (recompute). */
export async function deletePayslipsExcept(
  tx: ScopedTx,
  companyId: string,
  payPeriodId: string,
  keepEmployeeIds: string[],
) {
  await assertPeriodMutable(tx, companyId, payPeriodId);
  return tx.payslip.deleteMany({
    where: { companyId, payPeriodId, employeeId: { notIn: keepEmployeeIds } },
  });
}

/** Approval writes: slip code + frozen snapshot. Only while the period is still COMPUTED. */
export async function freezePayslip(
  tx: ScopedTx,
  companyId: string,
  payslipId: string,
  data: { slipCode: string; snapshot: Prisma.InputJsonValue },
) {
  await assertPayslipMutable(tx, companyId, payslipId);
  return tx.payslip.update({ where: { id: payslipId, companyId }, data });
}

/** Revert clears the frozen snapshot (slip codes are kept and reused on re-approval). */
export async function unfreezePayslips(tx: ScopedTx, companyId: string, payPeriodId: string) {
  await assertPeriodMutable(tx, companyId, payPeriodId);
  return tx.payslip.updateMany({
    where: { companyId, payPeriodId },
    data: { snapshot: Prisma.DbNull },
  });
}

/** The only write allowed on a frozen payslip: where its PDF was rendered (Phase 5). */
export function setPayslipPdf(db: Db, companyId: string, payslipId: string, pdfPath: string) {
  return db.payslip.update({
    where: { id: payslipId, companyId },
    data: { pdfPath, generatedAt: new Date() },
  });
}

// adjustments ----------------------------------------------------------------

export function listAdjustments(
  db: Db,
  companyId: string,
  payPeriodId: string,
  employeeId?: string,
) {
  return db.payrollAdjustment.findMany({
    where: { companyId, payPeriodId, ...(employeeId ? { employeeId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { name: true } } },
  });
}

export async function createAdjustment(
  tx: ScopedTx,
  companyId: string,
  data: {
    payPeriodId: string;
    employeeId: string;
    componentCode: string;
    kind: PayComponentKind;
    label: string;
    amount: string;
    reason: string;
    createdById: string;
  },
) {
  await assertPeriodMutable(tx, companyId, data.payPeriodId);
  return tx.payrollAdjustment.create({ data: { companyId, ...data } });
}

export async function deleteAdjustment(tx: ScopedTx, companyId: string, id: string) {
  const adj = await tx.payrollAdjustment.findFirst({ where: { id, companyId } });
  if (!adj) throw new AppError("Adjustment not found.");
  await assertPeriodMutable(tx, companyId, adj.payPeriodId);
  await tx.payrollAdjustment.delete({ where: { id, companyId } });
  return adj;
}

/** Bumps the company's slip counter by `count` and returns the first number of the block. */
export async function allocateSlipCodes(tx: ScopedTx, companyId: string, count: number) {
  const company = await tx.company.findFirst({
    where: { id: companyId },
    select: { slipCodePrefix: true, slipCodeNext: true, slipCodePad: true },
  });
  if (!company) throw new AppError("Company not found.");
  if (count > 0)
    await tx.company.update({
      where: { id: companyId },
      data: { slipCodeNext: { increment: count } },
    });
  return {
    first: company.slipCodeNext,
    format: (n: number) =>
      `${company.slipCodePrefix}-${String(n).padStart(company.slipCodePad, "0")}`,
  };
}
