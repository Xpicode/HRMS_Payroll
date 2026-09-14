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
