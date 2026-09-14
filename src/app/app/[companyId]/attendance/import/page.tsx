import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { BiometricsWizard } from "@/modules/attendance/components/biometrics-wizard";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Import biometrics" };

export default async function ImportBiometricsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "attendance.import")) notFound();

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Import biometrics export"
        description="Each row is one punch pair for one employee on one day. Days are recomputed from the punches; existing manual entries for the same days are replaced."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <BiometricsWizard companyId={companyId} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>File format</CardTitle>
            <CardDescription>Header row required. Order does not matter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <dl className="space-y-1.5">
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono">employee_no</dt>
                <dd className="text-muted-foreground">Must exist in this company</dd>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono">date</dt>
                <dd className="text-muted-foreground">YYYY-MM-DD or M/D/YYYY</dd>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono">time_in</dt>
                <dd className="text-muted-foreground">HH:MM, HH:MM:SS or h:mm AM/PM</dd>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono">time_out</dt>
                <dd className="text-muted-foreground">
                  Same formats; before time_in means next day
                </dd>
              </div>
            </dl>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-[11px]">
              {`employee_no,date,time_in,time_out
DEMO-0001,2026-08-17,08:02,17:05
DEMO-0002,8/17/2026,7:55 AM,6:30 PM`}
            </pre>
            <p className="text-muted-foreground">
              <Link href={`/app/${companyId}/attendance`} className="underline">
                Back to attendance
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
