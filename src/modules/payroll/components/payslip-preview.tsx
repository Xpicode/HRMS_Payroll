import { AlertTriangleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { formatCutoff } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CalculatorResult } from "../service";
import type { PayslipLine } from "../engine";

const UNIT_SHORT = { days: "d", hours: "h", minutes: "min" } as const;

function LineRows({ lines, tone }: { lines: PayslipLine[]; tone: "earning" | "deduction" }) {
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
      {lines.map((l, i) => (
        <tr key={`${l.componentCode}-${i}`} className="border-t">
          <td className="py-1.5 pr-2 align-top">
            <span className="font-medium">{l.label}</span>
            {l.note ? (
              <span className="block text-[11px] text-muted-foreground">{l.note}</span>
            ) : null}
          </td>
          <td className="py-1.5 pr-2 text-right align-top text-xs text-muted-foreground tabular whitespace-nowrap">
            {l.quantity !== null
              ? `${l.quantity} ${l.unit ? UNIT_SHORT[l.unit] : ""}${l.rate !== null ? ` × ${formatMoney(l.rate)}` : ""}`
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

/** Lines and totals in the payslip's order — the calculator's read-only output. */
export function PayslipPreview({ result }: { result: CalculatorResult }) {
  const c = result.computation;
  const earnings = c.lines.filter((l) => l.kind === "EARNING");
  const deductions = c.lines.filter((l) => l.kind === "DEDUCTION");
  const s = result.summary;
  const negative = c.flags.some((f) => f.code === "NEGATIVE_NET");

  return (
    <div className="space-y-4">
      {c.flags.map((f) => (
        <Alert
          key={f.code}
          variant={f.code === "NEGATIVE_NET" ? "destructive" : undefined}
          className={
            f.code === "NEGATIVE_NET"
              ? undefined
              : "border-warning/40 bg-warning/5 text-warning-foreground"
          }
        >
          <AlertTriangleIcon />
          <AlertTitle>{f.code.replaceAll("_", " ").toLowerCase()}</AlertTitle>
          <AlertDescription>{f.message}</AlertDescription>
        </Alert>
      ))}

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{result.employee.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{result.employee.employeeNo}</span>
                {result.employee.position ? ` · ${result.employee.position}` : ""} ·{" "}
                {formatCutoff({
                  start: result.period.start,
                  end: result.period.end,
                  sequenceInMonth: result.period.sequenceInMonth,
                })}
              </p>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right text-xs">
              <dt className="text-muted-foreground">Daily rate</dt>
              <dd className="font-mono tabular">{formatMoney(c.rates.dailyRate)}</dd>
              <dt className="text-muted-foreground">Hourly rate</dt>
              <dd className="font-mono tabular">{formatMoney(c.rates.hourlyRate)}</dd>
              <dt className="text-muted-foreground">Days worked</dt>
              <dd className="font-mono tabular">{s.daysWorked}</dd>
              <dt className="text-muted-foreground">OT hours</dt>
              <dd className="font-mono tabular">{s.otHours}</dd>
            </dl>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 pt-4 md:grid-cols-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-1 text-left font-medium">Earnings</th>
                <th className="pb-1 text-right font-medium">Basis</th>
                <th className="pb-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <LineRows lines={earnings} tone="earning" />
            </tbody>
            <tfoot>
              <tr className="border-t-2">
                <td colSpan={2} className="py-2 text-xs font-semibold uppercase">
                  Gross pay
                </td>
                <td className="py-2 text-right font-mono font-semibold tabular">
                  {formatMoney(c.gross)}
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
              <LineRows lines={deductions} tone="deduction" />
            </tbody>
            <tfoot>
              <tr className="border-t-2">
                <td colSpan={2} className="py-2 text-xs font-semibold uppercase">
                  Total deductions
                </td>
                <td className="py-2 text-right font-mono font-semibold tabular text-destructive">
                  {formatMoney(c.totalDeductions)}
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
            {formatMoney(c.net)}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 text-xs text-muted-foreground md:grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-1 font-medium text-foreground">Basis</p>
          <p>
            {result.paySetting.payType === "MONTHLY"
              ? `Monthly ${formatMoney(result.paySetting.monthlyRate)}`
              : result.paySetting.payType === "DAILY"
                ? `Daily ${formatMoney(result.paySetting.dailyRate)}`
                : "Commission"}{" "}
            (pay setting from {result.paySetting.effectiveFrom})
          </p>
          <p>
            Policy from {result.policy.effectiveFrom}: {result.policy.workingDaysPerYear} days/yr,{" "}
            {result.policy.hoursPerDay} h/day, statutory{" "}
            {result.policy.statutoryTiming.toLowerCase().replaceAll("_", " ")}
          </p>
          <p>Monthly basic for contributions: {formatMoney(c.rates.monthlyBasic)}</p>
          <p>Taxable income this period: {formatMoney(c.taxableIncome)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-1 font-medium text-foreground">Attendance ({s.calendarDays} days)</p>
          <p>
            {s.daysWorked} worked · {s.absentDays} absent of {s.scheduledDays} scheduled
            {s.unrecordedDays ? ` (${s.unrecordedDays} unrecorded)` : ""}
          </p>
          <p>
            Late {s.lateMinutes} min · UT {s.undertimeMinutes} min · ND {s.nightDiffHours} h
          </p>
          <p>
            OT: reg {s.otHoursByType.REGULAR} · rest {s.otHoursByType.REST_DAY} · spec{" "}
            {s.otHoursByType.SPECIAL} · RH {s.otHoursByType.REGULAR_HOLIDAY} h
          </p>
          <p>
            Regular holidays: {s.regularHolidaysNotWorked} not worked · {s.regularHolidaysWorked}{" "}
            worked
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-1 font-medium text-foreground">Employer share (monthly)</p>
          <p>
            SSS {formatMoney(c.employer.sssEr)} + EC {formatMoney(c.employer.sssEc)}
            {c.employer.sssWispEr !== "0.00" ? ` (WISP ${formatMoney(c.employer.sssWispEr)})` : ""}
          </p>
          <p>PhilHealth {formatMoney(c.employer.philhealthEr)}</p>
          <p>Pag-IBIG {formatMoney(c.employer.pagibigEr)}</p>
          <p className="mt-1">
            Tables: SSS {result.effective.sss ?? "—"} · PhilHealth{" "}
            {result.effective.philhealth ?? "—"} · Pag-IBIG {result.effective.pagibig ?? "—"} · BIR{" "}
            {result.effective.tax ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
