import type { Metadata } from "next";
import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { getScope, requireEmployee } from "@/lib/session";
import { formatDateOnly } from "@/lib/dates";
import { portalContext } from "@/modules/self-service/service";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "My profile" };

/** Last four characters visible; government IDs are shown for checking, not copying. */
function mask(value: string | null): string {
  if (!value) return "—";
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-words">{value}</dd>
    </div>
  );
}

export default async function MyProfilePage() {
  const user = await requireEmployee();
  const p = await portalContext(await getScope());
  const e = p.employee;
  const name = [e.firstName, e.middleName, e.lastName, e.suffix].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader
        eyebrow="Profile"
        title={name}
        description="What HR has on file for you. To correct anything, tell HR — you cannot edit it here."
        actions={
          <Button variant="outline" render={<Link href="/me/password" />} nativeButton={false}>
            <KeyRoundIcon data-icon="inline-start" />
            Change password
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
            <CardDescription>{p.company.legalName}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border/60">
              <Row label="Employee no." value={<span className="font-mono">{e.employeeNo}</span>} />
              <Row label="Position" value={e.position ?? "—"} />
              <Row label="Department" value={e.department ?? "—"} />
              <Row label="Date hired" value={formatDateOnly(e.hireDate)} />
              <Row
                label="Status"
                value={
                  e.status === "ACTIVE"
                    ? "Active"
                    : e.status === "ON_LEAVE"
                      ? "On leave"
                      : "Separated"
                }
              />
              {e.separationDate ? (
                <Row label="Separated" value={formatDateOnly(e.separationDate)} />
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>Sign-in email: {user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border/60">
              <Row label="Email on file" value={e.email ?? "—"} />
              <Row label="Mobile" value={e.mobile ?? "—"} />
              <Row label="Address" value={e.address ?? "—"} />
              <Row label="Birth date" value={e.birthDate ? formatDateOnly(e.birthDate) : "—"} />
            </dl>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Government numbers</CardTitle>
            <CardDescription>
              Partly hidden on screen. If a number is wrong, HR can correct it before the next
              payroll.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <Row label="SSS" value={<span className="font-mono">{mask(e.sssNo)}</span>} />
              <Row
                label="PhilHealth"
                value={<span className="font-mono">{mask(e.philhealthNo)}</span>}
              />
              <Row
                label="Pag-IBIG MID"
                value={<span className="font-mono">{mask(e.pagibigMid)}</span>}
              />
              <Row label="TIN" value={<span className="font-mono">{mask(e.tin)}</span>} />
              <Row label="Tax status" value={e.taxStatus} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
