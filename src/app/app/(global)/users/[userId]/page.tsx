import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requirePermission } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { getUser } from "@/modules/auth/service";
import { listCompanies } from "@/modules/companies/service";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/app-shell/page-header";
import { UserForm } from "@/modules/auth/components/user-form";
import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Edit user" };

export default async function EditUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const me = await requirePermission("users.manage");
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const scope = await getScope();
  const [user, companies] = await Promise.all([getUser(scope, userId), listCompanies(scope)]);
  if (!user) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title={user.name}
        description={
          <>
            {user.email}
            {user.lastLoginAt
              ? ` · last sign-in ${formatDateTime(user.lastLoginAt)}`
              : " · never signed in"}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <UserForm
          mode="edit"
          isSelf={user.id === me.id}
          user={{
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isActive: user.isActive,
            companyIds: user.companies.map((c) => c.companyId),
          }}
          companies={companies.map((c) => ({ id: c.id, code: c.code, legalName: c.legalName }))}
        />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>
              Sets a temporary password, signs the user out everywhere, and requires a new password
              at next login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm userId={user.id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
