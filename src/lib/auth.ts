import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { loginSchema } from "@/modules/auth/schema";
import { verifyLogin } from "@/modules/auth/service";
import { clientIp } from "@/lib/request";

export type LoginFailureCode = "invalid" | "locked" | "inactive";

export class LoginError extends CredentialsSignin {
  constructor(code: LoginFailureCode) {
    super(code);
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) throw new LoginError("invalid");
        const ip = clientIp(request.headers);
        const result = await verifyLogin(parsed.data.email, parsed.data.password, ip);
        if (!result.ok) throw new LoginError(result.code);
        const u = result.user;
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          mustChangePassword: u.mustChangePassword,
        };
      },
    }),
  ],
});
