/**
 * Replaces `@/lib/session` in integration tests: services only need `assertPermission`,
 * which is pure. The real module pulls in Auth.js and `next/headers`, which need a
 * Next.js request. The scope object is built by each test instead of from a session.
 */
import { ForbiddenError } from "@/lib/action-result";
import { roleCan, type Permission } from "@/lib/permissions";
import type { Scope } from "@/lib/scope-rules";

export function assertPermission(scope: Scope, permission: Permission): void {
  if (!roleCan(scope.role, permission)) {
    throw new ForbiddenError("You do not have permission to do that.");
  }
}

const notInTests = () => {
  throw new Error("Session helpers are not available in integration tests.");
};
export const getCurrentUser = notInTests;
export const requireUser = notInTests;
export const requirePermission = notInTests;
export const requireCompany = notInTests;
export const getScope = notInTests;
