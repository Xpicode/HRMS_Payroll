import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatDateOnly, toIsoDate, todayInManila } from "@/lib/dates";
import { listHolidays } from "@/modules/companies/service";
import { HOLIDAY_TYPE_LABELS } from "@/modules/companies/schema";
import { deleteHolidayAction } from "@/modules/companies/actions";
import { HolidayForm } from "@/modules/companies/components/holiday-form";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
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
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Holidays" };

type Search = { year?: string; edit?: string; saved?: string; deleted?: string };

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });

export default async function HolidaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId } = await params;
  const { user, company } = await requireCompany(companyId);
  const sp = await searchParams;
  const currentYear = Number(todayInManila().slice(0, 4));
  const parsedYear = Number(sp.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : currentYear;

  const scope = await getScope();
  const holidays = await listHolidays(scope, companyId, year);
  const canManage = roleCan(user.role, "holidays.manage_company");
  const canNational = roleCan(user.role, "holidays.manage_national");
  const editing =
    canManage && isUuid(sp.edit) ? (holidays.find((h) => h.id === sp.edit) ?? null) : null;
  const canTouch = (h: { companyId: string | null }) =>
    h.companyId === null ? canNational : canManage;

  return (
    <>
      <PageHeader
        eyebrow={company.code}
        title="Holidays"
        description="National holidays apply to every company. Company holidays apply here only. Attendance uses this calendar to set each day's type."
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous year"
              render={<Link href={`?year=${year - 1}`} />}
              nativeButton={false}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-14 text-center font-mono text-sm font-medium">{year}</span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next year"
              render={<Link href={`?year=${year + 1}`} />}
              nativeButton={false}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        }
      />

      {sp.saved || sp.deleted ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>{sp.deleted ? "Holiday deleted." : "Holiday saved."}</AlertTitle>
        </Alert>
      ) : null}

      <div className={canManage ? "grid gap-6 lg:grid-cols-[1fr_340px]" : ""}>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Date</TableHead>
                  <TableHead>Holiday</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Applies to</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 5 : 4}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No holidays recorded for {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  holidays.map((h) => {
                    const iso = toIsoDate(h.date);
                    return (
                      <TableRow
                        key={h.id}
                        data-editing={editing?.id === h.id || undefined}
                        className="data-editing:bg-accent/60"
                      >
                        <TableCell className="tabular">
                          <span className="font-medium">{formatDateOnly(iso)}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {WEEKDAY.format(h.date)}
                          </span>
                        </TableCell>
                        <TableCell>{h.name}</TableCell>
                        <TableCell>
                          <Badge variant={h.type === "REGULAR" ? "default" : "secondary"}>
                            {HOLIDAY_TYPE_LABELS[h.type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {h.companyId === null ? "National" : company.code}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            {canTouch(h) ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  render={<Link href={`?year=${year}&edit=${h.id}`} />}
                                  nativeButton={false}
                                >
                                  Edit
                                </Button>
                                <form
                                  action={deleteHolidayAction.bind(null, companyId, h.id, year)}
                                >
                                  <ConfirmSubmit
                                    message={`Delete "${h.name}" on ${formatDateOnly(iso)}?`}
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                  >
                                    Delete
                                  </ConfirmSubmit>
                                </form>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Admin only</span>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {canManage ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{editing ? "Edit holiday" : "Add holiday"}</CardTitle>
              <CardDescription>
                {editing ? (
                  <>
                    Editing {editing.companyId === null ? "a national" : "a company"} holiday.{" "}
                    <Link href={`?year=${year}`} className="underline">
                      Cancel
                    </Link>
                  </>
                ) : canNational ? (
                  "Choose whether it applies to this company only or nationwide."
                ) : (
                  "Added holidays apply to this company only."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HolidayForm
                key={editing?.id ?? "new"}
                companyId={companyId}
                companyCode={company.code}
                canNational={canNational}
                year={year}
                holiday={
                  editing
                    ? {
                        id: editing.id,
                        date: toIsoDate(editing.date),
                        name: editing.name,
                        type: editing.type,
                        national: editing.companyId === null,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
