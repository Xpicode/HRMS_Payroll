import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UploadIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { formatDateOnly, toIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listDepartments, listEmployees } from "@/modules/employees/service";
import { EmployeeTable, type EmployeeListRow } from "@/modules/employees/components/employee-table";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ imported?: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  const sp = await searchParams;
  const scope = await getScope();
  const [employees, departments] = await Promise.all([
    listEmployees(scope, companyId),
    listDepartments(scope, companyId),
  ]);
  const canManage = roleCan(user.role, "employees.manage");

  const rows: EmployeeListRow[] = employees.map((e) => {
    const p = e.currentPay;
    const rate = !p
      ? "No pay setting"
      : p.payType === "MONTHLY"
        ? `${formatMoney(p.monthlyRate)} / mo`
        : p.payType === "DAILY"
          ? `${formatMoney(p.dailyRate)} / day`
          : "Commission";
    return {
      id: e.id,
      href: `/app/${companyId}/employees/${e.id}`,
      employeeNo: e.employeeNo,
      name: `${e.lastName}, ${e.firstName}${e.middleName ? ` ${e.middleName[0]}.` : ""}${e.suffix ? ` ${e.suffix}` : ""}`,
      position: e.position ?? "",
      department: e.department ?? "",
      status: e.status,
      hireDate: toIsoDate(e.hireDate),
      hireDateLabel: formatDateOnly(toIsoDate(e.hireDate)),
      rate,
    };
  });

  const imported = Number(sp.imported);

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Employees"
        description="201 records, pay settings and recurring items for this company."
        actions={
          canManage ? (
            <>
              <Button
                variant="outline"
                render={<Link href={`/app/${companyId}/employees/import`} />}
                nativeButton={false}
              >
                <UploadIcon data-icon="inline-start" />
                Import CSV
              </Button>
              <Button
                render={<Link href={`/app/${companyId}/employees/new`} />}
                nativeButton={false}
              >
                <PlusIcon data-icon="inline-start" />
                New employee
              </Button>
            </>
          ) : null
        }
      />
      {Number.isInteger(imported) && imported > 0 ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>Imported {imported} employee(s).</AlertTitle>
        </Alert>
      ) : null}
      <EmployeeTable rows={rows} departments={departments} />
    </>
  );
}
