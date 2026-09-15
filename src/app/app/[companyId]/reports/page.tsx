import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { todayInManila } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  buildReport,
  filterRange,
  filterSchema,
  REPORT_KEYS,
  REPORT_LABELS,
  type ReportKey,
} from "@/modules/reports/service";
import { PERIOD_STATUS_LABELS } from "@/modules/payroll/schema";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Search = { report?: string; year?: string; month?: string };

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "reports.view")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const today = todayInManila();
  const key: ReportKey = (REPORT_KEYS as readonly string[]).includes(sp.report ?? "")
    ? (sp.report as ReportKey)
    : "sss";
  const annual = key === "annual" || key === "alphalist";
  const parsed = filterSchema.safeParse({
    year: sp.year ?? today.slice(0, 4),
    month: annual ? "" : (sp.month ?? String(Number(today.slice(5, 7)))),
  });
  const filter = parsed.success
    ? parsed.data
    : { year: Number(today.slice(0, 4)), month: annual ? undefined : Number(today.slice(5, 7)) };
  const range = filterRange(filter);
  const report = await buildReport(scope, companyId, key, filter);
  const base = `/app/${companyId}/reports`;
  const qs = (k: ReportKey) =>
    `${base}?report=${k}&year=${filter.year}${filter.month && k !== "annual" && k !== "alphalist" ? `&month=${filter.month}` : ""}`;
  const csvHref = `/api/reports/${companyId}/${key}?year=${filter.year}${filter.month ? `&month=${filter.month}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Government reports"
        description="Built from approved payslips only; every total is the sum of the matching payslip lines. Draft or computed periods in the range are listed below and excluded."
        actions={
          <Button render={<a href={csvHref} />} nativeButton={false}>
            <DownloadIcon data-icon="inline-start" />
            Download CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Report">
          {REPORT_KEYS.map((k) => (
            <Link
              key={k}
              href={qs(k)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm",
                k === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {REPORT_LABELS[k]}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="report" value={key} />
          <select
            name="year"
            defaultValue={filter.year}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            aria-label="Year"
          >
            {Array.from({ length: 6 }, (_, i) => Number(today.slice(0, 4)) - 3 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {!annual ? (
            <select
              name="month"
              defaultValue={filter.month ?? ""}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              aria-label="Month"
            >
              <option value="">Whole year</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          ) : null}
          <Button type="submit" variant="outline" size="sm">
            Show
          </Button>
        </form>
      </div>

      {report.excluded.length ? (
        <Alert className="mb-4">
          <AlertTitle>
            {report.excluded.length} period(s) in {range.label} are not approved and are excluded.
          </AlertTitle>
          <AlertDescription>
            {report.excluded
              .map(
                (p) =>
                  `${p.type === "THIRTEENTH_MONTH" ? "13th month" : `${p.start} – ${p.end}`} (${PERIOD_STATUS_LABELS[p.status]})`,
              )
              .join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}
      {(report.key === "annual" || report.key === "alphalist") && !report.hasTaxTable ? (
        <Alert className="mb-4">
          <AlertTitle>
            No annual tax table is in force for {filter.year}; tax due is blank.
          </AlertTitle>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {REPORT_LABELS[key]} — {range.label}
          </CardTitle>
          <CardDescription>
            {report.included.length} approved period(s) ·{" "}
            {report.included
              .map((p) =>
                p.type === "THIRTEENTH_MONTH"
                  ? "13th month"
                  : `${p.start.slice(5)}–${p.end.slice(8)}`,
              )
              .join(", ") || "none"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ReportTable report={report} />
        </CardContent>
      </Card>
    </>
  );
}

const R = ({ v }: { v: string | null }) => (
  <TableCell className="text-right tabular">{v === null ? "—" : formatMoney(v)}</TableCell>
);

function ReportTable({ report }: { report: Awaited<ReturnType<typeof buildReport>> }) {
  switch (report.key) {
    case "sss":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SSS No</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">EE</TableHead>
              <TableHead className="text-right">ER</TableHead>
              <TableHead className="text-right">EC</TableHead>
              <TableHead className="text-right">of which WISP ER</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.data.rows.length === 0 ? <Empty cols={7} /> : null}
            {report.data.rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell className="font-mono text-xs">{r.sssNo || "—"}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <R v={r.ee} />
                <R v={r.er} />
                <R v={r.ec} />
                <R v={r.wispEr} />
                <R v={r.total} />
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={2}>TOTAL</TableCell>
              <R v={report.data.totals.ee} />
              <R v={report.data.totals.er} />
              <R v={report.data.totals.ec} />
              <R v={report.data.totals.wispEr} />
              <R v={report.data.totals.total} />
            </TableRow>
          </TableBody>
        </Table>
      );
    case "philhealth":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PhilHealth No</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Monthly basic</TableHead>
              <TableHead className="text-right">EE</TableHead>
              <TableHead className="text-right">ER</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.data.rows.length === 0 ? <Empty cols={6} /> : null}
            {report.data.rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell className="font-mono text-xs">{r.philhealthNo || "—"}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <R v={r.monthlyBasic} />
                <R v={r.ee} />
                <R v={r.er} />
                <R v={r.total} />
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={3}>TOTAL</TableCell>
              <R v={report.data.totals.ee} />
              <R v={report.data.totals.er} />
              <R v={report.data.totals.total} />
            </TableRow>
          </TableBody>
        </Table>
      );
    case "pagibig":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pag-IBIG MID</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>TIN</TableHead>
              <TableHead className="text-right">EE</TableHead>
              <TableHead className="text-right">ER</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.data.rows.length === 0 ? <Empty cols={6} /> : null}
            {report.data.rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell className="font-mono text-xs">{r.pagibigMid || "—"}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.tin || "—"}</TableCell>
                <R v={r.ee} />
                <R v={r.er} />
                <R v={r.total} />
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={3}>TOTAL</TableCell>
              <R v={report.data.totals.ee} />
              <R v={report.data.totals.er} />
              <R v={report.data.totals.total} />
            </TableRow>
          </TableBody>
        </Table>
      );
    case "1601c":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TIN</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Gross compensation</TableHead>
              <TableHead className="text-right">Statutory (EE)</TableHead>
              <TableHead className="text-right">Other non-taxable</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Tax withheld</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.data.rows.length === 0 ? <Empty cols={7} /> : null}
            {report.data.rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell className="font-mono text-xs">{r.tin || "—"}</TableCell>
                <TableCell className="font-medium">
                  {r.name}
                  {r.minimumWage ? (
                    <span className="ml-2 text-[10px] text-muted-foreground uppercase">MWE</span>
                  ) : null}
                </TableCell>
                <R v={r.gross} />
                <R v={r.statutory} />
                <R v={r.nonTaxable} />
                <R v={r.taxable} />
                <R v={r.withheld} />
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={2}>TOTAL · {report.data.totals.employees} employee(s)</TableCell>
              <R v={report.data.totals.gross} />
              <R v={report.data.totals.statutory} />
              <R v={report.data.totals.nonTaxable} />
              <R v={report.data.totals.taxable} />
              <R v={report.data.totals.withheld} />
            </TableRow>
          </TableBody>
        </Table>
      );
    case "annual":
    case "alphalist":
      return (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TIN</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">13th month</TableHead>
                <TableHead className="text-right">Non-taxable 13th</TableHead>
                <TableHead className="text-right">Statutory (EE)</TableHead>
                <TableHead className="text-right">Other non-taxable</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">Withheld</TableHead>
                <TableHead className="text-right">Tax due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.data.rows.length === 0 ? <Empty cols={11} /> : null}
              {report.data.rows.map((r) => (
                <TableRow key={r.employeeId}>
                  <TableCell className="font-mono text-xs">{r.tin || "—"}</TableCell>
                  <TableCell className="font-medium">
                    {r.name}
                    <span className="block text-[11px] text-muted-foreground">
                      {r.employeeNo} · {r.periods} payslip(s){r.minimumWage ? " · MWE" : ""}
                    </span>
                  </TableCell>
                  <R v={r.gross} />
                  <R v={r.basic} />
                  <R v={r.thirteenthMonth} />
                  <R v={r.thirteenthNonTaxable} />
                  <R v={r.statutory} />
                  <R v={r.otherNonTaxable} />
                  <R v={r.taxable} />
                  <R v={r.withheld} />
                  <R v={r.taxDue} />
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>
                  TOTAL · {report.data.totals.employees} employee(s)
                </TableCell>
                <R v={report.data.totals.gross} />
                <R v={report.data.totals.basic} />
                <R v={report.data.totals.thirteenthMonth} />
                <R v={report.data.totals.thirteenthNonTaxable} />
                <R v={report.data.totals.statutory} />
                <R v={report.data.totals.otherNonTaxable} />
                <R v={report.data.totals.taxable} />
                <R v={report.data.totals.withheld} />
                <R v={report.data.totals.taxDue} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      );
  }
}

function Empty({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        No approved payslips in this range.
      </TableCell>
    </TableRow>
  );
}
