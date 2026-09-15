import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { sessionExpired } from "@/lib/session-age";

/**
 * Optimistic auth gate (cookie only, no database):
 *  - /app/**  and /api/files/**  require a session; otherwise redirect to /login (401 for APIs)
 *  - users flagged must-change-password are held on /app/account/password
 * Real authorization (company membership, roles, disabled users, revoked sessions)
 * happens in src/lib/session.ts on every server request.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isProtected = pathname.startsWith("/app") || pathname.startsWith("/api/files");
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

  if (
    user.mustChangePassword &&
    !pathname.startsWith("/app/account/password") &&
    !pathname.startsWith("/api/")
  ) {
    return NextResponse.redirect(new URL("/app/account/password", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
