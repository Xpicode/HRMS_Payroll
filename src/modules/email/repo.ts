import "server-only";
import type { EmailStatus } from "@/generated/prisma/enums";
import { scoped, type Scope, type ScopedDb, type ScopedTx } from "@/lib/scope";

export type Db = ScopedDb | ScopedTx;

export function root(scope: Scope): ScopedDb {
  return scoped(scope);
}

export function transaction<T>(scope: Scope, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return scoped(scope).$transaction(fn);
}

export const messageInclude = {
  payslip: {
    select: {
      id: true,
      slipCode: true,
      employee: { select: { id: true, employeeNo: true, lastName: true, firstName: true } },
    },
  },
} as const;

export function listForPeriod(db: Db, companyId: string, payPeriodId: string) {
  return db.emailMessage.findMany({
    where: { companyId, payPeriodId },
    include: messageInclude,
    orderBy: [{ payslip: { employee: { lastName: "asc" } } }, { createdAt: "desc" }],
  });
}

export function listQueued(db: Db, companyId: string, payPeriodId: string) {
  return db.emailMessage.findMany({
    where: { companyId, payPeriodId, status: "QUEUED" },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
  });
}

export function createMessage(
  db: Db,
  companyId: string,
  data: {
    payPeriodId: string;
    payslipId: string;
    toAddress: string;
    subject: string;
    status: EmailStatus;
    error?: string | null;
  },
) {
  return db.emailMessage.create({ data: { companyId, ...data } });
}

export function updateMessage(
  db: Db,
  companyId: string,
  id: string,
  data: {
    status?: EmailStatus;
    error?: string | null;
    providerId?: string | null;
    sentAt?: Date | null;
    attempts?: { increment: number };
  },
) {
  return db.emailMessage.update({ where: { id, companyId }, data });
}

/** Drop QUEUED / FAILED / SKIPPED rows of a period so a resend starts clean (SENT rows stay). */
export function clearUnsent(db: Db, companyId: string, payPeriodId: string) {
  return db.emailMessage.deleteMany({
    where: { companyId, payPeriodId, status: { in: ["QUEUED", "FAILED", "SKIPPED"] } },
  });
}

export function countByStatus(db: Db, companyId: string, payPeriodId: string) {
  return db.emailMessage.groupBy({
    by: ["status"],
    where: { companyId, payPeriodId },
    _count: { _all: true },
  });
}
