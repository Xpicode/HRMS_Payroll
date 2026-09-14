import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { toIsoDate } from "@/lib/dates";
import { getEmployee, getEmployeeNoSeries, listDepartments } from "@/modules/employees/service";
import { EmployeeForm } from "@/modules/employees/components/employee-form";
import { EmployeeTabs } from "@/modules/employees/components/employee-tabs";
import { PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = { title: "Employee" };

export default async function EmployeeDetailsPage({
  params,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  const scope = await getScope();
  const [employee, series, departments] = await Promise.all([
    getEmployee(scope, companyId, employeeId),
    getEmployeeNoSeries(scope, companyId),
    listDepartments(scope, companyId),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · ${employee.employeeNo}`}
        title={`${employee.lastName}, ${employee.firstName}`}
        description={employee.position ?? undefined}
      />
      <EmployeeTabs
        companyId={companyId}
        employeeId={employeeId}
        active="details"
        showLoans={roleCan(user.role, "loans.view")}
      />
      <EmployeeForm
        mode="edit"
        companyId={companyId}
        departments={departments}
        nextEmployeeNo={series.next}
        employee={{
          id: employee.id,
          employeeNo: employee.employeeNo,
          lastName: employee.lastName,
          firstName: employee.firstName,
          middleName: employee.middleName,
          suffix: employee.suffix,
          birthDate: employee.birthDate ? toIsoDate(employee.birthDate) : null,
          hireDate: toIsoDate(employee.hireDate),
          separationDate: employee.separationDate ? toIsoDate(employee.separationDate) : null,
          status: employee.status,
          position: employee.position,
          department: employee.department,
          email: employee.email,
          mobile: employee.mobile,
          address: employee.address,
          sssNo: employee.sssNo,
          philhealthNo: employee.philhealthNo,
          pagibigMid: employee.pagibigMid,
          tin: employee.tin,
          taxStatus: employee.taxStatus,
        }}
      />
    </>
  );
}
