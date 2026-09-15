import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany, requirePermission } from "@/lib/session";
import { getCompany } from "@/modules/companies/service";
import { toIsoDate, todayInManila, formatDateOnly } from "@/lib/dates";
import { PageHeader } from "@/components/app-shell/page-header";
import { CompanyForm } from "@/modules/companies/components/company-form";
import { LogoUploader } from "@/modules/companies/components/logo-uploader";
import { PolicyForm } from "@/modules/companies/components/policy-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { STATUTORY_TIMING_LABELS } from "@/modules/companies/schema";

export const metadata: Metadata = { title: "Company settings" };

export default async function CompanySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { companyId } = await params;
  await requireCompany(companyId);
  await requirePermission("companies.update");
  const sp = await searchParams;
  const company = await getCompany(await getScope(), companyId);
  if (!company) notFound();

  const latest = company.policies[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Company settings"
        description="Header, signatory, slip codes and payroll policy."
      />

      {sp.created ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>
            Company created. Upload the logo and review the payroll policy below.
          </AlertTitle>
        </Alert>
      ) : null}

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <CompanyForm
            mode="edit"
            company={{
              id: company.id,
              code: company.code,
              legalName: company.legalName,
              tradeName: company.tradeName,
              address: company.address,
              tin: company.tin,
              sssEmployerNo: company.sssEmployerNo,
              philhealthEmployerNo: company.philhealthEmployerNo,
              pagibigEmployerNo: company.pagibigEmployerNo,
              payFrequency: company.payFrequency,
              signatoryName: company.signatoryName,
              signatoryTitle: company.signatoryTitle,
              slipCodePrefix: company.slipCodePrefix,
              slipCodeNext: company.slipCodeNext,
              slipCodePad: company.slipCodePad,
              employeeNoPrefix: company.employeeNoPrefix,
              employeeNoNext: company.employeeNoNext,
              employeeNoPad: company.employeeNoPad,
              paperSize: company.paperSize,
              paperOrientation: company.paperOrientation,
              isActive: company.isActive,
              emailPayslipsEnabled: company.emailPayslipsEnabled,
            }}
          />
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>
                PNG, JPEG or WebP up to 2 MB. Re-encoded and resized to 600 px.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogoUploader
                company={{
                  id: company.id,
                  code: company.code,
                  legalName: company.legalName,
                  logoPath: company.logoPath,
                }}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payroll policy</CardTitle>
            <CardDescription>
              Versioned by effective date. The engine uses the latest version on or before a
              period&apos;s cutoff end. Saving with an existing effective date updates that version.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <PolicyForm
              companyId={company.id}
              defaults={
                latest
                  ? {
                      effectiveFrom: todayInManila(),
                      workingDaysPerYear: latest.workingDaysPerYear,
                      hoursPerDay: latest.hoursPerDay.toString(),
                      otRegular: latest.otRegular.toString(),
                      otRestDay: latest.otRestDay.toString(),
                      otRestDayExcess: latest.otRestDayExcess.toString(),
                      otRegularHoliday: latest.otRegularHoliday.toString(),
                      otRegularHolidayExcess: latest.otRegularHolidayExcess.toString(),
                      nightDiffRate: latest.nightDiffRate.toString(),
                      statutoryTiming: latest.statutoryTiming,
                      lateGraceMinutes: latest.lateGraceMinutes,
                      officerCanApprove: latest.officerCanApprove,
                    }
                  : null
              }
            />
            {company.policies.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Versions
                </p>
                <ul className="divide-y rounded-md border text-sm">
                  {company.policies.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
                    >
                      <span className="font-medium">
                        Effective {formatDateOnly(toIsoDate(p.effectiveFrom))}
                      </span>
                      <span className="text-muted-foreground">{p.workingDaysPerYear} days/yr</span>
                      <span className="text-muted-foreground">
                        {p.hoursPerDay.toString()} h/day
                      </span>
                      <span className="text-muted-foreground">
                        OT {p.otRegular.toString()} / RD {p.otRestDay.toString()} / RH{" "}
                        {p.otRegularHoliday.toString()}
                      </span>
                      <span className="text-muted-foreground">ND {p.nightDiffRate.toString()}</span>
                      <span className="text-muted-foreground">
                        {STATUTORY_TIMING_LABELS[p.statutoryTiming]}
                      </span>
                      <span className="text-muted-foreground">Grace {p.lateGraceMinutes} min</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
