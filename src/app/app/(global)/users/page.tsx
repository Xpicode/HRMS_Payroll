import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { getScope, requirePermission } from "@/lib/session";
import { listUsers } from "@/modules/auth/service";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/app-shell/page-header";
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
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requirePermission("users.manage");
  const sp = await searchParams;
  const users = await listUsers(await getScope());

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Administrators see every company. Payroll officers and encoders see only the companies assigned to them."
        actions={
          <Button render={<Link href="/app/users/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            New user
          </Button>
        }
      />
      {sp.created ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>
            User created. They must change the temporary password at first login.
          </AlertTitle>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Companies</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link href={`/app/users/${u.id}`} className="font-medium hover:underline">
                      {u.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.role === "ADMIN" ? (
                      <span className="text-muted-foreground">All companies</span>
                    ) : u.companies.length === 0 ? (
                      <span className="text-warning-foreground">None assigned</span>
                    ) : (
                      <span className="font-mono text-xs">
                        {u.companies.map((c) => c.company.code).join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    {!u.isActive ? (
                      <Badge variant="outline">Disabled</Badge>
                    ) : u.isLocked ? (
                      <Badge variant="destructive">Locked</Badge>
                    ) : u.mustChangePassword ? (
                      <Badge variant="outline">Must change password</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/app/users/${u.id}`} />}
                      nativeButton={false}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
