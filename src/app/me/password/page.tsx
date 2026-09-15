import type { Metadata } from "next";
import { requireEmployee } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { ChangePasswordForm } from "@/modules/auth/components/change-password-form";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Change password" };

/** Same form as the staff page; the proxy holds must-change users here until they do. */
export default async function PortalPasswordPage() {
  const user = await requireEmployee();
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
            <AlertTitle>Set your own password to continue</AlertTitle>
            <AlertDescription>
              HR gave you a temporary password. Choose one only you know before using the portal.
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
