import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js configuration that is safe to load in the proxy: no database, no bcrypt.
 * The Credentials provider is added in src/lib/auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: {
    strategy: "jwt",
    maxAge: Number(process.env.SESSION_MAX_AGE_SECONDS ?? 28800), // 8h absolute
    updateAge: 60 * 60, // re-issue at most hourly while active
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
      }
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
