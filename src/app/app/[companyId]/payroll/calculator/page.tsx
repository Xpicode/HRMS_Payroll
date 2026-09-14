import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatCutoff, nextCutoff, previousCutoff } from "@/lib/dates";
import { AppError } from "@/lib/action-result";
import { getPayFrequency, listEmployeesInCutoff } from "@/modules/attendance/service";
import { resolveCutoff } from "@/modules/attendance/cutoff-params";
import { calculatePayslip, type CalculatorResult } from "@/modules/payroll/service";
import { PayslipPreview } from "@/modules/payroll/components/payslip-preview";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { NativeSelect } from "@/components/form/native-select";

export const metadata: Metadata = { title: "Payroll calculator" };

type Search = { employee?: string; start?: string; end?: string; month?: string; half?: string };

export default async function PayrollCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "payroll.compute")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const frequency = await getPayFrequency(scope, companyId);
  const cutoff = resolveCutoff(frequency, sp);
  const employees = await listEmployeesInCutoff(scope, companyId, cutoff);
  const employeeId = sp.employee && isUuid(sp.employee) ? sp.employee : null;

  let result: CalculatorResult | null = null;
  let error: string | null = null;
  if (employeeId) {
    try {
      result = await calculatePayslip(scope, companyId, employeeId, cutoff);
    } catch (e) {
      if (e instanceof AppError) error = e.message;
      else throw e;
    }
  }

  const basePath = `/app/${companyId}/payroll/calculator`;
  const href = (c: { start: string; end: string }) =>
    `${basePath}?start=${c.start}&end=${c.end}${employeeId ? `&employee=${employeeId}` : ""}`;
  const prev = previousCutoff(frequency, cutoff);
  const next = nextCutoff(frequency, cutoff);

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Payroll calculator"
        description="Runs the payroll engine on the attendance summary and the pay setting, policy and statutory tables in force. Nothing is saved."
      />
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <form action={basePath} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="start" value={cutoff.start} />
            <input type="hidden" name="end" value={cutoff.end} />
            <label className="space-y-1.5 text-[13px]">
              <span className="block font-medium">Employee</span>
              <NativeSelect name="employee" defaultValue={employeeId ?? ""} className="w-72">
                <option value="" disabled>
                  Choose…
                </option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeNo} · {e.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button type="submit">Compute</Button>
          </form>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous cutoff"
              render={<Link href={href(prev)} />}
              nativeButton={false}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-36 text-center font-mono text-sm font-medium tabular">
              {formatCutoff(cutoff)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next cutoff"
              render={<Link href={href(next)} />}
              nativeButton={false}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      {result ? (
        <PayslipPreview result={result} />
      ) : !error ? (
        <p className="text-sm text-muted-foreground">
          Choose an employee and a cutoff to see the computed payslip lines.
        </p>
      ) : null}
    </>
  );
}
