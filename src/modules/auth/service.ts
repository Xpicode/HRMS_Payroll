import "server-only";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/password";
import type { Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import * as repo from "./repo";
import type {
  ChangePasswordInput,
  CreateUserInput,
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
        role: "ADMIN" | "PAYROLL_OFFICER" | "ENCODER";
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

/** Where to send a user right after a successful sign-in. */
export async function postLoginDestination(email: string, requested: string): Promise<string> {
  const user = await repo.findUserByEmail(email);
  return user?.mustChangePassword ? "/app/account/password" : requested;
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
