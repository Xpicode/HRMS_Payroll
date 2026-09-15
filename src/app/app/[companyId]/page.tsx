import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2Icon, CircleDashedIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { formatCutoff, formatDateOnly, todayInManila, toIsoDate } from "@/lib/dates";
import { getCompany, listHolidays } from "@/modules/companies/service";
import { PAY_FREQUENCY_LABELS, STATUTORY_TIMING_LABELS } from "@/modules/companies/schema";
import { headcount } from "@/modules/employees/service";
import { countPendingRequests, listRequests } from "@/modules/leave/service";
import { latestPeriod } from "@/modules/payroll/service";
import { PERIOD_STATUS_LABELS } from "@/modules/payroll/schema";
import { countActiveJobs } from "@/modules/documents/service";
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
  const { user, company: summary } = await requireCompany(companyId);
  const scope = await getScope();
  const year = Number(todayInManila().slice(0, 4));
  const canPayroll = roleCan(user.role, "payroll.view");
  const canLeave = roleCan(user.role, "leave.view");
  const [company, holidays, counts, period, pendingLeave, pendingList, jobs] = await Promise.all([
    getCompany(scope, companyId),
    listHolidays(scope, companyId, year),
    headcount(scope, companyId),
    canPayroll ? latestPeriod(scope, companyId) : null,
    canLeave ? countPendingRequests(scope, companyId) : 0,
    canLeave ? listRequests(scope, companyId, { status: "PENDING", take: 5 }) : [],
    countActiveJobs(scope, companyId),
  ]);
  if (!company) notFound();

  const policy = company.policies[0] ?? null;
  const canEdit = roleCan(user.role, "companies.update");
  const nextSlip = `${company.slipCodePrefix}-${String(company.slipCodeNext).padStart(company.slipCodePad, "0")}`;
  const companyHolidays = holidays.filter((h) => h.companyId === companyId).length;
  const base = `/app/${companyId}`;

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
        eyebrow={summary.code}
        title={company.tradeName ?? company.legalName}
        description={company.address}
        actions={
          canEdit ? (
            <Button
              variant="outline"
              render={<Link href={`${base}/settings`} />}
              nativeButton={false}
            >
              Company settings
            </Button>
          ) : null
        }
      />

      <div className="stagger mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Headcount"
          value={String(counts.ACTIVE + counts.ON_LEAVE)}
          sub={`${counts.ACTIVE} active · ${counts.ON_LEAVE} on leave · ${counts.SEPARATED} separated`}
          href={`${base}/employees`}
        />
        <Stat
          label="Current pay period"
          value={period ? PERIOD_STATUS_LABELS[period.status] : canPayroll ? "None yet" : "—"}
          sub={
            period
              ? `${formatCutoff({
                  start: toIsoDate(period.coverageStart),
                  end: toIsoDate(period.coverageEnd),
                  sequenceInMonth: period.sequenceInMonth === 2 ? 2 : 1,
                })} · pay ${formatDateOnly(period.payDate)}`
              : canPayroll
                ? "Create one under Payroll"
                : "Payroll officers only"
          }
          href={
            canPayroll ? (period ? `${base}/payroll/${period.id}` : `${base}/payroll`) : undefined
          }
        />
        <Stat
          label="Pending leave requests"
          value={canLeave ? String(pendingLeave) : "—"}
          sub={pendingLeave > 0 ? "Waiting for approval" : "Nothing waiting"}
          href={canLeave ? `${base}/leave` : undefined}
          className={pendingLeave > 0 ? "text-warning" : undefined}
        />
        <Stat
          label="Jobs in progress"
          value={String(jobs)}
          sub={jobs > 0 ? "PDFs or credit rollover running" : "Queue is idle"}
        />
      </div>

      <div className="stagger grid gap-3 [--stagger-step:35ms] sm:gap-4 md:grid-cols-3">
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

        {canLeave && pendingList.length > 0 ? (
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Waiting for approval</CardTitle>
              <CardDescription>The oldest pending leave requests.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {pendingList.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Link
                        href={`${base}/employees/${r.employee.id}/leave`}
                        className="font-medium hover:underline"
                      >
                        {r.employee.lastName}, {r.employee.firstName}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {r.leaveType.name} · {formatDateOnly(toIsoDate(r.startDate))}
                        {toIsoDate(r.endDate) !== toIsoDate(r.startDate)
                          ? ` – ${formatDateOnly(toIsoDate(r.endDate))}`
                          : ""}
                        {r.withPay ? "" : " · without pay"}
                      </span>
                    </span>
                    <Link href={`${base}/leave`} className="text-xs underline">
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

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
          href={`${base}/holidays?year=${year}`}
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
  if (href) {
    return (
      <Card className="surface-hover py-4 has-[a:focus-visible]:ring-ring">
        <CardContent>
          <Link href={href} className="block outline-none">
            {body}
          </Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="py-4">
      <CardContent>{body}</CardContent>
    </Card>
  );
}
