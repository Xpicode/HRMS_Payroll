import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { AppShell } from "@/components/app-shell/app-shell";
import { PageHeader } from "@/components/app-shell/page-header";

/** Landing: go to the first allowed company; admins with no companies go to setup. */
export default async function AppIndex() {
  const user = await requireUser();
  const first = user.companies[0];
  if (first) redirect(`/app/${first.id}`);
  if (roleCan(user.role, "companies.create")) redirect("/app/companies?empty=1");

  return (
    <AppShell user={user} currentCompany={null}>
      <PageHeader
        title="No company assigned"
        description="Your account is not assigned to any company yet. Ask an administrator to assign one."
      />
    </AppShell>
  );
}
