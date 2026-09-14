import "server-only";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { toIsoDate } from "@/lib/dates";
import { Decimal, money, round2 } from "@/lib/money";
import { assertCompanyAccess, type Scope, type ScopedTx } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import type { LoanInput as EngineLoanInput } from "@/modules/payroll/engine";
import * as repo from "./repo";
import { LOAN_TYPE_LABELS, type LoanInput } from "./schema";

export async function listLoans(scope: Scope, companyId: string, employeeId: string) {
  assertPermission(scope, "loans.view");
  assertCompanyAccess(scope, companyId);
  return repo.listByEmployee(scope, companyId, employeeId);
}

export async function listCompanyLoans(scope: Scope, companyId: string) {
  assertPermission(scope, "loans.view");
  assertCompanyAccess(scope, companyId);
  return repo.listByCompany(scope, companyId);
}

export async function createLoan(
  scope: Scope,
  companyId: string,
  employeeId: string,
  input: LoanInput,
) {
  assertPermission(scope, "loans.manage");
  assertCompanyAccess(scope, companyId);
  const balance = input.balance ?? input.principal;
  const row = await repo.transaction(scope, async (tx) => {
    const employee = await tx.employee.findFirst({ where: { id: employeeId, companyId } });
    if (!employee) throw new AppError("Employee not found.");
    const loan = await repo.createLoan(tx, companyId, {
      employeeId,
      type: input.type,
      label: input.label ?? LOAN_TYPE_LABELS[input.type],
      principal: round2(input.principal).toFixed(2),
      amortization: round2(input.amortization).toFixed(2),
      startDate: input.startDate,
      balance: round2(balance).toFixed(2),
      note: input.note,
    });
    await audit("Loan", loan.id, "CREATE", null, loan, { scope, companyId, tx });
    return loan;
  });
  return row;
}

/** A cancelled loan is no longer deducted; its history stays. */
export async function cancelLoan(scope: Scope, companyId: string, employeeId: string, id: string) {
  assertPermission(scope, "loans.manage");
  assertCompanyAccess(scope, companyId);
  await repo.transaction(scope, async (tx) => {
    const before = await repo.getLoan(tx, companyId, id);
    if (!before || before.employeeId !== employeeId) throw new AppError("Loan not found.");
    if (before.status !== "ACTIVE") throw new AppError("Only active loans can be cancelled.");
    const after = await repo.updateLoan(tx, companyId, id, { status: "CANCELLED" });
    await audit("Loan", id, "UPDATE", before, after, { scope, companyId, tx });
  });
}

// ---------------------------------------------------------------------------
// Used by the payroll module (through this service only)
// ---------------------------------------------------------------------------

/** Engine input for every employee with an active loan in the period, keyed by employee id. */
export async function activeLoansForPeriod(
  db: ScopedTx | Parameters<typeof repo.listActiveForPeriod>[0],
  companyId: string,
  coverageEnd: string,
): Promise<Map<string, EngineLoanInput[]>> {
  const rows = await repo.listActiveForPeriod(db, companyId, coverageEnd);
  const out = new Map<string, EngineLoanInput[]>();
  for (const l of rows) {
    const list = out.get(l.employeeId) ?? [];
    list.push({
      id: l.id,
      type: l.type,
      label: l.label,
      amortization: l.amortization.toString(),
      balance: l.balance.toString(),
    });
    out.set(l.employeeId, list);
  }
  return out;
}

export type PostedPayment = { loanId: string; amount: string; balanceAfter: string };

/**
 * On approval: record one LoanPayment per engine loan payment and decrement the balance,
 * re-checking the live balance so a loan can never go negative even if it changed since compute.
 */
export async function postPayments(
  tx: ScopedTx,
  scope: Scope,
  companyId: string,
  payPeriodId: string,
  payslipId: string,
  payments: { loanId: string; amount: string }[],
): Promise<PostedPayment[]> {
  const posted: PostedPayment[] = [];
  for (const p of payments) {
    const loan = await repo.getLoan(tx, companyId, p.loanId);
    if (!loan || loan.status !== "ACTIVE") continue;
    const amount = Decimal.min(money(p.amount), money(loan.balance));
    if (amount.lte(0)) continue;
    const balanceAfter = round2(money(loan.balance).minus(amount));
    await repo.createPayment(tx, companyId, {
      loanId: loan.id,
      payslipId,
      payPeriodId,
      amount: amount.toFixed(2),
      balanceAfter: balanceAfter.toFixed(2),
    });
    const after = await repo.updateLoan(tx, companyId, loan.id, {
      balance: balanceAfter.toFixed(2),
      status: balanceAfter.lte(0) ? "PAID" : "ACTIVE",
    });
    await audit("Loan", loan.id, "UPDATE", loan, after, { scope, companyId, tx });
    posted.push({
      loanId: loan.id,
      amount: amount.toFixed(2),
      balanceAfter: balanceAfter.toFixed(2),
    });
  }
  return posted;
}

/** On revert: delete the period's payments and add the amounts back. */
export async function reversePayments(
  tx: ScopedTx,
  scope: Scope,
  companyId: string,
  payPeriodId: string,
): Promise<number> {
  const payments = await repo.listPaymentsForPeriod(tx, companyId, payPeriodId);
  for (const p of payments) {
    const loan = await repo.getLoan(tx, companyId, p.loanId);
    if (!loan) continue;
    const balance = round2(money(loan.balance).plus(p.amount));
    const after = await repo.updateLoan(tx, companyId, loan.id, {
      balance: balance.toFixed(2),
      status: loan.status === "PAID" ? "ACTIVE" : loan.status,
    });
    await audit("Loan", loan.id, "UPDATE", loan, after, { scope, companyId, tx });
  }
  await repo.deletePaymentsForPeriod(tx, companyId, payPeriodId);
  return payments.length;
}

export function describeLoan(l: { type: string; label: string; startDate: Date }) {
  return `${l.label} (${LOAN_TYPE_LABELS[l.type as keyof typeof LOAN_TYPE_LABELS] ?? l.type}) from ${toIsoDate(l.startDate)}`;
}
