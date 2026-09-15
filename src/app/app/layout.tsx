import { requireStaff } from "@/lib/session";

/**
 * Everything under /app requires a valid, active staff user. The proxy already checked the
 * cookie; this checks the database (disabled users, revoked sessions) and sends employee
 * self-service logins to /me.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return children;
}
