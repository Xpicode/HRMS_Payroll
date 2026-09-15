import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { todayInManila } from "@/lib/dates";
import { getEmployee } from "@/modules/employees/service";
import {
  currentYear,
  employeeBalances,
  listLeaveTypes,
  listRequests,
} from "@/modules/leave/service";
import { LeaveRequestForm } from "@/modules/leave/components/leave-request-form";
import { CreditAdjustForm } from "@/modules/leave/components/credit-forms";
import { RequestsTable } from "@/modules/leave/components/requests-table";
import { EmployeeTabs } from "@/modules/employees/components/employee-tabs";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Leave" };

type Search = {
  year?: string;
  saved?: string;
  approve?: string;
  reject?: string;
  cancel?: string;
  adjusted?: string;
};

export default async function EmployeeLeavePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  if (!roleCan(user.role, "leave.view")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const parsedYear = Number(sp.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : currentYear();
  const employee = await getEmployee(scope, companyId, employeeId);
  if (!employee) notFound();
  const [balances, requests, leaveTypes] = await Promise.all([
    employeeBalances(scope, companyId, employeeId, year),
    listRequests(scope, companyId, { employeeId, take: 200 }),
    listLeaveTypes(scope, companyId),
  ]);
  const canApprove = roleCan(user.role, "leave.approve");
  const canRequest = roleCan(user.role, "leave.request") && employee.status !== "SEPARATED";
  const canAdjust = roleCan(user.role, "leave.adjust_credits");
  const base = `/app/${companyId}/employees/${employeeId}/leave`;

  const notice = sp.saved
    ? "Leave request filed."
    : sp.approve
      ? "Leave approved; the days are now in attendance."
      : sp.reject
        ? "Leave rejected."
        : sp.cancel
          ? "Leave request cancelled."
          : sp.adjusted
            ? "Credits adjusted."
            : null;

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
        active="leave"
        showLoans={roleCan(user.role, "loans.view")}
      />

      {notice ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}

      <div className={canRequest || canAdjust ? "grid gap-6 lg:grid-cols-[1fr_360px]" : ""}>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Credits {year}</CardTitle>
                <CardDescription>
                  Allocated by the yearly rollover or on first use; adjustable with a reason.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous year"
                  render={<Link href={`${base}?year=${year - 1}`} />}
                  nativeButton={false}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="min-w-14 text-center font-mono text-sm font-medium">{year}</span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next year"
                  render={<Link href={`${base}?year=${year + 1}`} />}
                  nativeButton={false}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leave type</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No leave types defined for this company.
                      </TableCell>
                    </TableRow>
                  ) : (
                    balances.map((b) => (
                      <TableRow key={b.leaveType.id}>
                        <TableCell>
                          <span className="font-medium">{b.leaveType.name}</span>
                          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                            {b.leaveType.code}
                          </span>
                          {b.balanceId === null ? (
                            <span className="block text-[11px] text-muted-foreground">
                              Not allocated yet · {b.annualCredits} on first use
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular">{b.credits}</TableCell>
                        <TableCell className="text-right tabular">{b.used}</TableCell>
                        <TableCell className="text-right font-medium tabular">
                          {b.remaining}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leave requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <RequestsTable
                companyId={companyId}
                requests={requests}
                canApprove={canApprove}
                canRequest={roleCan(user.role, "leave.request")}
                returnTo={base}
                showEmployee={false}
              />
            </CardContent>
          </Card>
        </div>

        {canRequest || canAdjust ? (
          <div className="space-y-6">
            {canRequest ? (
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>File a leave request</CardTitle>
                </CardHeader>
                <CardContent>
                  <LeaveRequestForm
                    companyId={companyId}
                    employees={[]}
                    fixedEmployeeId={employeeId}
                    leaveTypes={leaveTypes.map((t) => ({
                      id: t.id,
                      code: t.code,
                      name: t.name,
                      withPayDefault: t.withPayDefault,
                    }))}
                    defaultDate={todayInManila()}
                    returnTo={base}
                  />
                </CardContent>
              </Card>
            ) : null}
            {canAdjust && leaveTypes.length > 0 ? (
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Adjust credits</CardTitle>
                  <CardDescription>Audited with your reason.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CreditAdjustForm
                    companyId={companyId}
                    employeeId={employeeId}
                    year={year}
                    leaveTypes={leaveTypes.map((t) => ({ id: t.id, code: t.code, name: t.name }))}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
