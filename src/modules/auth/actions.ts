"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { env } from "@/lib/env";
import { getLimiter } from "@/lib/rate-limit";
import { clientIp, isUuid, safeRelativePath } from "@/lib/request";
import { getAccountScope, getScope } from "@/lib/session";
import {
  AppError,
  fail,
  formToObject,
  invalid,
  success,
  type ActionResult,
} from "@/lib/action-result";
import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "./schema";
import * as service from "./service";

/** Two throttles before any bcrypt work: per client IP and per account (email). */
function loginLimiters() {
  const cfg = env();
  const windowMs = cfg.LOGIN_WINDOW_SECONDS * 1000;
  return {
    ip: getLimiter("login-ip", cfg.LOGIN_MAX_ATTEMPTS_PER_IP, windowMs),
    account: getLimiter("login-account", cfg.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT, windowMs),
  };
}

const tooMany = (retryAfterMs: number) =>
  fail(`Too many login attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`);

const LOGIN_MESSAGES: Record<string, string> = {
  invalid: "Invalid email or password.",
  inactive: "This account is disabled. Contact your administrator.",
  locked: "Too many failed attempts. The account is locked for a few minutes.",
};

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const ip = clientIp(await headers()) ?? "unknown";
  const limiters = loginLimiters();
  const byIp = limiters.ip.consume(ip);
  if (!byIp.ok) return tooMany(byIp.retryAfterMs);
  const byAccount = limiters.account.consume(parsed.data.email);
  if (!byAccount.ok) return tooMany(byAccount.retryAfterMs);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as { code?: string }).code ?? "invalid";
      return fail(LOGIN_MESSAGES[code] ?? LOGIN_MESSAGES.invalid!);
    }
    throw e;
  }

  limiters.account.reset(parsed.data.email);
  const callbackUrl = safeRelativePath(String(formData.get("callbackUrl") ?? ""), "/app");
  redirect(await service.postLoginDestination(parsed.data.email, callbackUrl));
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

function handleError(e: unknown): ActionResult {
  if (e instanceof AppError) return fail(e.message, e.fieldErrors);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

export async function createUserAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.createUser(scope, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath("/app/users");
  redirect("/app/users?created=1");
}

export async function updateUserAction(
  userId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(userId)) return fail("Invalid user.");
  const parsed = updateUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.updateUser(scope, userId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath("/app/users");
  revalidatePath(`/app/users/${userId}`);
  return success("User updated.");
}

export async function resetPasswordAction(
  userId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(userId)) return fail("Invalid user.");
  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.resetPassword(scope, userId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  return success("Temporary password set. The user must change it at next login.");
}

export async function changePasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getAccountScope();
    await service.changeOwnPassword(scope, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  // Sessions issued before the change are now invalid; start a fresh one.
  await signOut({ redirectTo: "/login?changed=1" });
  return success();
}
