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
  /** 201 attachments (Phase 6). */
  "documents.view": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  "documents.manage": ["ADMIN", "PAYROLL_OFFICER", "ENCODER"],
  /** Separation is a dated, audited HR action; reinstating is admin-only. */
  "employees.separate": ["ADMIN", "PAYROLL_OFFICER"],
  "employees.reinstate": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleCan(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  PAYROLL_OFFICER: "Payroll Officer",
  ENCODER: "Encoder",
};
