import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2Icon, CircleDashedIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { todayInManila } from "@/lib/dates";
import { getCompany, listHolidays } from "@/modules/companies/service";
import { PAY_FREQUENCY_LABELS, STATUTORY_TIMING_LABELS } from "@/modules/companies/schema";
import { PageHeader } from "@/components/app-shell/page-header";
import { CompanyMark } from "@/components/company-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

export default async function CompanyDashboard({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { user } = await requireCompany(companyId);
  const scope = await getScope();
  const year = Number(todayInManila().slice(0, 4));
  const [company, holidays] = await Promise.all([
    getCompany(scope, companyId),
    listHolidays(scope, companyId, year),
  ]);
  if (!company) notFound();

  const policy = company.policies[0] ?? null;
  const canEdit = roleCan(user.role, "companies.update");
  const nextSlip = `${company.slipCodePrefix}-${String(company.slipCodeNext).padStart(company.slipCodePad, "0")}`;
  const companyHolidays = holidays.filter((h) => h.companyId === companyId).length;

  const checklist = [
    { label: "Company header and address", done: true },
    { label: "Logo uploaded", done: Boolean(company.logoPath) },
    { label: "Payroll signatory", done: Boolean(company.signatoryName) },
    { label: "Payroll policy", done: Boolean(policy) },
    { label: `Holidays loaded for ${year}`, done: holidays.length > 0 },
  ];

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title={company.tradeName ?? company.legalName}
        description={company.address}
        actions={
          canEdit ? (
            <Button
              variant="outline"
              render={<Link href={`/app/${companyId}/settings`} />}
              nativeButton={false}
            >
              Company settings
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Payslip header</CardTitle>
            <CardDescription>
              What prints at the top of every payslip for this company.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <CompanyMark company={company} size="lg" />
              <div className="min-w-0 text-sm">
                <p className="text-base font-semibold">{company.legalName}</p>
                {company.tradeName ? (
                  <p className="text-muted-foreground">{company.tradeName}</p>
                ) : null}
                <p className="mt-1 text-muted-foreground">{company.address}</p>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">TIN</dt>
                  <dd className="font-mono">{company.tin ?? "—"}</dd>
                  <dt className="text-muted-foreground">SSS employer</dt>
                  <dd className="font-mono">{company.sssEmployerNo ?? "—"}</dd>
                  <dt className="text-muted-foreground">PhilHealth</dt>
                  <dd className="font-mono">{company.philhealthEmployerNo ?? "—"}</dd>
                  <dt className="text-muted-foreground">Pag-IBIG</dt>
                  <dd className="font-mono">{company.pagibigEmployerNo ?? "—"}</dd>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  {item.done ? (
                    <CheckCircle2Icon className="size-4 text-success" />
                  ) : (
                    <CircleDashedIcon className="size-4 text-muted-foreground" />
                  )}
                  <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Stat label="Pay frequency" value={PAY_FREQUENCY_LABELS[company.payFrequency]} />
        <Stat label="Next slip code" value={nextSlip} mono />
        <Stat label="Signatory" value={company.signatoryName} sub={company.signatoryTitle} />
        <Stat
          label="Payroll policy"
          value={policy ? `${policy.workingDaysPerYear} days / year` : "Not set"}
          sub={policy ? `Statutory: ${STATUTORY_TIMING_LABELS[policy.statutoryTiming]}` : undefined}
        />
        <Stat
          label={`Holidays ${year}`}
          value={String(holidays.length)}
          sub={`${holidays.length - companyHolidays} national · ${companyHolidays} company`}
          href={`/app/${companyId}/holidays?year=${year}`}
        />
        <Stat
          label="Your role here"
          value={user.role.replace("_", " ").toLowerCase()}
          className="capitalize"
        />
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  mono,
  href,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 truncate text-lg font-semibold ${mono ? "font-mono" : ""} ${className ?? ""}`}
      >
        {value}
      </p>
      {sub ? <p className="truncate text-xs text-muted-foreground">{sub}</p> : null}
    </>
  );
  return (
    <Card className="py-4">
      <CardContent>{href ? <Link href={href}>{body}</Link> : body}</CardContent>
    </Card>
  );
}
