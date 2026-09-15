import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, DownloadIcon, PrinterIcon } from "lucide-react";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { formatCutoff, formatDateOnly, toIsoDate } from "@/lib/dates";
import { myPayslip } from "@/modules/self-service/service";
import { PayslipBreakdown } from "@/modules/self-service/components/payslip-breakdown";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Payslip" };

export default async function MyPayslipPage({
  params,
}: {
  params: Promise<{ payslipId: string }>;
}) {
  const { payslipId } = await params;
  if (!isUuid(payslipId)) notFound();
  const slip = await myPayslip(await getScope(), payslipId);
  if (!slip) notFound();
  const thirteenth = slip.payPeriod.type === "THIRTEENTH_MONTH";
  const title = thirteenth
    ? `13th month pay ${toIsoDate(slip.payPeriod.coverageStart).slice(0, 4)}`
    : formatCutoff({
        start: toIsoDate(slip.payPeriod.coverageStart),
        end: toIsoDate(slip.payPeriod.coverageEnd),
        sequenceInMonth: slip.payPeriod.sequenceInMonth === 2 ? 2 : 1,
      });
  const pdf = slip.pdfPath ? `/api/files/me/payslips/${slip.id}` : null;

  return (
    <>
      <PageHeader
        eyebrow={slip.slipCode ? `Slip ${slip.slipCode}` : "Payslip"}
        title={title}
        description={`Pay date ${formatDateOnly(slip.payPeriod.payDate)} · ${slip.employee.employeeNo}${slip.employee.position ? ` · ${slip.employee.position}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {slip.finalPay ? <Badge variant="destructive">Final pay</Badge> : null}
            {pdf ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href={pdf} target="_blank" rel="noopener" />}
                  nativeButton={false}
                >
                  <PrinterIcon data-icon="inline-start" />
                  Print
                </Button>
                <Button size="sm" render={<a href={`${pdf}?download=1`} />} nativeButton={false}>
                  <DownloadIcon data-icon="inline-start" />
                  PDF
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/me/payslips" />}
              nativeButton={false}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              All payslips
            </Button>
          </div>
        }
      />
      <PayslipBreakdown slip={slip} />
      {!pdf ? (
        <p className="mt-4 text-xs text-muted-foreground">
          The printable PDF is not ready yet. Check back later or ask payroll.
        </p>
      ) : null}
    </>
  );
}
