import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { todayInManila } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { annualize } from "@/modules/yearend/service";
import { ApplyAnnualizationForm } from "@/modules/yearend/components/apply-form";
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

export const metadata: Metadata = { title: "Year-end" };

export default async function YearEndPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ year?: string; applied?: string; cleared?: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "payroll.compute")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const current = Number(todayInManila().slice(0, 4));
  const parsedYear = Number(sp.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : current;
  const a = await annualize(scope, companyId, year);
  const base = `/app/${companyId}/payroll`;
  const periodLabel = a.lastPeriod ? `${a.lastPeriod.start} – ${a.lastPeriod.end}` : null;
  const canApply =
    a.hasTaxTable && a.lastPeriod !== null && !a.lastPeriod.frozen && a.rows.length > 0;

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · Payroll`}
        title={`Year-end annualization ${year}`}
        description="Annual tax due (annual table) against the tax withheld through the year, per employee. Apply writes a refund or additional-tax line into the last unapproved period of the year."
        actions={
          <div className="flex items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              <select
                name="year"
                defaultValue={year}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                aria-label="Year"
              >
                {Array.from({ length: 5 }, (_, i) => current - 3 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm">
                Show
              </Button>
            </form>
            <Button variant="ghost" size="sm" render={<Link href={base} />} nativeButton={false}>
              <ArrowLeftIcon data-icon="inline-start" />
              Periods
            </Button>
          </div>
        }
      />

      {sp.applied !== undefined ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>
            Applied {sp.applied} adjustment(s){Number(sp.cleared) ? `, cleared ${sp.cleared}` : ""}{" "}
            and recomputed {periodLabel ?? "the last period"}.
          </AlertTitle>
        </Alert>
      ) : null}
      {!a.hasTaxTable ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>No annual tax table is in force for {year}.</AlertTitle>
          <AlertDescription>
            Seed the ANNUAL rows (pnpm db:seed) before annualizing.
          </AlertDescription>
        </Alert>
      ) : null}
      {a.lastPeriod ? (
        <Alert className="mb-4">
          <AlertTitle>
            Last period of {year}: {periodLabel} ·{" "}
            {PERIOD_STATUS_LABELS[a.lastPeriod.status as keyof typeof PERIOD_STATUS_LABELS]}
          </AlertTitle>
          <AlertDescription>
            {a.lastPeriod.frozen
              ? "It is approved, so nothing can be applied. Create the year's final period (or have an admin revert this one) first."
              : "Adjustments are written here. Figures from unapproved periods are provisional and change if those periods are recomputed."}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-4">
          <AlertTitle>No computed regular period ends in {year}.</AlertTitle>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Per employee</CardTitle>
            <CardDescription>
              Taxable = Σ taxable income of regular payslips + 13th-month excess over ₱90,000.
              Difference = due − withheld (negative = refund).
            </CardDescription>
          </div>
          <ApplyAnnualizationForm
            companyId={companyId}
            year={year}
            disabled={!canApply}
            periodLabel={periodLabel}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Payslips</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">13th excess</TableHead>
                <TableHead className="text-right">Tax due</TableHead>
                <TableHead className="text-right">Withheld</TableHead>
                <TableHead className="text-right">Difference</TableHead>
                <TableHead className="text-right">Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No payslips in {year}.
                  </TableCell>
                </TableRow>
              ) : (
                a.rows.map((r) => {
                  const diff = Number(r.difference);
                  return (
                    <TableRow key={r.employeeId}>
                      <TableCell>
                        <span className="font-medium">{r.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {r.employeeNo}
                          {r.tin ? ` · TIN ${r.tin}` : ""}
                          {r.minimumWage ? " · MWE (exempt)" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {r.periods}
                        {r.provisional ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({r.provisional} provisional)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular">{formatMoney(r.taxable)}</TableCell>
                      <TableCell className="text-right tabular">
                        {formatMoney(r.thirteenthExcess)}
                      </TableCell>
                      <TableCell className="text-right tabular">{formatMoney(r.due)}</TableCell>
                      <TableCell className="text-right tabular">
                        {formatMoney(r.withheld)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular",
                          diff < 0 && "text-success",
                          diff > 0 && "text-destructive",
                        )}
                      >
                        {diff < 0
                          ? `refund ${formatMoney(-diff)}`
                          : diff > 0
                            ? `+${formatMoney(diff)}`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular">
                        {r.applied === null
                          ? "—"
                          : Number(r.applied) < 0
                            ? `refund ${formatMoney(-Number(r.applied))}`
                            : `+${formatMoney(r.applied)}`}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              <TableRow className="font-semibold">
                <TableCell colSpan={4}>TOTAL</TableCell>
                <TableCell className="text-right tabular">{formatMoney(a.totals.due)}</TableCell>
                <TableCell className="text-right tabular">
                  {formatMoney(a.totals.withheld)}
                </TableCell>
                <TableCell className="text-right text-xs tabular">
                  refunds {formatMoney(a.totals.refunds)} · additional{" "}
                  {formatMoney(a.totals.additional)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
