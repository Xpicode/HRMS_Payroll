import type { NextAuthConfig } from "next-auth";
import { sessionExpired, sessionIdleSeconds } from "@/lib/session-age";

/**
 * Auth.js configuration that is safe to load in the proxy: no database, no bcrypt.
 * The Credentials provider is added in src/lib/auth.ts.
 *
 * Two clocks bound a session:
 *  - idle: the JWT cookie expires SESSION_IDLE_SECONDS after the last request (Auth.js re-issues
 *    it while the user is active, at most every `updateAge`);
 *  - absolute: `issuedAt` is stamped at sign-in and never refreshed, and the jwt callback drops
 *    the token once it is older than SESSION_MAX_AGE_SECONDS. src/lib/session.ts re-checks it.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: {
    strategy: "jwt",
    maxAge: sessionIdleSeconds(),
    updateAge: 5 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id!;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.issuedAt = Math.floor(Date.now() / 1000);
        return token;
      }
      // Absolute lifetime reached: returning null signs the user out.
      if (sessionExpired(token.issuedAt)) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid;
      session.user.role = token.role;
      session.user.mustChangePassword = token.mustChangePassword;
      session.issuedAt = token.issuedAt;
      return session;
    },
  },
} satisfies NextAuthConfig;
