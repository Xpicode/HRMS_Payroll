import "server-only";
import { scoped, type Scope, type ScopedDb, type ScopedTx } from "@/lib/scope";
import { toDateOnly } from "@/lib/dates";
import type { DayType, DtrSource } from "@/generated/prisma/enums";

export type Db = ScopedDb | ScopedTx;

export function transaction<T>(scope: Scope, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return scoped(scope).$transaction(fn);
}

/** Employees to show for a cutoff: hired by the end, not separated before the start. */
export function listEmployeesForRange(scope: Scope, companyId: string, start: string, end: string) {
  return scoped(scope).employee.findMany({
    where: {
      companyId,
      status: { not: "SEPARATED" },
      hireDate: { lte: toDateOnly(end) },
      OR: [{ separationDate: null }, { separationDate: { gte: toDateOnly(start) } }],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { paySettings: { orderBy: { effectiveFrom: "desc" } } },
  });
}

export function getEmployeeWithPaySettings(scope: Scope, companyId: string, employeeId: string) {
  return scoped(scope).employee.findFirst({
    where: { id: employeeId, companyId },
    include: { paySettings: { orderBy: { effectiveFrom: "desc" } } },
  });
}

export function findEmployeesByNos(scope: Scope, companyId: string, employeeNos: string[]) {
  return scoped(scope).employee.findMany({
    where: { companyId, employeeNo: { in: employeeNos } },
    include: { paySettings: { orderBy: { effectiveFrom: "desc" } } },
  });
}

export function listRecordsInRange(
  db: Db,
  companyId: string,
  start: string,
  end: string,
  employeeId?: string,
) {
  return db.dailyTimeRecord.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      date: { gte: toDateOnly(start), lte: toDateOnly(end) },
    },
    orderBy: [{ employeeId: "asc" }, { date: "asc" }],
  });
}

/** Same as listRecordsInRange, for callers that hold a scope rather than a client. */
export function listRecords(
  scope: Scope,
  companyId: string,
  start: string,
  end: string,
  employeeId?: string,
) {
  return listRecordsInRange(scoped(scope), companyId, start, end, employeeId);
}

export type RecordRow = {
  date: Date;
  dayType: DayType;
  timeIn: string | null;
  timeOut: string | null;
  hoursWorked: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otHours: number;
  nightDiffHours: number;
  isAbsent: boolean;
  remarks: string | null;
  source: DtrSource;
};

/**
 * Upsert one employee's rows. `scoped()` refuses `upsert`, so existing rows are looked up
 * first and then updated or created individually (a cutoff is at most 31 rows).
 */
export async function saveRecords(
  tx: ScopedTx,
  companyId: string,
  employeeId: string,
  rows: RecordRow[],
) {
  if (rows.length === 0) return { created: 0, updated: 0 };
  const dates = rows.map((r) => r.date);
  const existing = await tx.dailyTimeRecord.findMany({
    where: { companyId, employeeId, date: { in: dates } },
    select: { id: true, date: true },
  });
  const byDate = new Map(existing.map((e) => [e.date.toISOString(), e.id]));
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const id = byDate.get(r.date.toISOString());
    if (id) {
      await tx.dailyTimeRecord.update({ where: { id, companyId }, data: r });
      updated++;
    } else {
      await tx.dailyTimeRecord.create({ data: { companyId, employeeId, ...r } });
      created++;
    }
  }
  return { created, updated };
}

/** Policy in force on a date (latest effective_from <= date). */
export function findPolicyOn(scope: Scope, companyId: string, date: string) {
  return scoped(scope).companyPayrollPolicy.findFirst({
    where: { companyId, effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
  });
}
