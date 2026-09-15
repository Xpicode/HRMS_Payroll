import type { Metadata } from "next";
import { getScope } from "@/lib/session";
import { formatCutoff } from "@/lib/dates";
import { myDtr, portalContext } from "@/modules/self-service/service";
import { resolveCutoff } from "@/modules/attendance/cutoff-params";
import { CutoffPicker } from "@/modules/attendance/components/cutoff-picker";
import { DtrTable } from "@/modules/self-service/components/dtr-table";
import { PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = { title: "My attendance" };

type Search = { start?: string; end?: string; month?: string; half?: string };

export default async function MyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const scope = await getScope();
  const sp = await searchParams;
  const p = await portalContext(scope);
  const cutoff = resolveCutoff(p.company.payFrequency, sp);
  const { days, summary, ctx } = await myDtr(scope, cutoff);
  const holidays = [...ctx.holidays.entries()];

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="My attendance"
        description={`Your daily time record for ${formatCutoff(cutoff)} as encoded by HR. Tell HR if a day is wrong; you cannot edit it here.`}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CutoffPicker
          basePath="/me/attendance"
          cutoff={cutoff}
          frequency={p.company.payFrequency}
        />
        {holidays.length ? (
          <p className="text-xs text-muted-foreground">
            {holidays.map(([d, h]) => `${d.slice(8)} ${h.name}`).join(" · ")}
          </p>
        ) : null}
      </div>
      <DtrTable days={days} summary={summary} />
    </>
  );
}
