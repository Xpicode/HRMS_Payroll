import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatCutoff } from "@/lib/dates";
import { AppError } from "@/lib/action-result";
import { employeeDtr, employeeNeighbours, getPayFrequency } from "@/modules/attendance/service";
import { resolveCutoff } from "@/modules/attendance/cutoff-params";
import { CutoffPicker } from "@/modules/attendance/components/cutoff-picker";
import { DtrGrid } from "@/modules/attendance/components/dtr-grid";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Daily time record" };

type Search = { start?: string; end?: string; month?: string; half?: string; saved?: string };

export default async function EmployeeDtrPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const frequency = await getPayFrequency(scope, companyId);
  const cutoff = resolveCutoff(frequency, sp);

  let dtr: Awaited<ReturnType<typeof employeeDtr>>;
  try {
    dtr = await employeeDtr(scope, companyId, employeeId, cutoff);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const nav = await employeeNeighbours(scope, companyId, cutoff, employeeId);
  const canEdit = roleCan(user.role, "attendance.manage");
  const basePath = `/app/${companyId}/attendance`;
  const q = `start=${cutoff.start}&end=${cutoff.end}`;
  const e = dtr.employee;

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · ${e.employeeNo}`}
        title={`${e.lastName}, ${e.firstName}`}
        description={`Daily time record for ${formatCutoff(cutoff)}. Shift ${dtr.days[0]?.shift.start}–${dtr.days[0]?.shift.end}, ${dtr.ctx.hoursPerDay} h/day, grace ${dtr.ctx.lateGraceMinutes} min.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={`${basePath}?${q}`} />}
              nativeButton={false}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Cutoff
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!nav.prev}
              render={nav.prev ? <Link href={`${basePath}/${nav.prev.id}?${q}`} /> : undefined}
              nativeButton={!nav.prev}
              aria-label={nav.prev ? `Previous: ${nav.prev.name}` : "No previous employee"}
            >
              <ChevronLeftIcon data-icon="inline-start" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground tabular">
              {nav.index + 1} / {nav.total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!nav.next}
              render={nav.next ? <Link href={`${basePath}/${nav.next.id}?${q}`} /> : undefined}
              nativeButton={!nav.next}
              aria-label={nav.next ? `Next: ${nav.next.name}` : "No next employee"}
            >
              Next
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        }
      />
      {sp.saved ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>Attendance saved.</AlertTitle>
        </Alert>
      ) : null}
      <div className="mb-4">
        <CutoffPicker
          basePath={`${basePath}/${employeeId}`}
          cutoff={cutoff}
          frequency={frequency}
        />
      </div>
      <DtrGrid
        key={dtr.version}
        companyId={companyId}
        employeeId={employeeId}
        start={cutoff.start}
        end={cutoff.end}
        days={dtr.days}
        canEdit={canEdit}
      />
    </>
  );
}
