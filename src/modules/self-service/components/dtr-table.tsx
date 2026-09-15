import { WEEKDAY_SHORT } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DAY_TYPE_LABELS, DAY_TYPE_SHORT } from "@/modules/attendance/schema";
import type { GridDay } from "@/modules/attendance/service";
import type { CutoffSummary } from "@/modules/attendance/types";
import { cn } from "@/lib/utils";

const n2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const min = (n: number) => (n ? `${n}` : "");
const hrs = (n: number) => (n ? n2(n) : "");

/** Read-only view of one cutoff, for the employee portal. */
export function DtrTable({ days, summary }: { days: GridDay[]; summary: CutoffSummary }) {
  const stats = [
    { label: "Days worked", value: n2(summary.daysWorked) },
    { label: "Absent", value: n2(summary.absentDays), warn: summary.absentDays > 0 },
    { label: "Late (min)", value: String(summary.lateMinutes), warn: summary.lateMinutes > 0 },
    { label: "Undertime (min)", value: String(summary.undertimeMinutes) },
    { label: "Overtime (h)", value: n2(summary.otHours) },
    { label: "Night diff (h)", value: n2(summary.nightDiffHours) },
  ];
  return (
    <div className="space-y-4">
      <div className="stagger grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {stats.map((s) => (
          <div key={s.label} className="surface rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p
              className={cn(
                "mt-0.5 font-mono text-lg font-semibold tabular",
                s.warn && "text-warning",
              )}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div className="surface overflow-hidden rounded-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Late</TableHead>
              <TableHead className="text-right">UT</TableHead>
              <TableHead className="text-right">OT</TableHead>
              <TableHead className="text-right">ND</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((d) => {
              const r = d.record;
              const type = r?.dayType ?? d.defaultDayType;
              const rest = type === "REST_DAY";
              const leave = type === "LEAVE_WITH_PAY" || type === "LEAVE_WITHOUT_PAY";
              const absent = r?.isAbsent ?? false;
              return (
                <TableRow
                  key={d.date}
                  className={cn(
                    rest && "text-muted-foreground",
                    absent && "bg-destructive/5",
                    d.holidayName && "bg-primary/5",
                  )}
                >
                  <TableCell className="font-mono tabular whitespace-nowrap">
                    <span className="font-medium">{d.date.slice(8)}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {WEEKDAY_SHORT[d.weekday]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={leave ? "default" : rest ? "outline" : "secondary"}
                      title={DAY_TYPE_LABELS[type]}
                    >
                      {DAY_TYPE_SHORT[type]}
                    </Badge>
                    {d.holidayName ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {d.holidayName}
                      </span>
                    ) : null}
                  </TableCell>
                  {absent ? (
                    <TableCell colSpan={7} className="text-sm font-medium text-destructive">
                      Absent
                    </TableCell>
                  ) : !r ? (
                    <TableCell colSpan={7} className="text-xs text-muted-foreground">
                      {rest || leave || d.holidayName ? "" : "Not recorded"}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="font-mono tabular">{r.timeIn ?? ""}</TableCell>
                      <TableCell className="font-mono tabular">{r.timeOut ?? ""}</TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {hrs(r.hoursWorked)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular text-warning">
                        {min(r.lateMinutes)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {min(r.undertimeMinutes)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {hrs(r.otHours)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {hrs(r.nightDiffHours)}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {r?.remarks ?? ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
