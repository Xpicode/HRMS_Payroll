import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatDateOnly, todayInManila } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getEmployee } from "@/modules/employees/service";
import { listLoans } from "@/modules/loans/service";
import { cancelLoanAction } from "@/modules/loans/actions";
import { LOAN_TYPE_LABELS } from "@/modules/loans/schema";
import { LoanForm } from "@/modules/loans/components/loan-form";
import { EmployeeTabs } from "@/modules/employees/components/employee-tabs";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
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

export const metadata: Metadata = { title: "Loans" };

const STATUS_VARIANT = { ACTIVE: "default", PAID: "secondary", CANCELLED: "outline" } as const;

export default async function LoansPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
  searchParams: Promise<{ saved?: string; cancelled?: string }>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  if (!roleCan(user.role, "loans.view")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const employee = await getEmployee(scope, companyId, employeeId);
  if (!employee) notFound();
  const loans = await listLoans(scope, companyId, employeeId);
  const canManage = roleCan(user.role, "loans.manage");

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · ${employee.employeeNo}`}
        title={`${employee.lastName}, ${employee.firstName}`}
        description={employee.position ?? undefined}
      />
      <EmployeeTabs companyId={companyId} employeeId={employeeId} active="loans" />

      {sp.saved || sp.cancelled ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>{sp.cancelled ? "Loan cancelled." : "Loan added."}</AlertTitle>
        </Alert>
      ) : null}

      <div className={canManage ? "grid gap-6 lg:grid-cols-[1fr_360px]" : ""}>
        <Card>
          <CardHeader>
            <CardTitle>Loans and cash advances</CardTitle>
            <CardDescription>
              One amortization is deducted per pay period from the start date until the balance
              reaches zero. Balances move only when a period is approved (and back on revert).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Per period</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 7 : 6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No loans.
                    </TableCell>
                  </TableRow>
                ) : (
                  loans.map((l) => (
                    <TableRow
                      key={l.id}
                      className={l.status !== "ACTIVE" ? "text-muted-foreground" : undefined}
                    >
                      <TableCell>
                        <span className="font-medium">{l.label}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {LOAN_TYPE_LABELS[l.type]}
                          {l.payments.length ? ` · ${l.payments.length} payment(s)` : ""}
                          {l.note ? ` · ${l.note}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatMoney(l.principal)}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatMoney(l.amortization)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatMoney(l.balance)}
                      </TableCell>
                      <TableCell className="tabular">{formatDateOnly(l.startDate)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[l.status]}>{l.status.toLowerCase()}</Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          {l.status === "ACTIVE" ? (
                            <form action={cancelLoanAction.bind(null, companyId, employeeId, l.id)}>
                              <ConfirmSubmit
                                variant="ghost"
                                size="sm"
                                message={`Cancel ${l.label}? It will no longer be deducted.`}
                              >
                                Cancel
                              </ConfirmSubmit>
                            </form>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {canManage ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>New loan</CardTitle>
              <CardDescription>SSS loan, Pag-IBIG loan, cash advance or other.</CardDescription>
            </CardHeader>
            <CardContent>
              <LoanForm
                companyId={companyId}
                employeeId={employeeId}
                defaultStart={todayInManila()}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
