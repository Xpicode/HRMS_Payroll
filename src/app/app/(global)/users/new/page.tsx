import type { Metadata } from "next";
import { getScope, requirePermission } from "@/lib/session";
import { listCompanies } from "@/modules/companies/service";
import { PageHeader } from "@/components/app-shell/page-header";
import { UserForm } from "@/modules/auth/components/user-form";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  await requirePermission("users.manage");
  const companies = await listCompanies(await getScope());
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="New user"
        description="Set a temporary password and share it securely. The user is required to change it at first login."
      />
      <UserForm
        mode="create"
        companies={companies.map((c) => ({ id: c.id, code: c.code, legalName: c.legalName }))}
      />
    </>
  );
}
