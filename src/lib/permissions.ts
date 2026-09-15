import type { Role } from "@/generated/prisma/enums";

/**
 * Role matrix for Phase 0. Keep this the single place that answers
 * "may role X do action Y". Company membership is checked separately by scope.ts.
 */
export const PERMISSIONS = {
  "users.manage": ["ADMIN"],
  "companies.create": ["ADMIN"],
  "companies.update": ["ADMIN"],
  "companies.list_all": ["ADMIN"],
  "policy.update": ["ADMIN"],
  "holidays.manage_company": ["ADMIN", "PAYROLL_OFFICER"],
  "holidays.manage_national": ["ADMIN"],
  "audit.view": ["ADMIN"],
  "employees.view": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "employees.manage": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "employees.import": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "attendance.view": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "attendance.manage": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "attendance.import": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "payroll.view": ["ADMIN", "PAYROLL_OFFICER"],
  "payroll.compute": ["ADMIN", "PAYROLL_OFFICER"],
  /** Also subject to the policy flag officerCanApprove for PAYROLL_OFFICER. */
  "payroll.approve": ["ADMIN", "PAYROLL_OFFICER"],
  "payroll.revert": ["ADMIN"],
  "loans.view": ["ADMIN", "PAYROLL_OFFICER"],
  "loans.manage": ["ADMIN", "PAYROLL_OFFICER"],
  /** Leave (Phase 6): anyone may view and encode requests; deciding and credits are HR/payroll. */
  "leave.view": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "leave.request": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "leave.approve": ["ADMIN", "PAYROLL_OFFICER"],
  "leave.manage_types": ["ADMIN", "PAYROLL_OFFICER"],
  "leave.adjust_credits": ["ADMIN", "PAYROLL_OFFICER"],
  /** Government reports and year-end (Phase 7). */
  "reports.view": ["ADMIN", "PAYROLL_OFFICER"],
  /** 201 attachments (Phase 6). */
  "documents.view": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "documents.manage": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  /** Separation is a dated, audited HR action; reinstating is admin-only. */
  "employees.separate": ["ADMIN", "PAYROLL_OFFICER"],
  "employees.reinstate": ["ADMIN"],
  /** Self-service logins (Phase 9): create, reset or disable an employee's portal access. */
  "employees.portal_access": ["ADMIN", "PAYROLL_OFFICER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleCan(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Roles an administrator may hand out on the Users screen. EMPLOYEE logins come from the employee record. */
export const STAFF_ROLES = [
  "ADMIN",
  "PAYROLL_OFFICER",
  "ENCODER",
] as const satisfies readonly Role[];

type ActorLike = { role: Role; employeeId?: string | null };

/**
 * Self-service (Phase 9): an EMPLOYEE login has no staff permission at all, but may act on
 * its own employee record where a page or service allows "staff permission OR self".
 */
export function canActOnEmployee(
  actor: ActorLike,
  permission: Permission,
  employeeId: string,
): boolean {
  if (roleCan(actor.role, permission)) return true;
  return (
    actor.role === "EMPLOYEE" &&
    typeof actor.employeeId === "string" &&
    actor.employeeId === employeeId
  );
}

/** Company-level reads any linked employee may do inside their own company (e.g. leave types). */
export function canActAsEmployee(actor: ActorLike, permission: Permission): boolean {
  if (roleCan(actor.role, permission)) return true;
  return actor.role === "EMPLOYEE" && typeof actor.employeeId === "string";
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  PAYROLL_OFFICER: "Payroll Officer",
  ENCODER: "Encoder",
  EMPLOYEE: "Employee",
};
