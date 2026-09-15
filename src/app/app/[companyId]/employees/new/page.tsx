import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { getEmployeeNoSeries, listDepartments } from "@/modules/employees/service";
import { EmployeeForm } from "@/modules/employees/components/employee-form";
import { PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = { title: "New employee" };

export default async function NewEmployeePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "employees.manage")) notFound();
  const scope = await getScope();
  const [series, departments] = await Promise.all([
    getEmployeeNoSeries(scope, companyId),
    listDepartments(scope, companyId),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="New employee"
        description="After saving you will be taken to the pay settings tab to enter the rate."
      />
      <EmployeeForm
        mode="create"
        companyId={companyId}
        departments={departments}
        nextEmployeeNo={series.next}
        canCreateLogin={roleCan(user.role, "employees.portal_access")}
      />
    </>
  );
}
