import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { CompanyForm } from "@/modules/companies/components/company-form";

export const metadata: Metadata = { title: "New company" };

export default async function NewCompanyPage() {
  await requirePermission("companies.create");
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="New company"
        description="A default payroll policy (313 working days, standard OT multipliers, statutory on the 2nd cutoff) is created with it. You can edit it afterwards in Company settings."
      />
      <CompanyForm mode="create" />
    </>
  );
}
