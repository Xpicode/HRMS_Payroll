import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings2Icon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { todayInManila } from "@/lib/dates";
import { LeaveRequestStatus } from "@/generated/prisma/enums";
import { listEmployeesForLeave } from "@/modules/employees/service";
import { listLeaveTypes, listRequests } from "@/modules/leave/service";
import { LEAVE_STATUS_LABELS } from "@/modules/leave/schema";
import { LeaveRequestForm } from "@/modules/leave/components/leave-request-form";
import { RequestsTable } from "@/modules/leave/components/requests-table";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leave" };

type Search = {
  status?: string;
  saved?: string;
  approve?: string;
  reject?: string;
  cancel?: string;
};

export default async function LeavePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "leave.view")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const status =
    sp.status === "ALL"
      ? undefined
      : (Object.values(LeaveRequestStatus) as string[]).includes(sp.status ?? "")
        ? (sp.status as LeaveRequestStatus)
        : "PENDING";
  const [requests, leaveTypes, employees] = await Promise.all([
    listRequests(scope, companyId, { status, take: 300 }),
    listLeaveTypes(scope, companyId),
    listEmployeesForLeave(scope, companyId),
  ]);
  const canApprove = roleCan(user.role, "leave.approve");
  const canRequest = roleCan(user.role, "leave.request");
  const canTypes = roleCan(user.role, "leave.manage_types");
  const base = `/app/${companyId}/leave`;

  const notice = sp.saved
    ? "Leave request filed."
    : sp.approve
      ? "Leave approved; the days are now in attendance."
      : sp.reject
        ? "Leave rejected."
        : sp.cancel
          ? "Leave request cancelled."
          : null;

  const filters: { key: string; label: string }[] = [
    { key: "PENDING", label: LEAVE_STATUS_LABELS.PENDING },
    { key: "APPROVED", label: LEAVE_STATUS_LABELS.APPROVED },
    { key: "REJECTED", label: LEAVE_STATUS_LABELS.REJECTED },
    { key: "CANCELLED", label: LEAVE_STATUS_LABELS.CANCELLED },
    { key: "ALL", label: "All" },
  ];
  const active = status ?? "ALL";

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Leave"
        description="Requests encoded here; approving one writes the days into attendance."
        actions={
          canTypes ? (
            <Button variant="outline" render={<Link href={`${base}/types`} />} nativeButton={false}>
              <Settings2Icon data-icon="inline-start" />
              Leave types and credits
            </Button>
          ) : null
        }
      />

      {notice ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}

      {leaveTypes.length === 0 ? (
        <Alert className="mb-4">
          <AlertTitle>
            No leave types yet.{" "}
            {canTypes ? (
              <Link href={`${base}/types`} className="underline">
                Add them first.
              </Link>
            ) : (
              "Ask a payroll officer or administrator to add them."
            )}
          </AlertTitle>
        </Alert>
      ) : null}

      <div className={canRequest ? "grid gap-6 lg:grid-cols-[1fr_360px]" : ""}>
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Requests</CardTitle>
            <nav className="flex gap-1" aria-label="Filter by status">
              {filters.map((f) => (
                <Link
                  key={f.key}
                  href={`${base}?status=${f.key}`}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    active === f.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          </CardHeader>
          <CardContent className="p-0">
            <RequestsTable
              companyId={companyId}
              requests={requests}
              canApprove={canApprove}
              canRequest={canRequest}
              returnTo={base}
              emptyText={
                active === "PENDING" ? "Nothing waiting for approval." : "No leave requests."
              }
            />
          </CardContent>
        </Card>
        {canRequest ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>File a leave request</CardTitle>
              <CardDescription>
                Encoded on behalf of the employee. An officer approves it afterwards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaveRequestForm
                companyId={companyId}
                employees={employees.map((e) => ({
                  id: e.id,
                  employeeNo: e.employeeNo,
                  name: `${e.lastName}, ${e.firstName}`,
                }))}
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
      </div>
    </>
  );
}
