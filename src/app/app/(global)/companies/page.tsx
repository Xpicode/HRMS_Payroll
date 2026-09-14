import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { getScope, requirePermission } from "@/lib/session";
import { listCompanies } from "@/modules/companies/service";
import { PAY_FREQUENCY_LABELS } from "@/modules/companies/schema";
import { PageHeader } from "@/components/app-shell/page-header";
import { CompanyMark } from "@/components/company-mark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  await requirePermission("companies.list_all");
  const sp = await searchParams;
  const companies = await listCompanies(await getScope());

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Companies"
        description="Each company has its own header, signatory, slip-code series and payroll policy."
        actions={
          <Button render={<Link href="/app/companies/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            New company
          </Button>
        }
      />

      {sp.empty ? (
        <Alert className="mb-6">
          <AlertTitle>Start by creating your first company</AlertTitle>
          <AlertDescription>
            Employees, attendance and payroll all live inside a company.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Company</TableHead>
                <TableHead>Pay frequency</TableHead>
                <TableHead>Slip codes</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No companies yet.
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <CompanyMark company={c} />
                        <div className="min-w-0">
                          <Link href={`/app/${c.id}`} className="font-medium hover:underline">
                            {c.legalName}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{c.code}</span>
                            {c.tradeName ? ` · ${c.tradeName}` : ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {PAY_FREQUENCY_LABELS[c.payFrequency]}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {c.slipCodePrefix}-{String(c.slipCodeNext).padStart(c.slipCodePad, "0")}
                    </TableCell>
                    <TableCell className="text-right tabular">{c._count.users}</TableCell>
                    <TableCell>
                      {c.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/app/${c.id}/settings`} />}
                        nativeButton={false}
                      >
                        Settings
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
