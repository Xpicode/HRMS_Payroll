import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { audit, type AuditWriter } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { postLoginPath } from "@/lib/routes";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import * as repo from "./repo";
import type {
  ChangePasswordInput,
  CreateUserInput,
  EmployeeLoginInput,
  ResetPasswordInput,
  UpdateUserInput,
} from "./schema";

export type LoginResult =
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        name: string;
        role: Role;
        mustChangePassword: boolean;
      };
    }
  | { ok: false; code: "invalid" | "locked" | "inactive" };

/**
 * Verifies credentials with constant-ish timing, account lockout and audit.
 * Called from the Auth.js Credentials provider only.
 */
export async function verifyLogin(
  email: string,
  password: string,
  ip: string | null,
): Promise<LoginResult> {
  const cfg = env();
  const user = await repo.findUserByEmail(email);

  if (!user) {
    // Burn the same bcrypt cost so unknown emails are not distinguishable by timing.
    await verifyPassword(password, await dummyHash());
    await audit("User", email, "LOGIN_FAILED", null, { reason: "unknown_email" }, { ip });
    return { ok: false, code: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verifyPassword(password, await dummyHash());
    await audit(
      "User",
      user.id,
      "LOGIN_FAILED",
      null,
      { reason: "locked" },
      { actorId: user.id, ip },
    );
    return { ok: false, code: "locked" };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const r = await repo.recordFailedLogin(
      user.id,
      cfg.ACCOUNT_LOCK_AFTER_FAILURES,
      cfg.ACCOUNT_LOCK_MINUTES,
    );
    await audit(
      "User",
      user.id,
      "LOGIN_FAILED",
      null,
      { reason: "bad_password" },
      { actorId: user.id, ip },
    );
    if (r.locked) {
      await audit(
        "User",
        user.id,
        "LOCKOUT",
        null,
        { lockedUntil: r.lockedUntil },
        { actorId: user.id, ip },
      );
      return { ok: false, code: "locked" };
    }
    return { ok: false, code: "invalid" };
  }

  if (!user.isActive) {
    await audit(
      "User",
      user.id,
      "LOGIN_FAILED",
      null,
      { reason: "inactive" },
      { actorId: user.id, ip },
    );
    return { ok: false, code: "inactive" };
  }

  await repo.recordSuccessfulLogin(user.id);
  await audit("User", user.id, "LOGIN", null, null, { actorId: user.id, ip });
  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

/** Where to send a user right after a successful sign-in (their area, or the password page first). */
export async function postLoginDestination(email: string, requested: string): Promise<string> {
  const user = await repo.findUserByEmail(email);
  return user ? postLoginPath(user.role, user.mustChangePassword, requested) : requested;
}

// ---------------------------------------------------------------------------
// User management (ADMIN)
// ---------------------------------------------------------------------------

export async function listUsers(scope: Scope) {
  assertPermission(scope, "users.manage");
  return repo.listUsers();
}

export async function getUser(scope: Scope, id: string) {
  assertPermission(scope, "users.manage");
  return repo.findUserById(id);
}

async function assertCompaniesExist(companyIds: string[]) {
  if (companyIds.length === 0) return;
  const unique = [...new Set(companyIds)];
  const count = await repo.countExistingCompanies(unique);
  if (count !== unique.length)
    throw new AppError("One or more selected companies do not exist.", {
      companyIds: ["Invalid company selection"],
    });
}

export async function createUser(scope: Scope, input: CreateUserInput) {
  assertPermission(scope, "users.manage");
  const existing = await repo.findUserByEmail(input.email);
  if (existing) throw new AppError("That email is already in use.", { email: ["Already in use"] });

  const companyIds = input.role === "ADMIN" ? [] : [...new Set(input.companyIds)];
  await assertCompaniesExist(companyIds);
  const passwordHash = await hashPassword(input.password);

  return repo.transaction(async (tx) => {
    const user = await repo.createUser(
      {
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash,
        mustChangePassword: true,
        companyIds,
      },
      tx,
    );
    await audit("User", user.id, "CREATE", null, user, { scope, tx });
    return user;
  });
}

export async function updateUser(scope: Scope, id: string, input: UpdateUserInput) {
  assertPermission(scope, "users.manage");
  const before = await repo.findUserById(id);
  if (!before) throw new AppError("User not found.");
  if (before.role === "EMPLOYEE")
    throw new AppError("Employee logins are managed from the employee's record.");

  if (id === scope.userId) {
    if (input.role !== before.role)
      throw new AppError("You cannot change your own role.", {
        role: ["Not allowed on your own account"],
      });
    if (!input.isActive)
      throw new AppError("You cannot deactivate your own account.", {
        isActive: ["Not allowed on your own account"],
      });
  }

  const companyIds = input.role === "ADMIN" ? [] : [...new Set(input.companyIds)];
  await assertCompaniesExist(companyIds);

  return repo.transaction(async (tx) => {
    const losingAdmin =
      before.role === "ADMIN" && before.isActive && (input.role !== "ADMIN" || !input.isActive);
    if (losingAdmin && (await repo.countActiveAdmins(tx)) <= 1) {
      throw new AppError("At least one active administrator must remain.", {
        role: ["Last active administrator"],
      });
    }
    const after = await repo.updateUser(
      id,
      { name: input.name, role: input.role, isActive: input.isActive, companyIds },
      tx,
    );
    await audit("User", id, "UPDATE", before, after, { scope, tx });
    return after;
  });
}

/** Admin sets a temporary password; the user must change it at next login. Existing sessions are revoked. */
export async function resetPassword(scope: Scope, id: string, input: ResetPasswordInput) {
  assertPermission(scope, "users.manage");
  const target = await repo.findUserById(id);
  if (!target) throw new AppError("User not found.");
  const passwordHash = await hashPassword(input.password);
  return repo.transaction(async (tx) => {
    const after = await repo.setPassword(id, passwordHash, true, tx);
    await audit("User", id, "PASSWORD_RESET", null, { by: scope.userId }, { scope, tx });
    return after;
  });
}

// ---------------------------------------------------------------------------
// Employee self-service logins (Phase 9) — ADMIN or PAYROLL_OFFICER of the employee's company
// ---------------------------------------------------------------------------

export type EmployeeLoginView = {
  id: string;
  email: string;
  isActive: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};

type UserRow = NonNullable<Awaited<ReturnType<typeof repo.findUserByEmployeeId>>>;

function toLoginView(u: UserRow): EmployeeLoginView {
  return {
    id: u.id,
    email: u.email,
    isActive: u.isActive,
    isLocked: u.lockedUntil !== null && u.lockedUntil.getTime() > Date.now(),
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
  };
}

async function employeeForLogin(scope: Scope, companyId: string, employeeId: string) {
  assertPermission(scope, "employees.portal_access");
  assertCompanyAccess(scope, companyId);
  const employee = await repo.findEmployeeForLogin(scope, companyId, employeeId);
  if (!employee) throw new AppError("Employee not found.");
  return employee;
}

/** The login linked to an employee, or null when none was created yet. */
export async function getEmployeeLogin(scope: Scope, companyId: string, employeeId: string) {
  await employeeForLogin(scope, companyId, employeeId);
  const user = await repo.findUserByEmployeeId(employeeId);
  return user ? toLoginView(user) : null;
}

/** Creates the EMPLOYEE login: role EMPLOYEE, member of this company only, temporary password. */
export async function createEmployeeLogin(
  scope: Scope,
  companyId: string,
  employeeId: string,
  input: EmployeeLoginInput,
) {
  const employee = await employeeForLogin(scope, companyId, employeeId);
  if (employee.status === "SEPARATED")
    throw new AppError("A separated employee cannot be given portal access.");
  if (await repo.findUserByEmployeeId(employeeId))
    throw new AppError("This employee already has a login.");
  if (await repo.findUserByEmail(input.email))
    throw new AppError("That email is already in use.", { email: ["Already in use"] });
  const passwordHash = await hashPassword(input.password);
  return repo.transaction(async (tx) => {
    const user = await repo.createUser(
      {
        email: input.email,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        role: "EMPLOYEE",
        passwordHash,
        mustChangePassword: true,
        companyIds: [companyId],
        employeeId,
      },
      tx,
    );
    await audit(
      "User",
      user.id,
      "CREATE",
      null,
      { email: user.email, role: user.role, employeeId, employeeNo: employee.employeeNo },
      { scope, companyId, tx },
    );
    return toLoginView(user);
  });
}

async function existingLogin(scope: Scope, companyId: string, employeeId: string) {
  await employeeForLogin(scope, companyId, employeeId);
  const user = await repo.findUserByEmployeeId(employeeId);
  if (!user || user.role !== "EMPLOYEE") throw new AppError("This employee has no login yet.");
  return user;
}

/** Temporary password for the employee's login; they must change it at next sign-in. */
export async function resetEmployeeLogin(
  scope: Scope,
  companyId: string,
  employeeId: string,
  input: ResetPasswordInput,
) {
  const user = await existingLogin(scope, companyId, employeeId);
  const passwordHash = await hashPassword(input.password);
  return repo.transaction(async (tx) => {
    const after = await repo.setPassword(user.id, passwordHash, true, tx);
    await audit(
      "User",
      user.id,
      "PASSWORD_RESET",
      null,
      { by: scope.userId, employeeId },
      { scope, companyId, tx },
    );
    return toLoginView(after);
  });
}

/** Enable or disable the employee's login (a disabled login cannot sign in; data is kept). */
export async function setEmployeeLoginActive(
  scope: Scope,
  companyId: string,
  employeeId: string,
  isActive: boolean,
) {
  const user = await existingLogin(scope, companyId, employeeId);
  if (user.isActive === isActive) return toLoginView(user);
  return repo.transaction(async (tx) => {
    const after = await repo.setUserActive(user.id, isActive, tx);
    await audit(
      "User",
      user.id,
      "UPDATE",
      { isActive: user.isActive },
      { isActive: after.isActive, employeeId },
      { scope, companyId, tx },
    );
    return toLoginView(after);
  });
}

/**
 * Called by the employees module inside its separation transaction: an employee who left
 * loses portal access at once. No permission check of its own — separation already had one.
 */
export async function disableEmployeeLogin(
  tx: repo.UserWriter & AuditWriter,
  scope: Scope,
  companyId: string,
  employeeId: string,
): Promise<void> {
  const user = await repo.findUserByEmployeeId(employeeId);
  if (!user || user.role !== "EMPLOYEE" || !user.isActive) return;
  const changed = await repo.disableEmployeeUser(tx, employeeId);
  if (!changed) return;
  await audit(
    "User",
    user.id,
    "UPDATE",
    { isActive: true },
    { isActive: false, employeeId, reason: "separated" },
    { scope, companyId, tx },
  );
}

/** The signed-in user changes their own password. Caller must sign the user out afterwards (sessions are revoked). */
export async function changeOwnPassword(scope: Scope, input: ChangePasswordInput) {
  const me = await repo.findUserAuthById(scope.userId);
  if (!me || !me.isActive) throw new AppError("Account not available.");
  const ok = await verifyPassword(input.currentPassword, me.passwordHash);
  if (!ok)
    throw new AppError("Current password is incorrect.", {
      currentPassword: ["Incorrect password"],
    });
  const passwordHash = await hashPassword(input.password);
  await repo.transaction(async (tx) => {
    await repo.setPassword(scope.userId, passwordHash, false, tx);
    await audit("User", scope.userId, "PASSWORD_CHANGE", null, null, { scope, tx });
  });
}
