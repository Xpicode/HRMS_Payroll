import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { ChangePasswordForm } from "@/modules/auth/components/change-password-form";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Change password"
        description="At least 12 characters with a letter and a digit. You will be signed out of every device afterwards."
      />
      <div className="max-w-md space-y-4">
        {user.mustChangePassword ? (
          <Alert>
            <AlertTitle>Set a new password to continue</AlertTitle>
            <AlertDescription>
              Your password was set by an administrator. Choose your own before using the system.
            </AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardContent>
            <ChangePasswordForm email={user.email} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
