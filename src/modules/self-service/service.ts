import "server-only";
import { AppError, ForbiddenError } from "@/lib/action-result";
import type { Cutoff } from "@/lib/dates";
import type { Scope } from "@/lib/scope";
import { getCompany } from "@/modules/companies/service";
import { getEmployee } from "@/modules/employees/service";
import { employeeDtr } from "@/modules/attendance/service";
import {
  cancelRequest,
  createRequest,
  employeeBalances,
  listLeaveTypes,
  listRequests,
} from "@/modules/leave/service";
import { getReleasedPayslipOf, listReleasedPayslipsOf } from "@/modules/payroll/service";
import { readOwnPayslipPdf } from "@/modules/documents/service";
import type { SelfLeaveRequestInput } from "./schema";

/**
 * Employee self-service (Phase 9). Every function here takes the caller's scope, refuses
 * anything but an EMPLOYEE login, and calls the staff services with the employee id from the
 * session — the form never says whose data is being read. The staff services accept the call
 * through their "permission OR self" checks, so payroll and leave rules stay in one place.
 */

export type Portal = Awaited<ReturnType<typeof portalContext>>;

/** The signed-in employee's own record and company. */
export async function portalContext(scope: Scope) {
  if (scope.role !== "EMPLOYEE" || !scope.employeeId) {
    throw new ForbiddenError("This area is for employee logins.");
  }
  const companyId = scope.companyIds?.[0];
  if (!companyId) throw new AppError("Your company is not available. Ask your administrator.");
  const [employee, company] = await Promise.all([
    getEmployee(scope, companyId, scope.employeeId),
    getCompany(scope, companyId),
  ]);
  if (!employee || !company) {
    throw new AppError("Your employee record is not available. Ask your administrator.");
  }
  return { companyId, employeeId: scope.employeeId, employee, company };
}

/** Released payslips, newest first. */
export async function myPayslips(scope: Scope) {
  const p = await portalContext(scope);
  return listReleasedPayslipsOf(scope, p.companyId, p.employeeId);
}

export async function myPayslip(scope: Scope, payslipId: string) {
  const p = await portalContext(scope);
  return getReleasedPayslipOf(scope, p.companyId, p.employeeId, payslipId);
}

export async function myPayslipPdf(scope: Scope, payslipId: string) {
  const p = await portalContext(scope);
  return readOwnPayslipPdf(scope, p.companyId, p.employeeId, payslipId);
}

/** The employee's own DTR for one cutoff (read-only in the portal). */
export async function myDtr(scope: Scope, cutoff: Cutoff) {
  const p = await portalContext(scope);
  return employeeDtr(scope, p.companyId, p.employeeId, cutoff);
}

export async function myLeave(scope: Scope, year: number) {
  const p = await portalContext(scope);
  const [balances, requests, leaveTypes] = await Promise.all([
    employeeBalances(scope, p.companyId, p.employeeId, year),
    listRequests(scope, p.companyId, { employeeId: p.employeeId, take: 200 }),
    listLeaveTypes(scope, p.companyId),
  ]);
  return { balances, requests, leaveTypes };
}

export async function fileLeave(scope: Scope, input: SelfLeaveRequestInput) {
  const p = await portalContext(scope);
  if (p.employee.status === "SEPARATED") throw new AppError("Your record is marked separated.");
  return createRequest(scope, p.companyId, { ...input, employeeId: p.employeeId });
}

/** Withdraw one of the employee's own pending requests. */
export async function withdrawLeave(scope: Scope, requestId: string) {
  const p = await portalContext(scope);
  return cancelRequest(scope, p.companyId, requestId);
}
