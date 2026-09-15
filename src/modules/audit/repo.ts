import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AUDIT_PAGE_SIZE, manilaDayStart, type AuditFilter } from "./schema";

/**
 * Audit rows span companies (logins, user administration) so this repo reads the raw client.
 * The service admits ADMIN only (permission `audit.view`); nothing here is tenant-scoped.
 */

export const auditRowSelect = {
  id: true,
  at: true,
  action: true,
  entity: true,
  entityId: true,
  ip: true,
  before: true,
  after: true,
  user: { select: { id: true, name: true, email: true } },
  company: { select: { id: true, code: true } },
} as const;

export type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditRowSelect }>;

function whereFor(f: AuditFilter): Prisma.AuditLogWhereInput {
  const at: Prisma.DateTimeFilter = {};
  if (f.from) at.gte = manilaDayStart(f.from);
  if (f.to) {
    const end = manilaDayStart(f.to);
    end.setUTCDate(end.getUTCDate() + 1);
    at.lt = end;
  }
  return {
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.companyId ? { companyId: f.companyId } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.entityId ? { entityId: { contains: f.entityId, mode: "insensitive" } } : {}),
    ...(f.from || f.to ? { at } : {}),
  };
}

/** One page (newest first) plus whether another page follows. */
export async function listPage(f: AuditFilter) {
  const rows = await prisma.auditLog.findMany({
    where: whereFor(f),
    orderBy: [{ at: "desc" }, { id: "desc" }],
    skip: (f.page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE + 1,
    select: auditRowSelect,
  });
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}

export function count(f: AuditFilter) {
  return prisma.auditLog.count({ where: whereFor(f) });
}

/** Distinct values for the filter dropdowns (small sets: a few entities and actions). */
export async function distinctEntities(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["entity"],
    select: { entity: true },
    orderBy: { entity: "asc" },
  });
  return rows.map((r) => r.entity);
}

export async function distinctActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}

export function listUsersForFilter() {
  return prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

export function listCompaniesForFilter() {
  return prisma.company.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } });
}
