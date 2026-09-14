import "server-only";
import { scoped, type Scope, type ScopedDb, type ScopedTx } from "@/lib/scope";
import { toDateOnly } from "@/lib/dates";
import type { LoanStatus, LoanType } from "@/generated/prisma/enums";

export type Db = ScopedDb | ScopedTx;

export type LoanRow = {
  employeeId: string;
  type: LoanType;
  label: string;
  principal: string;
  amortization: string;
  startDate: string;
  balance: string;
  note: string | null;
};

export function listByEmployee(scope: Scope, companyId: string, employeeId: string) {
  return scoped(scope).loan.findMany({
    where: { companyId, employeeId },
    orderBy: [{ status: "asc" }, { startDate: "desc" }, { createdAt: "desc" }],
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
}

export function listByCompany(scope: Scope, companyId: string, status?: LoanStatus) {
  return scoped(scope).loan.findMany({
    where: { companyId, ...(status ? { status } : {}) },
    orderBy: [{ startDate: "desc" }],
    include: {
      employee: { select: { id: true, employeeNo: true, lastName: true, firstName: true } },
    },
  });
}

export function getLoan(db: Db, companyId: string, id: string) {
  return db.loan.findFirst({ where: { id, companyId } });
}

/** Loans that should be deducted in a period ending on `coverageEnd`. */
export function listActiveForPeriod(db: Db, companyId: string, coverageEnd: string) {
  return db.loan.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      balance: { gt: 0 },
      startDate: { lte: toDateOnly(coverageEnd) },
    },
    orderBy: { createdAt: "asc" },
  });
}

export function createLoan(db: Db, companyId: string, data: LoanRow) {
  return db.loan.create({
    data: { companyId, ...data, startDate: toDateOnly(data.startDate) },
  });
}

export function updateLoan(
  db: Db,
  companyId: string,
  id: string,
  data: Partial<{ status: LoanStatus; balance: string; note: string | null }>,
) {
  return db.loan.update({ where: { id, companyId }, data });
}

export function createPayment(
  tx: ScopedTx,
  companyId: string,
  data: {
    loanId: string;
    payslipId: string;
    payPeriodId: string;
    amount: string;
    balanceAfter: string;
  },
) {
  return tx.loanPayment.create({ data: { companyId, ...data } });
}

export function listPaymentsForPeriod(db: Db, companyId: string, payPeriodId: string) {
  return db.loanPayment.findMany({ where: { companyId, payPeriodId } });
}

export function deletePaymentsForPeriod(tx: ScopedTx, companyId: string, payPeriodId: string) {
  return tx.loanPayment.deleteMany({ where: { companyId, payPeriodId } });
}

export function transaction<T>(scope: Scope, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return scoped(scope).$transaction(fn);
}
