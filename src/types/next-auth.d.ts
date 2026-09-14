import type { Role } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    mustChangePassword: boolean;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
    /** Unix seconds when the JWT was issued; used to revoke sessions after a password change. */
    issuedAt: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    mustChangePassword: boolean;
    issuedAt: number;
  }
}
