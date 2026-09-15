import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { sessionExpired } from "@/lib/session-age";
import { homePathFor, passwordPathFor, pathAllowedFor } from "@/lib/routes";

/**
 * Optimistic auth gate (cookie only, no database):
 *  - /app/**, /me/** and /api/files/** require a session; otherwise redirect to /login (401 for APIs)
 *  - staff never land under /me and employee logins never under /app (each is sent home)
 *  - users flagged must-change-password are held on their password page
 * Real authorization (company membership, roles, disabled users, revoked sessions)
 * happens in src/lib/session.ts on every server request.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isProtected =
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/me" ||
    pathname.startsWith("/me/") ||
    pathname.startsWith("/api/files");
  if (!isProtected) return NextResponse.next();

  const user = req.auth && !sessionExpired(req.auth.issuedAt) ? req.auth.user : undefined;
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (!pathAllowedFor(user.role, pathname)) {
    return NextResponse.redirect(new URL(homePathFor(user.role), req.nextUrl));
  }

  const passwordPath = passwordPathFor(user.role);
  if (user.mustChangePassword && !pathname.startsWith(passwordPath)) {
    return NextResponse.redirect(new URL(passwordPath, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
