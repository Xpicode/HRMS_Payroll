import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientIp, isUuid } from "@/lib/request";
import type { Scope } from "@/lib/scope";
import { canActAsEmployee, canActOnEmployee, roleCan, type Permission } from "@/lib/permissions";
import { homePathFor, isEmployeeRole } from "@/lib/routes";
import { ForbiddenError } from "@/lib/action-result";
import { sessionExpired } from "@/lib/session-age";
import type { Role } from "@/generated/prisma/enums";

export type CompanySummary = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  logoPath: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  /** EMPLOYEE logins: the employee record this user is; null for staff. */
  employeeId: string | null;
  /** Companies this user may open. ADMIN = every active company; EMPLOYEE = their own. */
  companies: CompanySummary[];
};

const companySelect = {
  id: true,
  code: true,
  legalName: true,
  tradeName: true,
  logoPath: true,
} as const;

/**
 * Loads the current user from the database once per request (React `cache`).
 * Returns null when there is no session, the session is older than the absolute lifetime,
 * the user is disabled, or the session pre-dates the user's last password change
 * (server-side revocation of JWT sessions).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !isUuid(id)) return null;
  if (sessionExpired(session.issuedAt)) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      companies: { include: { company: { select: { ...companySelect, isActive: true } } } },
    },
  });
  if (!user || !user.isActive) return null;

  const issuedMs = (session.issuedAt ?? 0) * 1000;
  if (user.passwordChangedAt.getTime() > issuedMs + 2000) return null;

  const companies: CompanySummary[] =
    user.role === "ADMIN"
      ? await prisma.company.findMany({
          where: { isActive: true },
          orderBy: { code: "asc" },
          select: companySelect,
        })
      : user.companies
          .filter((uc) => uc.company.isActive)
          .map((uc) => {
            const { isActive: _ignored, ...c } = uc.company;
            return c;
          })
          .sort((a, b) => a.code.localeCompare(b.code));

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    employeeId: user.employeeId,
    companies,
  };
});

/** For pages/layouts: redirect to login when there is no valid user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?expired=1");
  return user;
}

/** For pages: 404 (not 403) so protected resources are not enumerable. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roleCan(user.role, permission)) notFound();
  return user;
}

/** For /app layouts: staff only. An employee login is sent to its own portal instead. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (isEmployeeRole(user.role)) redirect(homePathFor(user.role));
  return user;
}

/** For /me layouts: an EMPLOYEE login. Staff are sent back to /app. */
export async function requireEmployee(): Promise<CurrentUser & { employeeId: string }> {
  const user = await requireUser();
  if (!isEmployeeRole(user.role)) redirect(homePathFor(user.role));
  if (!user.employeeId) notFound();
  return { ...user, employeeId: user.employeeId };
}

/** For pages under /app/[companyId]: validates the id and the user's membership. */
export async function requireCompany(
  companyId: string,
): Promise<{ user: CurrentUser; company: CompanySummary }> {
  const user = await requireUser();
  if (!isUuid(companyId)) notFound();
  const company = user.companies.find((c) => c.id === companyId);
  if (!company) notFound();
  return { user, company };
}

async function scopeFor(user: CurrentUser): Promise<Scope> {
  const h = await headers();
  return {
    userId: user.id,
    role: user.role,
    companyIds: user.role === "ADMIN" ? null : user.companies.map((c) => c.id),
    ip: clientIp(h),
    employeeId: user.employeeId,
  };
}

/**
 * The scope object passed to services and repos. Built from the session, never from input.
 * A user who still has to change a temporary password gets no scope: the proxy already
 * redirects their page loads, and this stops server actions posted directly.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await requireUser();
  if (user.mustChangePassword) {
    throw new ForbiddenError("Change your temporary password before continuing.");
  }
  return scopeFor(user);
});

/** Scope for the account screens only (changing one's own password): no must-change gate. */
export const getAccountScope = cache(async (): Promise<Scope> => scopeFor(await requireUser()));

/** For services: throws (actions turn it into a friendly error). */
export function assertPermission(scope: Scope, permission: Permission): void {
  if (!roleCan(scope.role, permission)) {
    throw new ForbiddenError("You do not have permission to do that.");
  }
}

/** Staff permission, or an EMPLOYEE login acting on its own record (self-service). */
export function assertPermissionOrSelf(
  scope: Scope,
  permission: Permission,
  employeeId: string,
): void {
  if (!canActOnEmployee(scope, permission, employeeId)) {
    throw new ForbiddenError("You do not have permission to do that.");
  }
}

/** Staff permission, or any EMPLOYEE login (company-level reads such as leave types). */
export function assertPermissionOrEmployee(scope: Scope, permission: Permission): void {
  if (!canActAsEmployee(scope, permission)) {
    throw new ForbiddenError("You do not have permission to do that.");
  }
}
