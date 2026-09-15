import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { LeaveRequestStatus } from "@/generated/prisma/enums";
import { scoped, type Scope, type ScopedDb, type ScopedTx } from "@/lib/scope";
import { toDateOnly } from "@/lib/dates";

export type Db = ScopedDb | ScopedTx;

export function root(scope: Scope): ScopedDb {
  return scoped(scope);
}

export function transaction<T>(scope: Scope, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return scoped(scope).$transaction(fn);
}

// ---------------------------------------------------------------------------
// leave types
// ---------------------------------------------------------------------------

export type LeaveTypeRow = {
  code: string;
  name: string;
  withPayDefault: boolean;
  annualCredits: string;
  maxCarryover: string;
  isActive: boolean;
};

export function listTypes(db: Db, companyId: string, includeInactive: boolean) {
  return db.leaveType.findMany({
    where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });
}

export function getType(db: Db, companyId: string, id: string) {
  return db.leaveType.findFirst({ where: { id, companyId } });
}

export function findTypeByCode(db: Db, companyId: string, code: string) {
  return db.leaveType.findFirst({ where: { companyId, code } });
}

export function createType(db: Db, companyId: string, data: LeaveTypeRow) {
  return db.leaveType.create({ data: { companyId, ...data } });
}

export function updateType(db: Db, companyId: string, id: string, data: LeaveTypeRow) {
  return db.leaveType.update({ where: { id, companyId }, data });
}

export function countTypes(db: Db, companyId: string) {
  return db.leaveType.count({ where: { companyId } });
}

// ---------------------------------------------------------------------------
// balances
// ---------------------------------------------------------------------------

export function listBalances(db: Db, companyId: string, employeeId: string, year: number) {
  return db.leaveBalance.findMany({
    where: { companyId, employeeId, year },
    include: { leaveType: true },
  });
}

export function getBalance(
  db: Db,
  companyId: string,
  employeeId: string,
  leaveTypeId: string,
  year: number,
) {
  return db.leaveBalance.findFirst({ where: { companyId, employeeId, leaveTypeId, year } });
}

export function createBalance(
  db: Db,
  companyId: string,
  data: { employeeId: string; leaveTypeId: string; year: number; credits: string; used: string },
) {
  return db.leaveBalance.create({ data: { companyId, ...data } });
}

export function updateBalance(
  db: Db,
  companyId: string,
  id: string,
  data: { credits?: string; used?: string },
) {
  return db.leaveBalance.update({ where: { id, companyId }, data });
}

/** All balances of a company for a year, keyed later by employee+type (rollover input). */
export function listBalancesForYear(db: Db, companyId: string, year: number) {
  return db.leaveBalance.findMany({ where: { companyId, year } });
}

// ---------------------------------------------------------------------------
// requests
// ---------------------------------------------------------------------------

export const requestInclude = {
  employee: { select: { id: true, employeeNo: true, lastName: true, firstName: true } },
  leaveType: { select: { id: true, code: true, name: true } },
  encodedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.LeaveRequestInclude;

export function listRequests(
  db: Db,
  companyId: string,
  filter: { status?: LeaveRequestStatus; employeeId?: string; take?: number },
) {
  return db.leaveRequest.findMany({
    where: {
      companyId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
    },
    include: requestInclude,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    ...(filter.take ? { take: filter.take } : {}),
  });
}

export function getRequest(db: Db, companyId: string, id: string) {
  return db.leaveRequest.findFirst({ where: { id, companyId }, include: requestInclude });
}

export function countPending(db: Db, companyId: string) {
  return db.leaveRequest.count({ where: { companyId, status: "PENDING" } });
}

/** Requests of the employee (pending or approved) that overlap a date range. */
export function listOverlapping(
  db: Db,
  companyId: string,
  employeeId: string,
  start: string,
  end: string,
  excludeId?: string,
) {
  return db.leaveRequest.findMany({
    where: {
      companyId,
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: toDateOnly(end) },
      endDate: { gte: toDateOnly(start) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
}

export function createRequest(
  db: Db,
  companyId: string,
  data: {
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    days: string;
    withPay: boolean;
    reason: string | null;
    encodedById: string | null;
  },
) {
  return db.leaveRequest.create({
    data: {
      companyId,
      ...data,
      startDate: toDateOnly(data.startDate),
      endDate: toDateOnly(data.endDate),
    },
    include: requestInclude,
  });
}

export function updateRequest(
  db: Db,
  companyId: string,
  id: string,
  data: Prisma.LeaveRequestUncheckedUpdateInput,
) {
  return db.leaveRequest.update({ where: { id, companyId }, data, include: requestInclude });
}
