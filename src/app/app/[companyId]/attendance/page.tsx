import type { Metadata } from "next";
import Link from "next/link";
import { ScanLineIcon, UploadIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { formatCutoff } from "@/lib/dates";
import { cutoffOverview, getPayFrequency } from "@/modules/attendance/service";
import { resolveCutoff } from "@/modules/attendance/cutoff-params";
import { CutoffPicker } from "@/modules/attendance/components/cutoff-picker";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };

type Search = {
  start?: string;
  end?: string;
  month?: string;
  half?: string;
  imported?: string;
  employees?: string;
};

const n2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  const sp = await searchParams;
  const scope = await getScope();
  const frequency = await getPayFrequency(scope, companyId);
  const cutoff = resolveCutoff(frequency, sp);
  const { ctx, rows } = await cutoffOverview(scope, companyId, cutoff);
  const canImport = roleCan(user.role, "attendance.import");
  const basePath = `/app/${companyId}/attendance`;
  const q = `start=${cutoff.start}&end=${cutoff.end}`;
  const imported = Number(sp.imported);

  const holidays = [...ctx.holidays.entries()];
  const totals = rows.reduce(
    (t, r) => ({
      daysWorked: t.daysWorked + r.summary.daysWorked,
      absent: t.absent + r.summary.absentDays,
      unrecorded: t.unrecorded + r.summary.unrecordedDays,
      late: t.late + r.summary.lateMinutes,
      ut: t.ut + r.summary.undertimeMinutes,
      ot: t.ot + r.summary.otHours,
      nd: t.nd + r.summary.nightDiffHours,
    }),
    { daysWorked: 0, absent: 0, unrecorded: 0, late: 0, ut: 0, ot: 0, nd: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Attendance"
        description={`Daily time records and the cutoff summary the payroll engine reads. ${ctx.days.length} days, ${holidays.length} holiday(s).`}
        actions={
          canImport ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                render={<Link href={`${basePath}/scan?${q}`} />}
                nativeButton={false}
              >
                <ScanLineIcon data-icon="inline-start" />
                Scan DTR cards
              </Button>
              <Button
                variant="outline"
                render={<Link href={`${basePath}/import`} />}
                nativeButton={false}
              >
                <UploadIcon data-icon="inline-start" />
                Import biometrics
              </Button>
            </div>
          ) : null
        }
      />

      {Number.isInteger(imported) && imported > 0 ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>
            Imported {imported} day(s) for {sp.employees ?? "?"} employee(s).
          </AlertTitle>
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CutoffPicker basePath={basePath} cutoff={cutoff} frequency={frequency} />
        {holidays.length ? (
          <p className="text-xs text-muted-foreground">
            {holidays.map(([d, h]) => `${d.slice(8)} ${h.name}`).join(" · ")}
          </p>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Recorded</TableHead>
                <TableHead className="text-right">Worked</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Late</TableHead>
                <TableHead className="text-right">UT</TableHead>
                <TableHead className="text-right">OT Reg</TableHead>
                <TableHead className="text-right">OT Rest</TableHead>
                <TableHead className="text-right">OT Spec</TableHead>
                <TableHead className="text-right">OT RH</TableHead>
                <TableHead className="text-right">ND</TableHead>
                <TableHead className="text-right">RH n/w</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="py-10 text-center text-muted-foreground">
                    No employees in {formatCutoff(cutoff)}.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const s = r.summary;
                  const incomplete = s.unrecordedDays > 0;
                  return (
                    <TableRow key={r.employeeId} className={cn(incomplete && "bg-warning/5")}>
                      <TableCell>
                        <Link
                          href={`${basePath}/${r.employeeId}?${q}`}
                          className="font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{r.employeeNo}</span>
                          {r.department ? ` · ${r.department}` : ""}
                        </p>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular",
                          incomplete && "text-warning-foreground",
                        )}
                      >
                        {r.recordedDays}/{s.calendarDays}
                      </TableCell>
                      <TableCell className="text-right tabular">{s.daysWorked}</TableCell>
                      <TableCell
                        className={cn("text-right tabular", s.absentDays > 0 && "text-destructive")}
                      >
                        {s.absentDays}
                        {s.unrecordedDays > 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            {" "}
                            ({s.unrecordedDays} unrec.)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular">{s.lateMinutes || ""}</TableCell>
                      <TableCell className="text-right tabular">
                        {s.undertimeMinutes || ""}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {s.otHoursByType.REGULAR ? n2(s.otHoursByType.REGULAR) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {s.otHoursByType.REST_DAY ? n2(s.otHoursByType.REST_DAY) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {s.otHoursByType.SPECIAL ? n2(s.otHoursByType.SPECIAL) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {s.otHoursByType.REGULAR_HOLIDAY ? n2(s.otHoursByType.REGULAR_HOLIDAY) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {s.nightDiffHours ? n2(s.nightDiffHours) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {s.regularHolidaysNotWorked || ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`${basePath}/${r.employeeId}?${q}`} />}
                          nativeButton={false}
                        >
                          Encode
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {rows.length ? (
              <tfoot className="border-t bg-muted/40 text-xs">
                <tr className="[&>td]:px-2 [&>td]:py-2">
                  <td className="text-muted-foreground">{rows.length} employees</td>
                  <td className="text-right tabular text-muted-foreground">
                    {totals.unrecorded ? `${totals.unrecorded} unrec.` : "complete"}
                  </td>
                  <td className="text-right tabular">{totals.daysWorked}</td>
                  <td className="text-right tabular">{totals.absent}</td>
                  <td className="text-right tabular">{totals.late}</td>
                  <td className="text-right tabular">{totals.ut}</td>
                  <td colSpan={4} className="text-right tabular">
                    {n2(totals.ot)} total OT
                  </td>
                  <td className="text-right tabular">{n2(totals.nd)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </Table>
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Unrecorded scheduled days count as absences until encoded. Rest days and holidays come from
        each employee&apos;s pay setting and the holiday calendar; a day&apos;s type can be
        overridden in the grid (e.g. a swapped rest day).
      </p>
    </>
  );
}
