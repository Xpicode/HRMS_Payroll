import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatCutoff, formatDateOnly, toIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { canApprove, getPeriod, listPayslips } from "@/modules/payroll/service";
import { periodPdfStatus } from "@/modules/documents/service";
import { PdfPanel } from "@/modules/documents/components/pdf-panel";
import { isFrozen } from "@/modules/payroll/schema";
import {
  LifecycleButton,
  PayDateForm,
  RevertForm,
} from "@/modules/payroll/components/period-forms";
import { PeriodStatusBadge } from "@/modules/payroll/components/status-badge";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pay period" };

type Search = Partial<
  Record<
    | "created"
    | "computed"
    | "skipped"
    | "flagged"
    | "approved"
    | "payments"
    | "released"
    | "locked"
    | "reverted"
    | "saved"
    | "pdfs",
    string
  >
>;

const n2 = (v: { toString(): string }) => {
  const n = Number(v.toString());
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

export default async function PayPeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; periodId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId, periodId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "payroll.view")) notFound();
  if (!isUuid(periodId)) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const period = await getPeriod(scope, companyId, periodId);
  if (!period) notFound();
  const [payslips, approver, pdfs] = await Promise.all([
    listPayslips(scope, companyId, periodId),
    canApprove(scope, companyId, toIsoDate(period.coverageEnd)),
    periodPdfStatus(scope, companyId, periodId),
  ]);
  const canCompute = roleCan(user.role, "payroll.compute");
  const canRevert = roleCan(user.role, "payroll.revert");
  const frozen = isFrozen(period.status);
  const base = `/app/${companyId}/payroll`;
  const cutoff = {
    start: toIsoDate(period.coverageStart),
    end: toIsoDate(period.coverageEnd),
    sequenceInMonth: period.sequenceInMonth === 2 ? (2 as const) : (1 as const),
  };

  const totals = payslips.reduce(
    (t, p) => ({
      gross: t.gross + Number(p.grossPay),
      ded: t.ded + Number(p.totalDeductions),
      net: t.net + Number(p.netPay),
      flagged: t.flagged + (p.flags.length ? 1 : 0),
    }),
    { gross: 0, ded: 0, net: 0, flagged: 0 },
  );

  const notice = sp.created
    ? "Period created. Compute it to produce payslips."
    : sp.computed !== undefined
      ? `Computed ${sp.computed} payslip(s)${Number(sp.skipped) ? `, ${sp.skipped} skipped (no pay setting)` : ""}${Number(sp.flagged) ? `, ${sp.flagged} flagged` : ""}.`
      : sp.approved
        ? `Approved ${sp.approved} payslip(s); ${sp.payments ?? 0} loan payment(s) posted.`
        : sp.released
          ? "Period released."
          : sp.locked
            ? "Period locked."
            : sp.reverted
              ? "Period reverted to computed; loan payments reversed."
              : sp.saved === "paydate"
                ? "Pay date saved."
                : sp.pdfs
                  ? "PDF generation queued."
                  : null;

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · Payroll`}
        title={formatCutoff(cutoff)}
        description={`Pay date ${formatDateOnly(period.payDate)} · ${payslips.length} payslip(s)${period.approvedBy ? ` · approved by ${period.approvedBy.name}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodStatusBadge status={period.status} className="text-sm" />
            <Button variant="ghost" size="sm" render={<Link href={base} />} nativeButton={false}>
              <ArrowLeftIcon data-icon="inline-start" />
              Periods
            </Button>
          </div>
        }
      />

      {notice ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            {canCompute && !frozen ? (
              <PayDateForm
                companyId={companyId}
                periodId={periodId}
                payDate={toIsoDate(period.payDate)}
              />
            ) : null}
            {canCompute && !frozen ? (
              <LifecycleButton
                companyId={companyId}
                periodId={periodId}
                op="compute"
                label={period.status === "DRAFT" ? "Compute payslips" : "Recompute"}
                variant={period.status === "DRAFT" ? "default" : "outline"}
              />
            ) : null}
            {approver && period.status === "COMPUTED" ? (
              <LifecycleButton companyId={companyId} periodId={periodId} op="approve" />
            ) : null}
            {approver && period.status === "APPROVED" ? (
              <LifecycleButton companyId={companyId} periodId={periodId} op="release" />
            ) : null}
            {approver && period.status === "RELEASED" ? (
              <LifecycleButton
                companyId={companyId}
                periodId={periodId}
                op="lock"
                variant="outline"
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {canRevert && (period.status === "APPROVED" || period.status === "RELEASED") ? (
              <RevertForm companyId={companyId} periodId={periodId} />
            ) : null}
            {canCompute && !frozen ? (
              <LifecycleButton
                companyId={companyId}
                periodId={periodId}
                op="delete"
                variant="ghost"
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="mb-6">
        <PdfPanel
          companyId={companyId}
          periodId={periodId}
          status={pdfs}
          frozen={frozen}
          canGenerate={canCompute}
          hasPayslips={payslips.length > 0}
        />
      </div>

      {frozen ? (
        <Alert className="mb-4">
          <AlertTitle>Payslips are frozen.</AlertTitle>
          <AlertDescription>
            Slip codes and snapshots were assigned on approval; lines cannot change. Corrections
            need an administrator to revert the period to computed.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Slip</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">OT h</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    {period.status === "DRAFT" ? "Not computed yet." : "No payslips."}
                  </TableCell>
                </TableRow>
              ) : (
                payslips.map((p) => (
                  <TableRow key={p.id} className={cn(p.flags.length && "bg-warning/5")}>
                    <TableCell>
                      <Link
                        href={`${base}/${periodId}/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.employee.lastName}, {p.employee.firstName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.employee.employeeNo}</span>
                        {p.employee.department ? ` · ${p.employee.department}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.slipCode ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{n2(p.daysWorked)}</TableCell>
                    <TableCell className="text-right tabular">{n2(p.otHours)}</TableCell>
                    <TableCell className="text-right tabular">{formatMoney(p.grossPay)}</TableCell>
                    <TableCell className="text-right tabular">
                      {formatMoney(p.totalDeductions)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular",
                        Number(p.netPay) < 0 && "text-destructive",
                      )}
                    >
                      {formatMoney(p.netPay)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.flags.map((f) => (
                        <span
                          key={f.code}
                          title={f.message}
                          className={cn(
                            "mr-1 inline-block rounded px-1.5 py-0.5",
                            f.code === "NEGATIVE_NET"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/15 text-warning-foreground",
                          )}
                        >
                          {f.code.toLowerCase().replaceAll("_", " ")}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.pdfPath ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            render={
                              <a
                                href={`/api/files/payslips/${companyId}/${periodId}/${p.pdfPath.split("/").pop()}?download=1`}
                              />
                            }
                            nativeButton={false}
                            aria-label="Download PDF"
                          >
                            PDF
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`${base}/${periodId}/${p.id}`} />}
                          nativeButton={false}
                        >
                          {frozen ? "View" : "Lines & adjust"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {payslips.length ? (
              <tfoot className="border-t bg-muted/40 text-xs">
                <tr className="[&>td]:px-2 [&>td]:py-2">
                  <td colSpan={4} className="text-muted-foreground">
                    {payslips.length} payslips · {totals.flagged} flagged
                  </td>
                  <td className="text-right tabular">{formatMoney(totals.gross.toFixed(2))}</td>
                  <td className="text-right tabular">{formatMoney(totals.ded.toFixed(2))}</td>
                  <td className="text-right font-medium tabular">
                    {formatMoney(totals.net.toFixed(2))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
