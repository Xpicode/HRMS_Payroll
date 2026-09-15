import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, ClockIcon, PlaneIcon, ReceiptTextIcon } from "lucide-react";
import { getScope } from "@/lib/session";
import { formatCutoff, formatDateOnly, todayInManila, toIsoDate, cutoffFor } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { myDtr, myLeave, myPayslips, portalContext } from "@/modules/self-service/service";
import { PageHeader } from "@/components/app-shell/page-header";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "My portal" };

const n2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-PH", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" })
      .format(new Date())
      .replace(/\D/g, ""),
  );
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function PortalHome() {
  const scope = await getScope();
  const p = await portalContext(scope);
  const today = todayInManila();
  const cutoff = cutoffFor(p.company.payFrequency, today);
  const year = Number(today.slice(0, 4));
  const [payslips, dtr, leave] = await Promise.all([
    myPayslips(scope),
    myDtr(scope, cutoff),
    myLeave(scope, year),
  ]);
  const latest = payslips[0] ?? null;
  const pending = leave.requests.filter((r) => r.status === "PENDING").length;
  const remaining = leave.balances
    .filter((b) => b.leaveType.withPayDefault)
    .map((b) => `${b.leaveType.code} ${b.remaining}`)
    .join(" · ");

  return (
    <>
      <PageHeader
        eyebrow={`${p.company.code} · ${p.employee.employeeNo}`}
        title={`${greeting()}, ${p.employee.firstName}`}
        description={
          p.employee.position
            ? `${p.employee.position}${p.employee.department ? ` · ${p.employee.department}` : ""}`
            : undefined
        }
      />

      <div className="stagger grid gap-3 sm:gap-4 md:grid-cols-3">
        <Link
          href="/me/payslips"
          className="group/card block outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-2xl"
        >
          <SpotlightCard className="h-full p-5">
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <ReceiptTextIcon className="size-4" />
                </span>
                <ArrowRightIcon className="size-4 text-muted-foreground transition-transform duration-300 ease-out-expo group-hover/card:translate-x-0.5" />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Latest payslip</p>
              {latest ? (
                <>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular text-success">
                    {formatMoney(latest.netPay)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCutoff({
                      start: toIsoDate(latest.payPeriod.coverageStart),
                      end: toIsoDate(latest.payPeriod.coverageEnd),
                      sequenceInMonth: latest.payPeriod.sequenceInMonth === 2 ? 2 : 1,
                    })}{" "}
                    · paid {formatDateOnly(latest.payPeriod.payDate)}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-semibold">None yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Payslips appear here once payroll releases them.
                  </p>
                </>
              )}
            </div>
          </SpotlightCard>
        </Link>

        <Link
          href={`/me/attendance?start=${cutoff.start}&end=${cutoff.end}`}
          className="group/card block outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-2xl"
        >
          <SpotlightCard className="h-full p-5">
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <ClockIcon className="size-4" />
                </span>
                <ArrowRightIcon className="size-4 text-muted-foreground transition-transform duration-300 ease-out-expo group-hover/card:translate-x-0.5" />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">This cutoff</p>
              <p className="mt-1 text-2xl font-semibold tabular">
                {n2(dtr.summary.daysWorked)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  of {dtr.summary.scheduledDays} days
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCutoff(cutoff)}
                {dtr.summary.lateMinutes ? ` · late ${dtr.summary.lateMinutes} min` : ""}
                {dtr.summary.absentDays ? ` · ${n2(dtr.summary.absentDays)} absent` : ""}
              </p>
            </div>
          </SpotlightCard>
        </Link>

        <Link
          href="/me/leave"
          className="group/card block outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-2xl"
        >
          <SpotlightCard className="h-full p-5">
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <PlaneIcon className="size-4" />
                </span>
                {pending > 0 ? (
                  <Badge>{pending} pending</Badge>
                ) : (
                  <ArrowRightIcon className="size-4 text-muted-foreground transition-transform duration-300 ease-out-expo group-hover/card:translate-x-0.5" />
                )}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Leave credits {year}</p>
              <p className="mt-1 text-2xl font-semibold tabular">
                {remaining || <span className="text-lg text-muted-foreground">No credits</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pending > 0 ? "Waiting for approval" : "File a request any time"}
              </p>
            </div>
          </SpotlightCard>
        </Link>
      </div>

      {payslips.length > 1 ? (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">Recent payslips</h2>
          <ul className="surface divide-y divide-border/60 overflow-hidden rounded-2xl">
            {payslips.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link
                  href={`/me/payslips/${s.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {s.payPeriod.type === "THIRTEENTH_MONTH"
                        ? `13th month ${toIsoDate(s.payPeriod.coverageStart).slice(0, 4)}`
                        : formatCutoff({
                            start: toIsoDate(s.payPeriod.coverageStart),
                            end: toIsoDate(s.payPeriod.coverageEnd),
                            sequenceInMonth: s.payPeriod.sequenceInMonth === 2 ? 2 : 1,
                          })}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Paid {formatDateOnly(s.payPeriod.payDate)}
                      {s.slipCode ? ` · ${s.slipCode}` : ""}
                    </span>
                  </span>
                  <span className="font-mono font-semibold tabular">{formatMoney(s.netPay)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
