import { requireUser } from "@/lib/session";

/**
 * Everything under /app requires a valid, active user. The proxy already checked the
 * cookie; this checks the database (disabled users, revoked sessions).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
