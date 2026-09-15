import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type TxClient } from "@/lib/db";
import { scoped, type Scope } from "@/lib/scope";
import type { Role } from "@/generated/prisma/enums";

/**
 * Users are not tenant rows (they span companies), so this repo uses the raw client.
 * Authorization for every function here is enforced in service.ts (ADMIN only).
 */

export const userWithCompanies = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  failedLoginCount: true,
  lockedUntil: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  employeeId: true,
  employee: {
    select: { id: true, companyId: true, employeeNo: true, lastName: true, firstName: true },
  },
  companies: {
    select: { companyId: true, company: { select: { id: true, code: true, legalName: true } } },
  },
} as const;

/** Any client that can update users: the raw transaction or a scoped() one (User is not a tenant model). */
export type UserWriter = {
  user: {
    updateMany(args: {
      where: Prisma.UserWhereInput;
      data: Prisma.UserUpdateManyMutationInput;
    }): Promise<{ count: number }>;
  };
};

/** Runs `fn` in one database transaction (services never touch the raw client). */
export function transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: userWithCompanies });
}

/** The self-service login of an employee, if any (one per employee). */
export function findUserByEmployeeId(employeeId: string) {
  return prisma.user.findUnique({ where: { employeeId }, select: userWithCompanies });
}

/** The employee an admin wants to give a login to — through the caller's company scope. */
export function findEmployeeForLogin(scope: Scope, companyId: string, employeeId: string) {
  return scoped(scope).employee.findFirst({
    where: { id: employeeId, companyId },
    select: {
      id: true,
      companyId: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
    },
  });
}

export function setUserActive(id: string, isActive: boolean, tx: TxClient = prisma) {
  return tx.user.update({ where: { id }, data: { isActive }, select: userWithCompanies });
}

/** Disables the EMPLOYEE login of an employee (separation). Returns how many rows changed (0 or 1). */
export async function disableEmployeeUser(tx: UserWriter, employeeId: string): Promise<number> {
  const r = await tx.user.updateMany({
    where: { employeeId, role: "EMPLOYEE", isActive: true },
    data: { isActive: false },
  });
  return r.count;
}

export function findUserAuthById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, passwordHash: true, isActive: true },
  });
}

export async function listUsers() {
  const now = Date.now();
  const rows = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: userWithCompanies,
  });
  return rows.map((u) => ({
    ...u,
    isLocked: u.lockedUntil !== null && u.lockedUntil.getTime() > now,
  }));
}

export function countActiveAdmins(tx: TxClient = prisma) {
  return tx.user.count({ where: { role: "ADMIN", isActive: true } });
}

export function countExistingCompanies(ids: string[], tx: TxClient = prisma) {
  return tx.company.count({ where: { id: { in: ids } } });
}

export function createUser(
  data: {
    email: string;
    name: string;
    role: Role;
    passwordHash: string;
    mustChangePassword: boolean;
    companyIds: string[];
    employeeId?: string | null;
  },
  tx: TxClient = prisma,
) {
  return tx.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      passwordHash: data.passwordHash,
      mustChangePassword: data.mustChangePassword,
      employeeId: data.employeeId ?? null,
      companies: { create: data.companyIds.map((companyId) => ({ companyId })) },
    },
    select: userWithCompanies,
  });
}

export async function updateUser(
  id: string,
  data: { name: string; role: Role; isActive: boolean; companyIds: string[] },
  tx: TxClient = prisma,
) {
  await tx.userCompany.deleteMany({ where: { userId: id, companyId: { notIn: data.companyIds } } });
  const existing = await tx.userCompany.findMany({
    where: { userId: id },
    select: { companyId: true },
  });
  const have = new Set(existing.map((e) => e.companyId));
  const toAdd = data.companyIds.filter((c) => !have.has(c));
  return tx.user.update({
    where: { id },
    data: {
      name: data.name,
      role: data.role,
      isActive: data.isActive,
      companies: { create: toAdd.map((companyId) => ({ companyId })) },
    },
    select: userWithCompanies,
  });
}

export function setPassword(
  id: string,
  passwordHash: string,
  mustChangePassword: boolean,
  tx: TxClient = prisma,
) {
  return tx.user.update({
    where: { id },
    data: {
      passwordHash,
      mustChangePassword,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    },
    select: userWithCompanies,
  });
}

/** Increments the failure counter; locks the account when the threshold is reached. */
export async function recordFailedLogin(id: string, lockAfter: number, lockMinutes: number) {
  const user = await prisma.user.update({
    where: { id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (user.failedLoginCount >= lockAfter) {
    const lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
    await prisma.user.update({ where: { id }, data: { lockedUntil, failedLoginCount: 0 } });
    return { locked: true as const, lockedUntil };
  }
  return { locked: false as const };
}

export function recordSuccessfulLogin(id: string) {
  return prisma.user.update({
    where: { id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}
