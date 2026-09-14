import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { CSV_COLUMNS } from "@/modules/employees/schema";
import { ImportWizard } from "@/modules/employees/components/import-wizard";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Import employees" };

export default async function ImportEmployeesPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "employees.import")) notFound();

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Import employees from CSV"
        description="Each row creates one employee with an initial pay setting. Rows are checked first; the import is all-or-nothing."
        actions={
          <Button
            variant="outline"
            render={<a href={`/app/${companyId}/employees/import/template`} />}
            nativeButton={false}
          >
            <DownloadIcon data-icon="inline-start" />
            Download template
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ImportWizard companyId={companyId} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Columns</CardTitle>
            <CardDescription>
              Header names must match. Order does not matter. Dates are YYYY-MM-DD.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-xs">
              {CSV_COLUMNS.map((c) => (
                <div key={c.key} className="grid grid-cols-[minmax(0,11rem)_1fr] gap-2">
                  <dt className="font-mono">
                    {c.key}
                    {c.required ? <span className="text-destructive">*</span> : null}
                  </dt>
                  <dd className="text-muted-foreground">{c.hint}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              <Link href={`/app/${companyId}/employees`} className="underline">
                Back to employees
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
