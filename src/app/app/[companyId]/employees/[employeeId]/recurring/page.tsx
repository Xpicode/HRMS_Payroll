import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatDateOnly, toIsoDate, todayInManila } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getEmployee } from "@/modules/employees/service";
import { deleteRecurringItemAction } from "@/modules/employees/actions";
import {
  EndRecurringItemForm,
  RecurringItemForm,
} from "@/modules/employees/components/recurring-item-form";
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

export const metadata: Metadata = { title: "Recurring items" };

export default async function RecurringItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  const sp = await searchParams;
  const employee = await getEmployee(await getScope(), companyId, employeeId);
  if (!employee) notFound();
  const canManage = roleCan(user.role, "employees.manage");
  const today = todayInManila();

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
        active="recurring"
        showLoans={roleCan(user.role, "loans.view")}
      />

      {sp.saved || sp.deleted ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>{sp.deleted ? "Item deleted." : "Item saved."}</AlertTitle>
        </Alert>
      ) : null}

      <div className={canManage ? "grid gap-6 lg:grid-cols-[1fr_340px]" : ""}>
        <Card>
          <CardHeader>
            <CardTitle>Fixed allowances and deductions</CardTitle>
            <CardDescription>
              Applied every pay period while in effect; the payroll compute reads them.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employee.recurringItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 6 : 5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No recurring items.
                    </TableCell>
                  </TableRow>
                ) : (
                  employee.recurringItems.map((item) => {
                    const from = toIsoDate(item.effectiveFrom);
                    const to = item.effectiveTo ? toIsoDate(item.effectiveTo) : null;
                    const active = from <= today && (!to || to >= today);
                    return (
                      <TableRow
                        key={item.id}
                        className={active ? undefined : "text-muted-foreground"}
                      >
                        <TableCell>
                          <span className="font-medium">{item.label}</span>
                          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                            {item.componentCode}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.kind === "EARNING" ? "secondary" : "outline"}>
                            {item.kind === "EARNING" ? "Earning" : "Deduction"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {formatMoney(item.amount)}
                        </TableCell>
                        <TableCell className="tabular">{formatDateOnly(from)}</TableCell>
                        <TableCell className="tabular">
                          {to ? (
                            formatDateOnly(to)
                          ) : (
                            <span className="text-muted-foreground">open</span>
                          )}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="flex flex-wrap items-end justify-end gap-2">
                              {!to ? (
                                <EndRecurringItemForm
                                  companyId={companyId}
                                  employeeId={employeeId}
                                  itemId={item.id}
                                  defaultTo={today}
                                />
                              ) : null}
                              <form
                                action={deleteRecurringItemAction.bind(
                                  null,
                                  companyId,
                                  employeeId,
                                  item.id,
                                )}
                              >
                                <ConfirmSubmit
                                  message={`Delete "${item.label}"?`}
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                >
                                  Delete
                                </ConfirmSubmit>
                              </form>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {canManage ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Add item</CardTitle>
            </CardHeader>
            <CardContent>
              <RecurringItemForm
                companyId={companyId}
                employeeId={employeeId}
                defaultFrom={today}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
