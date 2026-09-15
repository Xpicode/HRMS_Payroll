import "server-only";
import type { LeaveRequestStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { toIsoDate, todayInManila } from "@/lib/dates";
import { Decimal, round2 } from "@/lib/money";
import { assertCompanyAccess, type Scope, type ScopedTx } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import {
  leaveCalendar,
  removeLeaveRecords,
  writeLeaveRecords,
  type LeaveCalendarDay,
} from "@/modules/attendance/service";
import { listEmployeesForLeave } from "@/modules/employees/service";
import { hasFrozenPeriodOverlapping } from "@/modules/payroll/service";
import * as jobs from "@/modules/documents/jobs/service";
import * as repo from "./repo";
import {
  STANDARD_LEAVE_TYPES,
  type CreditAdjustmentInput,
  type LeaveRequestInput,
  type LeaveTypeInput,
} from "./schema";

const d2 = (v: { toString(): string } | string | number) => round2(new Decimal(v.toString()));
const fmtDays = (v: Decimal) => (v.isInteger() ? v.toFixed(0) : v.toFixed(2));

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

export async function listLeaveTypes(scope: Scope, companyId: string, includeInactive = false) {
  assertPermission(scope, "leave.view");
  assertCompanyAccess(scope, companyId);
  return repo.listTypes(repo.root(scope), companyId, includeInactive);
}

function typeRow(input: LeaveTypeInput): repo.LeaveTypeRow {
  return {
    code: input.code,
    name: input.name,
    withPayDefault: input.withPayDefault,
    annualCredits: d2(input.annualCredits).toFixed(2),
    maxCarryover: d2(input.maxCarryover).toFixed(2),
    isActive: input.isActive,
  };
}

export async function createLeaveType(scope: Scope, companyId: string, input: LeaveTypeInput) {
  assertPermission(scope, "leave.manage_types");
  assertCompanyAccess(scope, companyId);
  return repo.transaction(scope, async (tx) => {
    if (await repo.findTypeByCode(tx, companyId, input.code))
      throw new AppError("That code is already used.", { code: ["Already in use"] });
    const row = await repo.createType(tx, companyId, typeRow(input));
    await audit("LeaveType", row.id, "CREATE", null, row, { scope, companyId, tx });
    return row;
  });
}

export async function updateLeaveType(
  scope: Scope,
  companyId: string,
  id: string,
  input: LeaveTypeInput,
) {
  assertPermission(scope, "leave.manage_types");
  assertCompanyAccess(scope, companyId);
  return repo.transaction(scope, async (tx) => {
    const before = await repo.getType(tx, companyId, id);
    if (!before) throw new AppError("Leave type not found.");
    const clash = await repo.findTypeByCode(tx, companyId, input.code);
    if (clash && clash.id !== id)
      throw new AppError("That code is already used.", { code: ["Already in use"] });
    const after = await repo.updateType(tx, companyId, id, typeRow(input));
    await audit("LeaveType", id, "UPDATE", before, after, { scope, companyId, tx });
    return after;
  });
}

/** Creates VL / SL / LWOP for a company that has no leave types yet. */
export async function addStandardLeaveTypes(scope: Scope, companyId: string) {
  assertPermission(scope, "leave.manage_types");
  assertCompanyAccess(scope, companyId);
  return repo.transaction(scope, async (tx) => {
    if ((await repo.countTypes(tx, companyId)) > 0)
      throw new AppError("This company already has leave types.");
    let created = 0;
    for (const t of STANDARD_LEAVE_TYPES) {
      const row = await repo.createType(tx, companyId, typeRow(t));
      await audit("LeaveType", row.id, "CREATE", null, row, { scope, companyId, tx });
      created++;
    }
    return created;
  });
}

// ---------------------------------------------------------------------------
// Balances and credits
// ---------------------------------------------------------------------------

export type BalanceView = {
  leaveType: { id: string; code: string; name: string; withPayDefault: boolean };
  year: number;
  /** null until credits are allocated (rollover job or first use). */
  balanceId: string | null;
  credits: string;
  used: string;
  remaining: string;
  annualCredits: string;
};

/** Every active type with the employee's balance for the year (defaults shown when none yet). */
export async function employeeBalances(
  scope: Scope,
  companyId: string,
  employeeId: string,
  year: number,
): Promise<BalanceView[]> {
  assertPermission(scope, "leave.view");
  assertCompanyAccess(scope, companyId);
  const db = repo.root(scope);
  const [types, balances] = await Promise.all([
    repo.listTypes(db, companyId, false),
    repo.listBalances(db, companyId, employeeId, year),
  ]);
  const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));
  return types.map((t) => {
    const b = byType.get(t.id);
    const credits = b ? d2(b.credits) : new Decimal(0);
    const used = b ? d2(b.used) : new Decimal(0);
    return {
      leaveType: { id: t.id, code: t.code, name: t.name, withPayDefault: t.withPayDefault },
      year,
      balanceId: b?.id ?? null,
      credits: fmtDays(credits),
      used: fmtDays(used),
      remaining: fmtDays(credits.minus(used)),
      annualCredits: fmtDays(d2(t.annualCredits)),
    };
  });
}

/** The balance row for employee/type/year, created with the type's annual credits when missing. */
async function ensureBalance(
  tx: ScopedTx,
  scope: Scope,
  companyId: string,
  employeeId: string,
  leaveType: { id: string; annualCredits: { toString(): string } },
  year: number,
) {
  const existing = await repo.getBalance(tx, companyId, employeeId, leaveType.id, year);
  if (existing) return existing;
  const created = await repo.createBalance(tx, companyId, {
    employeeId,
    leaveTypeId: leaveType.id,
    year,
    credits: d2(leaveType.annualCredits).toFixed(2),
    used: "0.00",
  });
  await audit(
    "LeaveBalance",
    created.id,
    "CREATE",
    null,
    { ...created, source: "auto" },
    { scope, companyId, tx },
  );
  return created;
}

/** Manual credit change (signed), audited with the reason. */
export async function adjustCredits(
  scope: Scope,
  companyId: string,
  employeeId: string,
  input: CreditAdjustmentInput,
) {
  assertPermission(scope, "leave.adjust_credits");
  assertCompanyAccess(scope, companyId);
  return repo.transaction(scope, async (tx) => {
    const type = await repo.getType(tx, companyId, input.leaveTypeId);
    if (!type) throw new AppError("Leave type not found.");
    const employee = await tx.employee.findFirst({ where: { id: employeeId, companyId } });
    if (!employee) throw new AppError("Employee not found.");
    const before = await ensureBalance(tx, scope, companyId, employeeId, type, input.year);
    const credits = d2(before.credits).plus(d2(input.delta));
    if (credits.lt(0))
      throw new AppError("Credits cannot go below zero.", { delta: ["Too large a deduction"] });
    const after = await repo.updateBalance(tx, companyId, before.id, {
      credits: credits.toFixed(2),
    });
    await audit(
      "LeaveBalance",
      before.id,
      "UPDATE",
      { credits: before.credits, used: before.used },
      { credits: after.credits, used: after.used, delta: input.delta, reason: input.reason },
      { scope, companyId, tx },
    );
    return after;
  });
}

/**
 * Queue the yearly rollover: every active employee gets `year` credits for each active type
 * (annual credits + unused credits of the previous year up to the type's carry-over cap).
 * Existing balances for the year are never touched, so the job is safe to run twice.
 */
export async function enqueueRollover(scope: Scope, companyId: string, year: number) {
  assertPermission(scope, "leave.adjust_credits");
  assertCompanyAccess(scope, companyId);
  const types = await repo.listTypes(repo.root(scope), companyId, false);
  if (types.length === 0) throw new AppError("Add leave types before rolling over credits.");
  const employees = await listEmployeesForLeave(scope, companyId);
  return jobs.enqueue(scope, companyId, "LEAVE_CREDIT_ROLLOVER", { year }, employees.length);
}

export function latestRolloverJob(scope: Scope, companyId: string, year: number) {
  return jobs.latestForPayload(scope, companyId, "LEAVE_CREDIT_ROLLOVER", { year });
}

/** Job handler (system scope). */
export const rolloverJob: jobs.JobHandler = async (job, progress) => {
  const year = job.payload.year;
  if (typeof year !== "number") throw new Error("payload.year missing");
  const scope = jobs.SYSTEM_SCOPE;
  const companyId = job.companyId;
  const db = repo.root(scope);
  const [types, employees, previous, current] = await Promise.all([
    repo.listTypes(db, companyId, false),
    listEmployeesForLeave(scope, companyId),
    repo.listBalancesForYear(db, companyId, year - 1),
    repo.listBalancesForYear(db, companyId, year),
  ]);
  const key = (employeeId: string, typeId: string) => `${employeeId}|${typeId}`;
  const prevBy = new Map(previous.map((b) => [key(b.employeeId, b.leaveTypeId), b]));
  const have = new Set(current.map((b) => key(b.employeeId, b.leaveTypeId)));
  let done = 0;
  let created = 0;
  for (const e of employees) {
    await repo.transaction(scope, async (tx) => {
      for (const t of types) {
        if (have.has(key(e.id, t.id))) continue;
        const prev = prevBy.get(key(e.id, t.id));
        const unused = prev
          ? Decimal.max(d2(prev.credits).minus(d2(prev.used)), 0)
          : new Decimal(0);
        const carry = Decimal.min(unused, d2(t.maxCarryover));
        const credits = d2(t.annualCredits).plus(carry);
        const row = await repo.createBalance(tx, companyId, {
          employeeId: e.id,
          leaveTypeId: t.id,
          year,
          credits: credits.toFixed(2),
          used: "0.00",
        });
        await audit(
          "LeaveBalance",
          row.id,
          "CREATE",
          null,
          { ...row, source: "rollover", carriedOver: carry.toFixed(2), jobId: job.id },
          { actorId: job.createdById, companyId, tx },
        );
        created++;
      }
    });
    done++;
    await progress(done, employees.length);
  }
  console.log(`[jobs] leave rollover ${companyId} ${year}: ${created} balance(s) created`);
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type RequestView = Awaited<ReturnType<typeof repo.listRequests>>[number];

export async function listRequests(
  scope: Scope,
  companyId: string,
  filter: { status?: LeaveRequestStatus; employeeId?: string; take?: number } = {},
) {
  assertPermission(scope, "leave.view");
  assertCompanyAccess(scope, companyId);
  return repo.listRequests(repo.root(scope), companyId, filter);
}

export async function countPendingRequests(scope: Scope, companyId: string) {
  assertCompanyAccess(scope, companyId);
  return repo.countPending(repo.root(scope), companyId);
}

/**
 * The working days a request covers: scheduled days in the range (rest days and holidays are
 * skipped). Days that already hold worked attendance or another leave are conflicts.
 */
export type LeavePlan = {
  days: LeaveCalendarDay[];
  count: number;
  conflicts: string[];
};

async function planFor(
  scope: Scope,
  companyId: string,
  employeeId: string,
  start: string,
  end: string,
): Promise<LeavePlan> {
  const calendar = await leaveCalendar(scope, companyId, employeeId, start, end);
  const days: LeaveCalendarDay[] = [];
  const conflicts: string[] = [];
  for (const day of calendar) {
    if (!day.scheduled) continue;
    if (day.onLeave) conflicts.push(`${day.date}: already on leave`);
    else if (day.worked) conflicts.push(`${day.date}: attendance already recorded`);
    else days.push(day);
  }
  return { days, count: days.length, conflicts };
}

export async function createRequest(scope: Scope, companyId: string, input: LeaveRequestInput) {
  assertPermission(scope, "leave.request");
  assertCompanyAccess(scope, companyId);
  const db = repo.root(scope);
  const [type, employee] = await Promise.all([
    repo.getType(db, companyId, input.leaveTypeId),
    db.employee.findFirst({ where: { id: input.employeeId, companyId } }),
  ]);
  if (!type || !type.isActive) throw new AppError("Leave type not found.");
  if (!employee) throw new AppError("Employee not found.");
  if (employee.status === "SEPARATED") throw new AppError("The employee is separated.");
  const overlaps = await repo.listOverlapping(
    db,
    companyId,
    input.employeeId,
    input.startDate,
    input.endDate,
  );
  if (overlaps.length)
    throw new AppError("The employee already has a leave request covering those dates.", {
      startDate: ["Overlaps an existing request"],
    });
  const plan = await planFor(scope, companyId, input.employeeId, input.startDate, input.endDate);
  if (plan.conflicts.length)
    throw new AppError(`Some days cannot be taken as leave: ${plan.conflicts.join("; ")}.`);
  if (plan.count === 0)
    throw new AppError("There are no scheduled working days in that range.", {
      endDate: ["Only rest days or holidays"],
    });
  return repo.transaction(scope, async (tx) => {
    const row = await repo.createRequest(tx, companyId, {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      days: String(plan.count),
      withPay: input.withPay,
      reason: input.reason,
      encodedById: scope.userId || null,
    });
    await audit("LeaveRequest", row.id, "CREATE", null, row, { scope, companyId, tx });
    return row;
  });
}

/**
 * Approve: re-plan the days (attendance may have changed since encoding), refuse dates inside
 * an approved pay period, take credits for leave with pay, and write one DTR row per working
 * day (LEAVE_WITH_PAY / LEAVE_WITHOUT_PAY, source LEAVE) — all in one transaction.
 */
export async function approveRequest(
  scope: Scope,
  companyId: string,
  id: string,
  note: string | null,
) {
  assertPermission(scope, "leave.approve");
  assertCompanyAccess(scope, companyId);
  const request = await repo.getRequest(repo.root(scope), companyId, id);
  if (!request) throw new AppError("Leave request not found.");
  if (request.status !== "PENDING") throw new AppError("Only pending requests can be approved.");
  const start = toIsoDate(request.startDate);
  const end = toIsoDate(request.endDate);
  if (await hasFrozenPeriodOverlapping(scope, companyId, start, end))
    throw new AppError(
      "The dates fall in an approved pay period. Attendance for it is closed; an administrator must revert the period first.",
    );
  const plan = await planFor(scope, companyId, request.employeeId, start, end);
  if (plan.conflicts.length)
    throw new AppError(`Some days cannot be taken as leave: ${plan.conflicts.join("; ")}.`);
  if (plan.count === 0)
    throw new AppError("There are no scheduled working days left in the range.");

  return repo.transaction(scope, async (tx) => {
    const type = await repo.getType(tx, companyId, request.leaveTypeId);
    if (!type) throw new AppError("Leave type not found.");
    const days = new Decimal(plan.count);
    if (request.withPay) {
      const year = Number(start.slice(0, 4));
      const balance = await ensureBalance(tx, scope, companyId, request.employeeId, type, year);
      const remaining = d2(balance.credits).minus(d2(balance.used));
      if (remaining.lt(days))
        throw new AppError(
          `Not enough ${type.code} credits for ${year}: ${fmtDays(remaining)} left, ${fmtDays(days)} needed. Adjust the credits or approve it as leave without pay.`,
        );
      const after = await repo.updateBalance(tx, companyId, balance.id, {
        used: d2(balance.used).plus(days).toFixed(2),
      });
      await audit(
        "LeaveBalance",
        balance.id,
        "UPDATE",
        { credits: balance.credits, used: balance.used },
        { credits: after.credits, used: after.used, leaveRequestId: id },
        { scope, companyId, tx },
      );
    }
    await writeLeaveRecords(
      tx,
      companyId,
      request.employeeId,
      plan.days.map((day) => ({
        date: day.date,
        dayType: request.withPay ? "LEAVE_WITH_PAY" : "LEAVE_WITHOUT_PAY",
        remarks: `${type.name}${request.reason ? ` — ${request.reason}` : ""}`.slice(0, 200),
      })),
    );
    const after = await repo.updateRequest(tx, companyId, id, {
      status: "APPROVED",
      days: days.toFixed(2),
      decidedById: scope.userId || null,
      decidedAt: new Date(),
      decisionNote: note,
    });
    await audit(
      "LeaveRequest",
      id,
      "UPDATE",
      { status: request.status },
      { status: after.status, days: plan.count, dates: plan.days.map((x) => x.date), note },
      { scope, companyId, tx },
    );
    return after;
  });
}

export async function rejectRequest(
  scope: Scope,
  companyId: string,
  id: string,
  note: string | null,
) {
  assertPermission(scope, "leave.approve");
  assertCompanyAccess(scope, companyId);
  return repo.transaction(scope, async (tx) => {
    const request = await repo.getRequest(tx, companyId, id);
    if (!request) throw new AppError("Leave request not found.");
    if (request.status !== "PENDING") throw new AppError("Only pending requests can be rejected.");
    const after = await repo.updateRequest(tx, companyId, id, {
      status: "REJECTED",
      decidedById: scope.userId || null,
      decidedAt: new Date(),
      decisionNote: note,
    });
    await audit(
      "LeaveRequest",
      id,
      "UPDATE",
      { status: request.status },
      { status: after.status, note },
      { scope, companyId, tx },
    );
    return after;
  });
}

/**
 * Cancel a pending request (anyone who may encode) or an approved one (approvers): the leave
 * rows are removed and used credits given back, unless the dates are already in an approved
 * pay period.
 */
export async function cancelRequest(scope: Scope, companyId: string, id: string) {
  assertPermission(scope, "leave.request");
  assertCompanyAccess(scope, companyId);
  const request = await repo.getRequest(repo.root(scope), companyId, id);
  if (!request) throw new AppError("Leave request not found.");
  if (request.status === "APPROVED") {
    assertPermission(scope, "leave.approve");
    const start = toIsoDate(request.startDate);
    const end = toIsoDate(request.endDate);
    if (await hasFrozenPeriodOverlapping(scope, companyId, start, end))
      throw new AppError("The dates fall in an approved pay period; the leave cannot be undone.");
  } else if (request.status !== "PENDING") {
    throw new AppError("This request is already closed.");
  }
  return repo.transaction(scope, async (tx) => {
    let removed = 0;
    if (request.status === "APPROVED") {
      removed = await removeLeaveRecords(
        tx,
        companyId,
        request.employeeId,
        toIsoDate(request.startDate),
        toIsoDate(request.endDate),
      );
      if (request.withPay) {
        const year = Number(toIsoDate(request.startDate).slice(0, 4));
        const balance = await repo.getBalance(
          tx,
          companyId,
          request.employeeId,
          request.leaveTypeId,
          year,
        );
        if (balance) {
          const used = Decimal.max(d2(balance.used).minus(d2(request.days)), 0);
          const after = await repo.updateBalance(tx, companyId, balance.id, {
            used: used.toFixed(2),
          });
          await audit(
            "LeaveBalance",
            balance.id,
            "UPDATE",
            { credits: balance.credits, used: balance.used },
            { credits: after.credits, used: after.used, cancelledRequestId: id },
            { scope, companyId, tx },
          );
        }
      }
    }
    const after = await repo.updateRequest(tx, companyId, id, {
      status: "CANCELLED",
      decidedById: scope.userId || null,
      decidedAt: new Date(),
    });
    await audit(
      "LeaveRequest",
      id,
      "UPDATE",
      { status: request.status },
      { status: after.status, leaveRowsRemoved: removed },
      { scope, companyId, tx },
    );
    return after;
  });
}

/** Default year for the balance views: the current Manila year. */
export function currentYear(): number {
  return Number(todayInManila().slice(0, 4));
}
