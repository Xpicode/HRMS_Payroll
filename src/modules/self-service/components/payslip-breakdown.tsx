import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import type { myPayslip } from "../service";
import { cn } from "@/lib/utils";

type Slip = NonNullable<Awaited<ReturnType<typeof myPayslip>>>;
type Line = Slip["lines"][number];

const UNIT_SHORT: Record<string, string> = { days: "d", hours: "h", minutes: "min" };

function basis(l: Line): string {
  if (l.quantity !== null) {
    const q = `${Number(l.quantity.toString())} ${l.unit ? (UNIT_SHORT[l.unit] ?? l.unit) : ""}`;
    return l.rate !== null ? `${q} × ${formatMoney(l.rate)}` : q;
  }
  return l.rate !== null ? formatMoney(l.rate) : "";
}

function Lines({
  title,
  lines,
  tone,
}: {
  title: string;
  lines: Line[];
  tone: "earning" | "deduction";
}) {
  const total = lines.reduce((sum, l) => sum + Number(l.amount.toString()), 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="pb-1.5 text-left font-medium">{title}</th>
          <th className="pb-1.5 text-right font-medium">Basis</th>
          <th className="pb-1.5 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td colSpan={3} className="py-3 text-center text-xs text-muted-foreground">
              None
            </td>
          </tr>
        ) : (
          lines.map((l) => (
            <tr key={l.id} className="border-t border-border/60">
              <td className="py-1.5 pr-2 align-top">
                <span className="font-medium">{l.label}</span>
                {l.isManual ? (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    adjustment
                  </Badge>
                ) : null}
                {l.note ? (
                  <span className="block text-[11px] text-muted-foreground">{l.note}</span>
                ) : null}
              </td>
              <td className="py-1.5 pr-2 text-right align-top text-xs text-muted-foreground tabular whitespace-nowrap">
                {basis(l)}
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
          ))
        )}
      </tbody>
      <tfoot>
        <tr className="border-t-2">
          <td colSpan={2} className="py-2 text-xs font-semibold uppercase">
            {tone === "earning" ? "Gross pay" : "Total deductions"}
          </td>
          <td
            className={cn(
              "py-2 text-right font-mono font-semibold tabular",
              tone === "deduction" && "text-destructive",
            )}
          >
            {formatMoney(total)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Earnings, deductions and net pay of one released payslip, from its stored lines. */
export function PayslipBreakdown({ slip }: { slip: Slip }) {
  const earnings = slip.lines.filter((l) => l.kind === "EARNING");
  const deductions = slip.lines.filter((l) => l.kind === "DEDUCTION");
  const negative = Number(slip.netPay) < 0;
  const s = slip.computation.input.summary;
  return (
    <div className="surface overflow-hidden rounded-2xl">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
        <Lines title="Earnings" lines={earnings} tone="earning" />
        <Lines title="Deductions" lines={deductions} tone="deduction" />
      </div>
      <div
        className={cn(
          "flex items-center justify-between border-t px-5 py-4 sm:px-6",
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
      <p className="border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">
        Attendance: {s.daysWorked} of {s.scheduledDays} scheduled days worked · {s.absentDays}{" "}
        absent · late {s.lateMinutes} min · undertime {s.undertimeMinutes} min · overtime{" "}
        {s.otHours} h · night differential {s.nightDiffHours} h.
      </p>
    </div>
  );
}
