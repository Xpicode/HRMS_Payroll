import "server-only";
import { scoped, type Scope, type ScopedDb, type ScopedTx } from "@/lib/scope";
import type {
  EmployeeStatus,
  PayFrequency,
  PayType,
  RecurringItemKind,
  TaxStatus,
} from "@/generated/prisma/enums";

/**
 * Every query runs through `scoped(scope)`. Functions that take `db` accept either the
 * scoped root client or a scoped transaction so the service can group writes.
 */
export type Db = ScopedDb | ScopedTx;

export type EmployeeRow = {
  employeeNo: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  birthDate: Date | null;
  hireDate: Date;
  separationDate: Date | null;
  status: EmployeeStatus;
  position: string | null;
  department: string | null;
  email: string | null;
  mobile: string | null;
  address: string | null;
  sssNo: string | null;
  philhealthNo: string | null;
  pagibigMid: string | null;
  tin: string | null;
  taxStatus: TaxStatus;
};

export type PaySettingRow = {
  effectiveFrom: Date;
  payType: PayType;
  monthlyRate: string | null;
  dailyRate: string | null;
  payFrequency: PayFrequency;
  isMinimumWageEarner: boolean;
  sssCovered: boolean;
  philhealthCovered: boolean;
  pagibigCovered: boolean;
  taxWithheld: boolean;
  restDayOfWeek: number;
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  note: string | null;
};

export type RecurringItemRow = {
  componentCode: string;
  kind: RecurringItemKind;
  label: string;
  amount: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

/** Scoped root client for single reads outside a transaction. */
export function root(scope: Scope): ScopedDb {
  return scoped(scope);
}

export function transaction<T>(scope: Scope, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return scoped(scope).$transaction(fn);
}

// ---------------------------------------------------------------------------
// employees
// ---------------------------------------------------------------------------

/** List with the pay setting in force on `asOf` (one row) for the "current rate" column. */
export function listEmployees(scope: Scope, companyId: string, asOf: Date) {
  return scoped(scope).employee.findMany({
    where: { companyId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      paySettings: {
        where: { effectiveFrom: { lte: asOf } },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
  });
}

/**
 * Employees to pay for a period: hired by its end and either still active or separated on/after
 * its start. ON_LEAVE employees are excluded (leave pay arrives with Phase 6).
 */
export function listForPayroll(scope: Scope, companyId: string, start: Date, end: Date) {
  return scoped(scope).employee.findMany({
    where: {
      companyId,
      hireDate: { lte: end },
      OR: [{ status: "ACTIVE" }, { status: "SEPARATED", separationDate: { gte: start } }],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      paySettings: { orderBy: { effectiveFrom: "desc" } },
      recurringItems: { orderBy: { effectiveFrom: "desc" } },
    },
  });
}

export function getEmployee(scope: Scope, companyId: string, id: string) {
  return scoped(scope).employee.findFirst({
    where: { id, companyId },
    include: {
      paySettings: { orderBy: { effectiveFrom: "desc" } },
      recurringItems: { orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] },
    },
  });
}

export function findEmployeeNos(db: Db, companyId: string, employeeNos: string[]) {
  return db.employee.findMany({
    where: { companyId, employeeNo: { in: employeeNos } },
    select: { employeeNo: true },
  });
}

export async function listDepartments(scope: Scope, companyId: string): Promise<string[]> {
  const rows = await scoped(scope).employee.findMany({
    where: { companyId, department: { not: null } },
    distinct: ["department"],
    select: { department: true },
    orderBy: { department: "asc" },
  });
  return rows.map((r) => r.department!).filter(Boolean);
}

/** Employees who can take leave / receive credits: everyone not separated. */
export function listNotSeparated(scope: Scope, companyId: string) {
  return scoped(scope).employee.findMany({
    where: { companyId, status: { not: "SEPARATED" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, employeeNo: true, lastName: true, firstName: true, department: true },
  });
}

export function setSeparation(
  db: Db,
  companyId: string,
  id: string,
  data: { status: EmployeeStatus; separationDate: Date | null },
) {
  return db.employee.update({ where: { id, companyId }, data });
}

export function countByStatus(scope: Scope, companyId: string) {
  return scoped(scope).employee.groupBy({
    by: ["status"],
    where: { companyId },
    _count: { _all: true },
  });
}

export function formatEmployeeNo(prefix: string, n: number, pad: number): string {
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}

/** Atomically takes the next number from the company series. */
export async function allocateEmployeeNo(db: Db, companyId: string): Promise<string> {
  const c = await db.company.update({
    where: { id: companyId },
    data: { employeeNoNext: { increment: 1 } },
    select: { employeeNoPrefix: true, employeeNoNext: true, employeeNoPad: true },
  });
  return formatEmployeeNo(c.employeeNoPrefix, c.employeeNoNext - 1, c.employeeNoPad);
}

export function getEmployeeNoSeries(scope: Scope, companyId: string) {
  return scoped(scope).company.findFirst({
    where: { id: companyId },
    select: {
      employeeNoPrefix: true,
      employeeNoNext: true,
      employeeNoPad: true,
      payFrequency: true,
    },
  });
}

export function createEmployee(db: Db, companyId: string, data: EmployeeRow) {
  return db.employee.create({ data: { companyId, ...data } });
}

export function updateEmployee(db: Db, companyId: string, id: string, data: EmployeeRow) {
  return db.employee.update({ where: { id, companyId }, data });
}

// ---------------------------------------------------------------------------
// pay settings
// ---------------------------------------------------------------------------

export function findPaySettingOn(db: Db, employeeId: string, effectiveFrom: Date) {
  return db.employeePaySetting.findFirst({ where: { employeeId, effectiveFrom } });
}

export function createPaySetting(
  db: Db,
  companyId: string,
  employeeId: string,
  data: PaySettingRow,
) {
  return db.employeePaySetting.create({ data: { companyId, employeeId, ...data } });
}

// ---------------------------------------------------------------------------
// recurring items
// ---------------------------------------------------------------------------

export function getRecurringItem(scope: Scope, companyId: string, employeeId: string, id: string) {
  return scoped(scope).employeeRecurringItem.findFirst({ where: { id, companyId, employeeId } });
}

export function createRecurringItem(
  db: Db,
  companyId: string,
  employeeId: string,
  data: RecurringItemRow,
) {
  return db.employeeRecurringItem.create({ data: { companyId, employeeId, ...data } });
}

export function endRecurringItem(db: Db, companyId: string, id: string, effectiveTo: Date) {
  return db.employeeRecurringItem.update({ where: { id, companyId }, data: { effectiveTo } });
}

export function deleteRecurringItem(db: Db, companyId: string, id: string) {
  return db.employeeRecurringItem.delete({ where: { id, companyId } });
}
