import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatDateTime } from "@/lib/dates";
import { currentYear, latestRolloverJob, listLeaveTypes } from "@/modules/leave/service";
import { addStandardTypesAction } from "@/modules/leave/actions";
import { LeaveTypeForm } from "@/modules/leave/components/leave-type-form";
import { RolloverForm } from "@/modules/leave/components/credit-forms";
import { SubmitButton } from "@/components/form/submit-button";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Leave types" };

const fmtDays = (v: { toString(): string }) => {
  const n = Number(v.toString());
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

export default async function LeaveTypesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ edit?: string; saved?: string; rollover?: string }>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!roleCan(user.role, "leave.manage_types")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const year = currentYear();
  const rolloverYear = Number(sp.rollover) || year + 1;
  const [types, job] = await Promise.all([
    listLeaveTypes(scope, companyId, true),
    latestRolloverJob(scope, companyId, rolloverYear),
  ]);
  const editing = isUuid(sp.edit) ? (types.find((t) => t.id === sp.edit) ?? null) : null;
  const base = `/app/${companyId}/leave`;

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · Leave`}
        title="Leave types and credits"
        description="Per-company types with yearly credits. Credits are allocated by the yearly rollover or on first use."
        actions={
          <Button variant="ghost" size="sm" render={<Link href={base} />} nativeButton={false}>
            <ArrowLeftIcon data-icon="inline-start" />
            Requests
          </Button>
        }
      />

      {sp.saved ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>Leave types saved.</AlertTitle>
        </Alert>
      ) : null}
      {sp.rollover ? (
        <Alert className="mb-4 border-success/30 bg-success/5 text-success">
          <AlertTitle>Rollover for {sp.rollover} queued.</AlertTitle>
          <AlertDescription>
            {job
              ? `Job ${job.status.toLowerCase()}${job.total ? ` · ${job.done}/${job.total} employees` : ""}${job.error ? ` · ${job.error}` : ""}. Refresh to update.`
              : "It runs within a minute."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="text-right">Credits / yr</TableHead>
                    <TableHead className="text-right">Carry-over</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        <p>No leave types yet.</p>
                        <form
                          action={addStandardTypesAction.bind(null, companyId)}
                          className="mt-3"
                        >
                          <SubmitButton variant="outline" size="sm" pendingText="Adding…">
                            Add the standard set (VL 5, SL 5, LWOP)
                          </SubmitButton>
                        </form>
                      </TableCell>
                    </TableRow>
                  ) : (
                    types.map((t) => (
                      <TableRow
                        key={t.id}
                        data-editing={editing?.id === t.id || undefined}
                        className="data-editing:bg-accent/60"
                      >
                        <TableCell className="font-mono text-xs">{t.code}</TableCell>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-xs">
                          {t.withPayDefault ? "With pay" : "Without pay"}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtDays(t.annualCredits)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtDays(t.maxCarryover)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.isActive ? "secondary" : "outline"}>
                            {t.isActive ? "active" : "inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<Link href={`?edit=${t.id}`} />}
                            nativeButton={false}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yearly rollover</CardTitle>
              <CardDescription>
                Gives every active employee the year&apos;s credits for each active type: the annual
                credits plus unused credits from the previous year, up to the type&apos;s carry-over
                cap. Employees who already have credits for that year are skipped, so it is safe to
                run again. Every allocation is audited.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RolloverForm companyId={companyId} defaultYear={rolloverYear} />
              {job ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Last run for {rolloverYear}: {job.status.toLowerCase()}
                  {job.finishedAt ? ` · ${formatDateTime(job.finishedAt)}` : ""}
                  {job.total ? ` · ${job.done}/${job.total} employees` : ""}
                  {job.error ? ` · ${job.error}` : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{editing ? `Edit ${editing.code}` : "Add leave type"}</CardTitle>
            <CardDescription>
              {editing ? (
                <Link href={`${base}/types`} className="underline">
                  Cancel editing
                </Link>
              ) : (
                "Codes print on reports; names show on forms."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveTypeForm
              companyId={companyId}
              leaveType={
                editing
                  ? {
                      id: editing.id,
                      code: editing.code,
                      name: editing.name,
                      withPayDefault: editing.withPayDefault,
                      annualCredits: fmtDays(editing.annualCredits),
                      maxCarryover: fmtDays(editing.maxCarryover),
                      isActive: editing.isActive,
                    }
                  : null
              }
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
