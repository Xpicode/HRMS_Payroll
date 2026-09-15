import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { toIsoDate, todayInManila } from "@/lib/dates";
import { getEmployee, getEmployeeNoSeries, listDepartments } from "@/modules/employees/service";
import { EmployeeForm } from "@/modules/employees/components/employee-form";
import { EmployeeTabs } from "@/modules/employees/components/employee-tabs";
import { SeparationCard } from "@/modules/employees/components/separation-card";
import { PortalAccessCard } from "@/modules/auth/components/portal-access-card";
import { getEmployeeLogin } from "@/modules/auth/service";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Employee" };

export default async function EmployeeDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
  searchParams: Promise<{ separated?: string; reinstated?: string; portal?: string }>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const [employee, series, departments] = await Promise.all([
    getEmployee(scope, companyId, employeeId),
    getEmployeeNoSeries(scope, companyId),
    listDepartments(scope, companyId),
  ]);
  if (!employee) notFound();
  const separationDate = employee.separationDate ? toIsoDate(employee.separationDate) : null;
  const canPortal = roleCan(user.role, "employees.portal_access");
  const login = canPortal ? await getEmployeeLogin(scope, companyId, employeeId) : null;

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · ${employee.employeeNo}`}
        title={`${employee.lastName}, ${employee.firstName}`}
        description={employee.position ?? undefined}
        actions={
          employee.status === "SEPARATED" ? (
            <Badge variant="destructive">
              Separated{separationDate ? ` · ${separationDate}` : ""}
            </Badge>
          ) : null
        }
      />
      <EmployeeTabs
        companyId={companyId}
        employeeId={employeeId}
        active="details"
        showLoans={roleCan(user.role, "loans.view")}
      />
      {sp.separated || sp.reinstated || sp.portal === "created" ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>
            {sp.portal === "created"
              ? "Portal login created. Tell the employee the temporary password in person; they must change it at first sign-in."
              : sp.reinstated
                ? "Employee reinstated."
                : "Employee separated; the payslip of that period will be marked final pay."}
          </AlertTitle>
        </Alert>
      ) : null}
      <div className={cn("mb-6 grid gap-6", canPortal && "lg:grid-cols-2")}>
        <SeparationCard
          companyId={companyId}
          employeeId={employeeId}
          status={employee.status}
          separationDate={separationDate}
          canSeparate={roleCan(user.role, "employees.separate")}
          canReinstate={roleCan(user.role, "employees.reinstate")}
          today={todayInManila()}
        />
        {canPortal ? (
          <PortalAccessCard
            companyId={companyId}
            employeeId={employeeId}
            defaultEmail={employee.email}
            separated={employee.status === "SEPARATED"}
            login={
              login
                ? {
                    ...login,
                    lastLoginAt: login.lastLoginAt ? login.lastLoginAt.toISOString() : null,
                  }
                : null
            }
          />
        ) : null}
      </div>
      <EmployeeForm
        // Separation / reinstatement above changes status and date under the form; remount it
        // so the uncontrolled inputs pick up the new defaults instead of mutating them.
        key={`${employee.status}:${separationDate ?? ""}:${employee.updatedAt.toISOString()}`}
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
