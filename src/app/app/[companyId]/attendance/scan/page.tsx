import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { getPayFrequency, listEmployeesInCutoff } from "@/modules/attendance/service";
import { resolveCutoff } from "@/modules/attendance/cutoff-params";
import { CutoffPicker } from "@/modules/attendance/components/cutoff-picker";
import { CardScanWizard } from "@/modules/attendance/components/card-scan-wizard";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Scan DTR cards" };

type Search = { start?: string; end?: string; month?: string; half?: string; saved?: string };

export default async function ScanCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "attendance.import")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const frequency = await getPayFrequency(scope, companyId);
  const cutoff = resolveCutoff(frequency, sp);
  const employees = await listEmployeesInCutoff(scope, companyId, cutoff);

  const savedIndex =
    sp.saved && isUuid(sp.saved) ? employees.findIndex((e) => e.id === sp.saved) : -1;
  const saved = savedIndex >= 0 ? employees[savedIndex] : null;
  // after a save, move the picker to the next employee so cards can be scanned in a run
  const nextEmployee = savedIndex >= 0 ? (employees[savedIndex + 1] ?? saved) : undefined;
  const basePath = `/app/${companyId}/attendance`;
  const q = `start=${cutoff.start}&end=${cutoff.end}`;

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Scan DTR cards"
        description="Photograph or scan each employee's bundy card. The punches are read into the grid for you to check before saving."
        actions={
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={`${basePath}?${q}`} />}
            nativeButton={false}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Attendance
          </Button>
        }
      />
      {saved ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>Saved scanned attendance for {saved.name}.</AlertTitle>
        </Alert>
      ) : null}
      <div className="mb-4">
        <CutoffPicker basePath={`${basePath}/scan`} cutoff={cutoff} frequency={frequency} />
      </div>
      <CardScanWizard
        key={`${cutoff.start}:${sp.saved ?? ""}`}
        companyId={companyId}
        start={cutoff.start}
        end={cutoff.end}
        employees={employees}
        defaultEmployeeId={nextEmployee?.id}
        canSave={roleCan(user.role, "attendance.manage")}
      />
    </>
  );
}
