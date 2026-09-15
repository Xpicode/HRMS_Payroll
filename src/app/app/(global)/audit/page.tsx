import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getScope, requirePermission } from "@/lib/session";
import { filterOptions, listAudit, parseFilter, type AuditFilter } from "@/modules/audit/service";
import { AuditFilters } from "@/modules/audit/components/audit-filters";
import { AuditTable } from "@/modules/audit/components/audit-table";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Audit log" };

function pageHref(filter: AuditFilter, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (k !== "page" && v !== undefined) qs.set(k, String(v));
  }
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `/app/audit?${s}` : "/app/audit";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("audit.view");
  const scope = await getScope();
  const filter = parseFilter(await searchParams);
  const [page, options] = await Promise.all([listAudit(scope, filter), filterOptions(scope)]);
  const first = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Every create, update, delete, upload and sign-in event, with the values before and after. Passwords and secrets are redacted at write time. Entries are append-only."
      />
      <div className="mb-4">
        <AuditFilters filter={filter} options={options} />
      </div>
      <Card>
        <CardContent className="p-0">
          <AuditTable rows={page.rows} />
        </CardContent>
      </Card>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {page.total === 0
            ? "0 entries"
            : `${first.toLocaleString()}–${last.toLocaleString()} of ${page.total.toLocaleString()} entries`}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page.page <= 1}
            render={page.page > 1 ? <Link href={pageHref(filter, page.page - 1)} /> : undefined}
            nativeButton={page.page <= 1}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!page.hasMore}
            render={page.hasMore ? <Link href={pageHref(filter, page.page + 1)} /> : undefined}
            nativeButton={!page.hasMore}
          >
            Older
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </>
  );
}
