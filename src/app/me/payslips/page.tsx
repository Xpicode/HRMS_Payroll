import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, DownloadIcon } from "lucide-react";
import { getScope } from "@/lib/session";
import { formatCutoff, formatDateOnly, toIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { myPayslips } from "@/modules/self-service/service";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My payslips" };

export default async function MyPayslipsPage() {
  const scope = await getScope();
  const payslips = await myPayslips(scope);

  return (
    <>
      <PageHeader
        eyebrow="Payslips"
        title="My payslips"
        description="Released pay periods only. Each payslip is frozen when payroll approves it; ask payroll if something looks wrong."
      />
      {payslips.length === 0 ? (
        <div className="surface rounded-2xl p-10 text-center text-sm text-muted-foreground">
          No released payslips yet.
        </div>
      ) : (
        <ul className="stagger space-y-2">
          {payslips.map((s) => {
            const thirteenth = s.payPeriod.type === "THIRTEENTH_MONTH";
            const title = thirteenth
              ? `13th month pay ${toIsoDate(s.payPeriod.coverageStart).slice(0, 4)}`
              : formatCutoff({
                  start: toIsoDate(s.payPeriod.coverageStart),
                  end: toIsoDate(s.payPeriod.coverageEnd),
                  sequenceInMonth: s.payPeriod.sequenceInMonth === 2 ? 2 : 1,
                });
            return (
              <li key={s.id} className="surface surface-hover rounded-2xl">
                <div className="flex items-center gap-3 p-4 sm:p-5">
                  <Link
                    href={`/me/payslips/${s.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{title}</span>
                        {s.finalPay ? <Badge variant="destructive">Final pay</Badge> : null}
                        {thirteenth ? <Badge>13th month</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Paid {formatDateOnly(s.payPeriod.payDate)}
                        {s.slipCode ? ` · slip ${s.slipCode}` : ""}
                        {" · gross "}
                        {formatMoney(s.grossPay)}
                        {" · deductions "}
                        {formatMoney(s.totalDeductions)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[10px] tracking-wider text-muted-foreground uppercase">
                        Net pay
                      </span>
                      <span className="font-mono text-lg font-semibold tabular text-success">
                        {formatMoney(s.netPay)}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                  {s.pdfPath ? (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Download PDF"
                      title="Download PDF"
                      render={<a href={`/api/files/me/payslips/${s.id}?download=1`} />}
                      nativeButton={false}
                    >
                      <DownloadIcon />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
