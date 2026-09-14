import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalculatorIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { formatCutoff, formatDateOnly, toIsoDate } from "@/lib/dates";
import { getPayFrequency } from "@/modules/attendance/service";
import { listPeriods, nextPeriodCutoff } from "@/modules/payroll/service";
import { CreatePeriodForms } from "@/modules/payroll/components/period-forms";
import { PeriodStatusBadge } from "@/modules/payroll/components/status-badge";
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
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "payroll.view")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const [periods, frequency, next] = await Promise.all([
    listPeriods(scope, companyId),
    getPayFrequency(scope, companyId),
    nextPeriodCutoff(scope, companyId),
  ]);
  const canCompute = roleCan(user.role, "payroll.compute");
  const base = `/app/${companyId}/payroll`;

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Payroll"
        description="Pay periods: compute payslips from attendance, review, approve (freeze), release and lock."
        actions={
          <Button
            variant="outline"
            render={<Link href={`${base}/calculator`} />}
            nativeButton={false}
          >
            <CalculatorIcon data-icon="inline-start" />
            Calculator
          </Button>
        }
      />
      {sp.deleted ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>Period deleted.</AlertTitle>
        </Alert>
      ) : null}

      {canCompute ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New pay period</CardTitle>
            <CardDescription>
              Cutoffs follow the company pay frequency. A period starts as a draft; compute it to
              produce payslips.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreatePeriodForms companyId={companyId} nextCutoff={next} frequency={frequency} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coverage</TableHead>
                <TableHead>Pay date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Payslips</TableHead>
                <TableHead>Computed</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No pay periods yet.
                  </TableCell>
                </TableRow>
              ) : (
                periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`${base}/${p.id}`} className="font-medium hover:underline">
                        {formatCutoff({
                          start: toIsoDate(p.coverageStart),
                          end: toIsoDate(p.coverageEnd),
                          sequenceInMonth: p.sequenceInMonth === 2 ? 2 : 1,
                        })}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular">{formatDateOnly(p.payDate)}</TableCell>
                    <TableCell>
                      <PeriodStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right tabular">{p._count.payslips}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.computedAt
                        ? p.computedAt.toISOString().slice(0, 16).replace("T", " ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.approvedAt ? p.approvedAt.toISOString().slice(0, 10) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`${base}/${p.id}`} />}
                        nativeButton={false}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
