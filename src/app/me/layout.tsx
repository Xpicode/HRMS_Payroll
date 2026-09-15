import { requireEmployee } from "@/lib/session";
import { PortalShell } from "@/modules/self-service/components/portal-shell";

/**
 * The employee self-service portal (Phase 9). Only EMPLOYEE logins get here; staff are sent
 * back to /app by `requireEmployee`. Every page below reads data through the session's
 * employee id — there is no employee id in any URL.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireEmployee();
  return (
    <PortalShell user={user} company={user.companies[0] ?? null}>
      {children}
    </PortalShell>
  );
}
