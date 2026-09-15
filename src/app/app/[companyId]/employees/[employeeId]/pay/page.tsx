import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatDateOnly, toIsoDate, todayInManila, WEEKDAY_SHORT } from "@/lib/dates";
import { dailyFromMonthly, formatMoney, hourlyFromDaily } from "@/lib/money";
import { getEmployee, getRateContext } from "@/modules/employees/service";
import { PAY_TYPE_LABELS } from "@/modules/employees/schema";
import { PAY_FREQUENCY_LABELS } from "@/modules/companies/schema";
import { PaySettingForm } from "@/modules/employees/components/pay-setting-form";
import { EmployeeTabs } from "@/modules/employees/components/employee-tabs";
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

export const metadata: Metadata = { title: "Pay settings" };

export default async function PaySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
  searchParams: Promise<{ created?: string; saved?: string; login?: string }>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const [employee, ctx] = await Promise.all([
    getEmployee(scope, companyId, employeeId),
    getRateContext(scope, companyId),
  ]);
  if (!employee) notFound();
  const canManage = roleCan(user.role, "employees.manage");
  const today = todayInManila();
  const latest = employee.paySettings[0] ?? null;
  const current = employee.paySettings.find((p) => toIsoDate(p.effectiveFrom) <= today) ?? null;

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
        active="pay"
        showLoans={roleCan(user.role, "loans.view")}
      />

      {sp.created ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>
            Employee created
            {sp.login ? " with a portal login (tell them the temporary password in person)" : ""}.
            Add the first pay setting below so payroll can compute.
          </AlertTitle>
        </Alert>
      ) : sp.saved ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>Pay setting saved.</AlertTitle>
        </Alert>
      ) : null}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              The row in force on a date is the latest whose effective date is on or before it.
              Daily and hourly rates for monthly employees are derived from the policy (
              {ctx.workingDaysPerYear} days/yr, {ctx.hoursPerDay} h/day).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Daily</TableHead>
                  <TableHead className="text-right">Hourly</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employee.paySettings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No pay setting yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  employee.paySettings.map((p) => {
                    const daily =
                      p.payType === "MONTHLY" && p.monthlyRate
                        ? dailyFromMonthly(p.monthlyRate, ctx.workingDaysPerYear)
                        : p.dailyRate;
                    const hourly = daily ? hourlyFromDaily(daily, ctx.hoursPerDay) : null;
                    const iso = toIsoDate(p.effectiveFrom);
                    return (
                      <TableRow
                        key={p.id}
                        className={p.id === current?.id ? "bg-accent/40" : undefined}
                      >
                        <TableCell className="tabular">
                          {formatDateOnly(iso)}
                          {p.id === current?.id ? (
                            <Badge variant="secondary" className="ml-2">
                              Current
                            </Badge>
                          ) : iso > today ? (
                            <Badge variant="outline" className="ml-2">
                              Upcoming
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{PAY_TYPE_LABELS[p.payType]}</TableCell>
                        <TableCell className="text-right tabular">
                          {formatMoney(p.monthlyRate)}
                        </TableCell>
                        <TableCell className="text-right tabular">{formatMoney(daily)}</TableCell>
                        <TableCell className="text-right tabular">{formatMoney(hourly)}</TableCell>
                        <TableCell className="text-sm">
                          {PAY_FREQUENCY_LABELS[p.payFrequency]}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular">
                          {p.shiftStart}–{p.shiftEnd} · rest {WEEKDAY_SHORT[p.restDayOfWeek] ?? "?"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[
                            p.isMinimumWageEarner ? "MWE" : null,
                            p.sssCovered ? "SSS" : null,
                            p.philhealthCovered ? "PhilHealth" : null,
                            p.pagibigCovered ? "Pag-IBIG" : null,
                            p.taxWithheld ? "Tax" : "No tax",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.note ?? ""}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Add new effective from</CardTitle>
              <CardDescription>
                Existing rows never change; a new row takes effect from the date you choose.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaySettingForm
                companyId={companyId}
                employeeId={employeeId}
                defaultEffectiveFrom={latest ? today : toIsoDate(employee.hireDate)}
                defaultPayFrequency={ctx.payFrequency}
                workingDaysPerYear={ctx.workingDaysPerYear}
                hoursPerDay={ctx.hoursPerDay}
                latest={
                  latest
                    ? {
                        payType: latest.payType,
                        monthlyRate: latest.monthlyRate?.toString() ?? null,
                        dailyRate: latest.dailyRate?.toString() ?? null,
                        payFrequency: latest.payFrequency,
                        isMinimumWageEarner: latest.isMinimumWageEarner,
                        sssCovered: latest.sssCovered,
                        philhealthCovered: latest.philhealthCovered,
                        pagibigCovered: latest.pagibigCovered,
                        taxWithheld: latest.taxWithheld,
                        restDayOfWeek: latest.restDayOfWeek,
                        shiftStart: latest.shiftStart,
                        shiftEnd: latest.shiftEnd,
                        breakMinutes: latest.breakMinutes,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
