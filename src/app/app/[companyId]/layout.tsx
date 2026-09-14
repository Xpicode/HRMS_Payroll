import { requireCompany } from "@/lib/session";
import { AppShell } from "@/components/app-shell/app-shell";

/**
 * Every company-scoped screen lives under here. `requireCompany` returns 404 for ids the
 * user is not assigned to, so a URL for another company is indistinguishable from a
 * non-existent one.
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  return (
    <AppShell user={user} currentCompany={company}>
      {children}
    </AppShell>
  );
}
