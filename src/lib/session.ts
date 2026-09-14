import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientIp, isUuid } from "@/lib/request";
import type { Scope } from "@/lib/scope";
import { roleCan, type Permission } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/action-result";
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
  /** Companies this user may open. ADMIN = every active company. */
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
 * Returns null when there is no session, the user is disabled, or the session
 * pre-dates the user's last password change (server-side revocation of JWT sessions).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !isUuid(id)) return null;

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

/** The scope object passed to services and repos. Built from the session, never from input. */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await requireUser();
  const h = await headers();
  return {
    userId: user.id,
    role: user.role,
    companyIds: user.role === "ADMIN" ? null : user.companies.map((c) => c.id),
    ip: clientIp(h),
  };
});

/** For services: throws (actions turn it into a friendly error). */
export function assertPermission(scope: Scope, permission: Permission): void {
  if (!roleCan(scope.role, permission)) {
    throw new ForbiddenError("You do not have permission to do that.");
  }
}
