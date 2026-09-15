import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getScope } from "@/lib/session";
import { todayInManila } from "@/lib/dates";
import { currentYear } from "@/modules/leave/service";
import { myLeave, portalContext } from "@/modules/self-service/service";
import { SelfLeaveForm } from "@/modules/self-service/components/self-leave-form";
import { MyRequestsTable } from "@/modules/self-service/components/my-requests-table";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "My leave" };

type Search = { year?: string; saved?: string; withdrawn?: string };

export default async function MyLeavePage({ searchParams }: { searchParams: Promise<Search> }) {
  const scope = await getScope();
  const sp = await searchParams;
  const parsedYear = Number(sp.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : currentYear();
  const p = await portalContext(scope);
  const { balances, requests, leaveTypes } = await myLeave(scope, year);
  const canFile = p.employee.status !== "SEPARATED" && leaveTypes.length > 0;
  const notice = sp.saved
    ? "Leave request filed. HR or payroll will review it."
    : sp.withdrawn
      ? "Leave request withdrawn."
      : null;

  return (
    <>
      <PageHeader
        eyebrow="Leave"
        title="My leave"
        description="Your credits for the year and every request you have filed."
      />
      {notice ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}

      <div className={canFile ? "grid gap-6 lg:grid-cols-[1fr_340px]" : ""}>
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="eyebrow">Credits {year}</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous year"
                  render={<Link href={`/me/leave?year=${year - 1}`} />}
                  nativeButton={false}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="min-w-14 text-center font-mono text-sm font-medium">{year}</span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next year"
                  render={<Link href={`/me/leave?year=${year + 1}`} />}
                  nativeButton={false}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
            {balances.length === 0 ? (
              <div className="surface rounded-2xl p-8 text-center text-sm text-muted-foreground">
                Your company has not set up leave types yet.
              </div>
            ) : (
              <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {balances.map((b) => {
                  const credits = Number(b.credits);
                  const used = Number(b.used);
                  const pct = credits > 0 ? Math.min(100, Math.round((used / credits) * 100)) : 0;
                  return (
                    <li key={b.leaveType.id} className="surface rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{b.leaveType.name}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {b.leaveType.code}
                          </p>
                        </div>
                        <p className="font-mono text-2xl font-semibold tabular">{b.remaining}</p>
                      </div>
                      <div
                        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${b.leaveType.name} used`}
                      >
                        <div
                          className="h-full rounded-full bg-primary shadow-[0_0_10px_var(--primary)] transition-[width] duration-700 ease-out-expo"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {b.used} used of {b.credits}
                        {b.balanceId === null ? ` · ${b.annualCredits} allocated on first use` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>My requests</CardTitle>
              <CardDescription>
                Pending requests can be withdrawn until they are decided.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <MyRequestsTable requests={requests} />
            </CardContent>
          </Card>
        </div>

        {canFile ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>File a leave request</CardTitle>
            </CardHeader>
            <CardContent>
              <SelfLeaveForm
                leaveTypes={leaveTypes.map((t) => ({
                  id: t.id,
                  code: t.code,
                  name: t.name,
                  withPayDefault: t.withPayDefault,
                }))}
                defaultDate={todayInManila()}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
