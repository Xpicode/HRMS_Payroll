"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MailIcon, RefreshCwIcon } from "lucide-react";
import { SubmitButton } from "@/components/form/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { initialActionState } from "@/lib/action-result";
import { emailPayslipsAction } from "../actions";

export type EmailPanelMessage = {
  id: string;
  to: string;
  status: "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
  error: string | null;
  sentAt: string | null;
  attempts: number;
  employee: string;
  slipCode: string | null;
};

type Props = {
  companyId: string;
  periodId: string;
  enabled: boolean;
  configured: boolean;
  mode: "smtp" | "json" | "off";
  canSend: boolean;
  finalReady: boolean;
  jobActive: boolean;
  counts: { queued: number; sent: number; failed: number; skipped: number };
  messages: EmailPanelMessage[];
};

const STATUS_VARIANT = {
  QUEUED: "default",
  SENT: "secondary",
  FAILED: "destructive",
  SKIPPED: "outline",
} as const;

/** "Email payslips" plus the per-employee delivery log of an approved period. */
export function EmailPanel(p: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    emailPayslipsAction.bind(null, p.companyId, p.periodId),
    initialActionState,
  );
  useEffect(() => {
    if (!p.jobActive) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [p.jobActive, router]);
  if (!p.enabled && p.messages.length === 0) return null;

  const pending = p.messages.filter((m) => m.status !== "SENT").length;
  const label =
    p.counts.sent > 0 && pending > 0
      ? "Resend unsent"
      : p.counts.sent > 0
        ? "Email again"
        : "Email payslips";
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Email outbox</CardTitle>
          <CardDescription>
            {p.mode === "json"
              ? "Dev mode: messages are logged, nothing is delivered."
              : p.configured
                ? "Each employee receives their own PDF at the address on their record."
                : "SMTP is not configured; set SMTP_HOST / SMTP_FROM in .env."}
            {p.counts.sent || p.counts.failed || p.counts.skipped
              ? ` · ${p.counts.sent} sent · ${p.counts.failed} failed · ${p.counts.skipped} skipped`
              : ""}
          </CardDescription>
        </div>
        {p.canSend && p.enabled ? (
          <form action={formAction} className="flex flex-col items-end gap-1">
            <SubmitButton
              variant="outline"
              size="sm"
              pendingText="Queuing…"
              disabled={!p.configured || !p.finalReady || p.jobActive}
            >
              {p.jobActive ? (
                <RefreshCwIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <MailIcon data-icon="inline-start" />
              )}
              {p.jobActive ? "Sending…" : label}
            </SubmitButton>
            {!state.ok && state.message ? (
              <span role="alert" className="max-w-80 text-right text-xs text-destructive">
                {state.message}
              </span>
            ) : null}
          </form>
        ) : null}
      </CardHeader>
      {p.messages.length ? (
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <span className="font-medium">{m.employee}</span>
                    {m.slipCode ? (
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {m.slipCode}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">{m.to || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[m.status]}>{m.status.toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.status === "SENT" && m.sentAt ? `sent ${m.sentAt}` : (m.error ?? "")}
                    {m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      ) : null}
    </Card>
  );
}
