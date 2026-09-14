import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatCutoff, formatDateOnly, toIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getPayslip, listAdjustments, listPayComponents } from "@/modules/payroll/service";
import { isFrozen } from "@/modules/payroll/schema";
import { removeAdjustmentAction } from "@/modules/payroll/actions";
import { AdjustmentForm } from "@/modules/payroll/components/period-forms";
import { PeriodStatusBadge } from "@/modules/payroll/components/status-badge";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payslip" };

const UNIT_SHORT: Record<string, string> = { days: "d", hours: "h", minutes: "min" };

type LineRow = {
  id: string;
  label: string;
  isManual: boolean;
  note: string | null;
  quantity: { toString(): string } | null;
  unit: string | null;
  rate: { toString(): string } | null;
  amount: { toString(): string };
};

function Lines({ lines, tone }: { lines: LineRow[]; tone: "earning" | "deduction" }) {
  if (lines.length === 0)
    return (
      <tr>
        <td colSpan={3} className="py-3 text-center text-xs text-muted-foreground">
          None
        </td>
      </tr>
    );
  return (
    <>
      {lines.map((l) => (
        <tr key={l.id} className={cn("border-t", l.isManual && "bg-brand/5")}>
          <td className="py-1.5 pr-2 align-top">
            <span className="font-medium">{l.label}</span>
            {l.isManual ? (
              <Badge variant="outline" className="ml-2 text-[10px]">
                manual
              </Badge>
            ) : null}
            {l.note ? (
              <span className="block text-[11px] text-muted-foreground">{l.note}</span>
            ) : null}
          </td>
          <td className="py-1.5 pr-2 text-right align-top text-xs text-muted-foreground tabular whitespace-nowrap">
            {l.quantity !== null
              ? `${Number(l.quantity.toString())} ${l.unit ? (UNIT_SHORT[l.unit] ?? l.unit) : ""}${l.rate !== null ? ` × ${formatMoney(l.rate)}` : ""}`
              : l.rate !== null
                ? formatMoney(l.rate)
                : ""}
          </td>
          <td
            className={cn(
              "py-1.5 text-right align-top font-mono tabular",
              tone === "deduction" && "text-destructive",
            )}
          >
            {formatMoney(l.amount)}
          </td>
        </tr>
      ))}
    </>
  );
}

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; periodId: string; payslipId: string }>;
  searchParams: Promise<{ adjusted?: string }>;
}) {
  const { companyId, periodId, payslipId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "payroll.view")) notFound();
  if (!isUuid(periodId) || !isUuid(payslipId)) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const slip = await getPayslip(scope, companyId, payslipId);
  if (!slip || slip.payPeriodId !== periodId) notFound();
  const [adjustments, components] = await Promise.all([
    listAdjustments(scope, companyId, periodId, slip.employeeId),
    listPayComponents(scope),
  ]);
  const frozen = isFrozen(slip.payPeriod.status);
  const canAdjust = roleCan(user.role, "payroll.compute") && !frozen;
  const base = `/app/${companyId}/payroll/${periodId}`;
  const c = slip.computation;
  const earnings = slip.lines.filter((l) => l.kind === "EARNING");
  const deductions = slip.lines.filter((l) => l.kind === "DEDUCTION");
  const cutoff = {
    start: toIsoDate(slip.payPeriod.coverageStart),
    end: toIsoDate(slip.payPeriod.coverageEnd),
    sequenceInMonth: slip.payPeriod.sequenceInMonth === 2 ? (2 as const) : (1 as const),
  };
  const negative = Number(slip.netPay) < 0;

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · ${formatCutoff(cutoff)}`}
        title={`${slip.employee.lastName}, ${slip.employee.firstName}`}
        description={`${slip.employee.employeeNo}${slip.employee.position ? ` · ${slip.employee.position}` : ""} · ${slip.slipCode ? `slip ${slip.slipCode}` : "no slip code until approval"} · pay date ${formatDateOnly(slip.payPeriod.payDate)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodStatusBadge status={slip.payPeriod.status} />
            <Button variant="ghost" size="sm" render={<Link href={base} />} nativeButton={false}>
              <ArrowLeftIcon data-icon="inline-start" />
              Period
            </Button>
          </div>
        }
      />
      {sp.adjusted ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>Adjustment saved and payslip recomputed.</AlertTitle>
        </Alert>
      ) : null}
      {slip.flags.map((f) => (
        <Alert
          key={f.code}
          variant={f.code === "NEGATIVE_NET" ? "destructive" : undefined}
          className={cn(
            "mb-3",
            f.code !== "NEGATIVE_NET" && "border-warning/40 bg-warning/5 text-warning-foreground",
          )}
        >
          <AlertTitle>{f.code.replaceAll("_", " ").toLowerCase()}</AlertTitle>
          <AlertDescription>{f.message}</AlertDescription>
        </Alert>
      ))}

      <div className={cn("grid gap-6", canAdjust && "xl:grid-cols-[1fr_360px]")}>
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-1 text-left font-medium">Earnings</th>
                    <th className="pb-1 text-right font-medium">Basis</th>
                    <th className="pb-1 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <Lines lines={earnings} tone="earning" />
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={2} className="py-2 text-xs font-semibold uppercase">
                      Gross pay
                    </td>
                    <td className="py-2 text-right font-mono font-semibold tabular">
                      {formatMoney(slip.grossPay)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-1 text-left font-medium">Deductions</th>
                    <th className="pb-1 text-right font-medium">Basis</th>
                    <th className="pb-1 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <Lines lines={deductions} tone="deduction" />
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={2} className="py-2 text-xs font-semibold uppercase">
                      Total deductions
                    </td>
                    <td className="py-2 text-right font-mono font-semibold tabular text-destructive">
                      {formatMoney(slip.totalDeductions)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
            <div
              className={cn(
                "flex items-center justify-between border-t px-6 py-4",
                negative ? "bg-destructive/5" : "bg-success/5",
              )}
            >
              <span className="text-sm font-semibold uppercase">Net pay</span>
              <span
                className={cn(
                  "font-mono text-2xl font-semibold tabular",
                  negative ? "text-destructive" : "text-success",
                )}
              >
                {formatMoney(slip.netPay)}
              </span>
            </div>
          </Card>

          <div className="grid gap-4 text-xs text-muted-foreground md:grid-cols-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="mb-1 font-medium text-foreground">Basis</p>
              <p>
                {c.input.paySetting.payType === "MONTHLY"
                  ? `Monthly ${formatMoney(c.input.paySetting.monthlyRate)}`
                  : c.input.paySetting.payType === "DAILY"
                    ? `Daily ${formatMoney(c.input.paySetting.dailyRate)}`
                    : "Commission"}{" "}
                (setting from {c.input.paySetting.effectiveFrom})
              </p>
              <p>
                Daily {formatMoney(c.output.rates.dailyRate)} · hourly{" "}
                {formatMoney(c.output.rates.hourlyRate)} · monthly basic{" "}
                {formatMoney(c.output.rates.monthlyBasic)}
              </p>
              <p>
                Policy from {c.input.policy.effectiveFrom} · statutory{" "}
                {c.input.policy.statutoryTiming.toLowerCase().replaceAll("_", " ")}
              </p>
              <p>Taxable income {formatMoney(c.output.taxableIncome)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="mb-1 font-medium text-foreground">Attendance</p>
              <p>
                {c.input.summary.daysWorked} worked · {c.input.summary.absentDays} absent of{" "}
                {c.input.summary.scheduledDays} scheduled
                {c.input.summary.unrecordedDays
                  ? ` (${c.input.summary.unrecordedDays} unrecorded)`
                  : ""}
              </p>
              <p>
                Late {c.input.summary.lateMinutes} min · UT {c.input.summary.undertimeMinutes} min ·
                OT {c.input.summary.otHours} h · ND {c.input.summary.nightDiffHours} h
              </p>
              <p>
                RH not worked {c.input.summary.regularHolidaysNotWorked} · worked{" "}
                {c.input.summary.regularHolidaysWorked}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="mb-1 font-medium text-foreground">Loans & employer share</p>
              {c.output.loanPayments.length ? (
                c.output.loanPayments.map((p) => (
                  <p key={p.loanId}>
                    Loan {p.loanId.slice(0, 8)}… {formatMoney(p.amount)} → balance{" "}
                    {formatMoney(p.remainingBalance)}
                    {slip.loanPayments.some((lp) => lp.loanId === p.loanId) ? " (posted)" : ""}
                  </p>
                ))
              ) : (
                <p>No loan deductions.</p>
              )}
              <p className="mt-1">
                ER: SSS {formatMoney(c.output.employer.sssEr)} + EC{" "}
                {formatMoney(c.output.employer.sssEc)} · PhilHealth{" "}
                {formatMoney(c.output.employer.philhealthEr)} · Pag-IBIG{" "}
                {formatMoney(c.output.employer.pagibigEr)}
              </p>
              <p>
                Tables: SSS {c.input.statutory.sss ?? "—"} · PHIC{" "}
                {c.input.statutory.philhealth ?? "—"} · HDMF {c.input.statutory.pagibig ?? "—"} ·
                BIR {c.input.statutory.tax ?? "—"}
              </p>
            </div>
          </div>

          {slip.snapshot ? (
            <p className="text-xs text-muted-foreground">
              Frozen snapshot taken {slip.snapshot.approvedAt.slice(0, 16).replace("T", " ")} UTC ·
              slip {slip.snapshot.slipCode}. PDFs and reports read the snapshot, not live rows.
            </p>
          ) : null}
        </div>

        {canAdjust ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Adjustments</CardTitle>
                <CardDescription>
                  Manual lines for this employee and period. They survive recomputation and are
                  merged in payslip order.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {adjustments.length ? (
                  <ul className="space-y-2 text-sm">
                    {adjustments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start justify-between gap-2 rounded-md border p-2"
                      >
                        <div>
                          <span className="font-medium">{a.label}</span>
                          <span
                            className={cn(
                              "ml-2 font-mono tabular",
                              a.kind === "DEDUCTION" && "text-destructive",
                            )}
                          >
                            {a.kind === "DEDUCTION" ? "−" : "+"}
                            {formatMoney(a.amount)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {a.componentCode} · {a.reason} · {a.createdBy?.name ?? "?"}
                          </span>
                        </div>
                        <form
                          action={removeAdjustmentAction.bind(
                            null,
                            companyId,
                            periodId,
                            payslipId,
                            a.id,
                          )}
                        >
                          <ConfirmSubmit
                            variant="ghost"
                            size="sm"
                            message="Remove this adjustment and recompute?"
                          >
                            Remove
                          </ConfirmSubmit>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                )}
                <AdjustmentForm
                  companyId={companyId}
                  periodId={periodId}
                  payslipId={payslipId}
                  employeeId={slip.employeeId}
                  components={components}
                />
              </CardContent>
            </Card>
          </div>
        ) : adjustments.length ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {adjustments.map((a) => (
                  <li key={a.id}>
                    {a.label} {a.kind === "DEDUCTION" ? "−" : "+"}
                    {formatMoney(a.amount)}{" "}
                    <span className="text-xs text-muted-foreground">· {a.reason}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
