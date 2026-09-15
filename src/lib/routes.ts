import type { Role } from "@/generated/prisma/enums";

/**
 * Where each kind of user lives. Staff work under /app; an EMPLOYEE login (self-service,
 * Phase 9) only ever sees /me. Pure, so the proxy, the sign-in redirect and the layouts agree.
 */
export function isEmployeeRole(role: Role): boolean {
  return role === "EMPLOYEE";
}

export function homePathFor(role: Role): string {
  return isEmployeeRole(role) ? "/me" : "/app";
}

export function passwordPathFor(role: Role): string {
  return isEmployeeRole(role) ? "/me/password" : "/app/account/password";
}

/** True when `pathname` is inside the area the role is allowed to browse. */
export function pathAllowedFor(role: Role, pathname: string): boolean {
  const inApp = pathname === "/app" || pathname.startsWith("/app/");
  const inMe = pathname === "/me" || pathname.startsWith("/me/");
  if (isEmployeeRole(role)) return !inApp;
  return !inMe;
}

/**
 * The page to open after sign-in: the requested path when it is inside the user's area,
 * otherwise their home. A user who must still change a temporary password goes there first.
 */
export function postLoginPath(role: Role, mustChangePassword: boolean, requested: string): string {
  if (mustChangePassword) return passwordPathFor(role);
  return pathAllowedFor(role, requested) ? requested : homePathFor(role);
}
