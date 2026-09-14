import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/app-shell/app-shell";

/** Screens that are not tied to one company (administration, account). */
export default async function GlobalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} currentCompany={null}>
      {children}
    </AppShell>
  );
}
