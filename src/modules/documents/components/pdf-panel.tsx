"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PrinterIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { generatePdfsAction } from "@/modules/payroll/actions";
import type { PeriodPdfStatus } from "../service";

type Props = {
  companyId: string;
  periodId: string;
  status: PeriodPdfStatus;
  frozen: boolean;
  canGenerate: boolean;
  hasPayslips: boolean;
};

const STATUS_TEXT = {
  QUEUED: "Queued — the job runner picks it up within a minute",
  RUNNING: "Rendering",
  DONE: "Generated",
  FAILED: "Failed",
} as const;

/**
 * PDF controls for a period: job progress (auto-refreshes while a job is active), Preview
 * (live HTML, any status), Generate/Regenerate (below APPROVED), and Print all / Download all
 * once the batch file exists.
 */
export function PdfPanel({ companyId, periodId, status, frozen, canGenerate, hasPayslips }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    generatePdfsAction.bind(null, companyId, periodId),
    initialActionState,
  );
  const job = status.job;
  const active = job?.status === "QUEUED" || job?.status === "RUNNING";

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [active, router]);

  const base = `/api/files/payslips/${companyId}/${periodId}`;
  const pct = job && job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  // after approval only the final files (named by slip code) may be printed or downloaded
  const printable = frozen ? status.finalReady : status.batchReady;
  const canQueue = canGenerate && hasPayslips && !active && (frozen ? !status.finalReady : true);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<a href={`${base}/preview`} target="_blank" rel="noopener" />}
          nativeButton={false}
          disabled={!hasPayslips}
        >
          <FileTextIcon data-icon="inline-start" />
          Preview
        </Button>
        {printable ? (
          <>
            <Button
              size="sm"
              render={<a href={`/print/${companyId}/${periodId}`} target="_blank" rel="noopener" />}
              nativeButton={false}
            >
              <PrinterIcon data-icon="inline-start" />
              Print all
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<a href={`${base}/_batch.pdf?download=1`} />}
              nativeButton={false}
            >
              <DownloadIcon data-icon="inline-start" />
              Download all
            </Button>
          </>
        ) : null}
        {canQueue ? (
          <form action={formAction} className="inline-flex flex-col gap-1">
            <SubmitButton
              variant={printable ? "ghost" : "outline"}
              size="sm"
              pendingText="Queuing…"
              disabled={active}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {frozen ? "Generate PDFs" : printable ? "Regenerate drafts" : "Generate draft PDFs"}
            </SubmitButton>
            {!state.ok && state.message ? (
              <span role="alert" className="text-xs text-destructive">
                {state.message}
              </span>
            ) : null}
          </form>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {job ? (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1",
                job.status === "FAILED" && "text-destructive",
                job.status === "DONE" && "text-success",
              )}
            >
              {active ? <RefreshCwIcon className="size-3 animate-spin" /> : null}
              PDFs: {STATUS_TEXT[job.status]}
              {job.status === "RUNNING" && job.total ? ` ${job.done}/${job.total}` : ""}
              {job.status === "FAILED" && job.error ? ` — ${job.error}` : ""}
            </span>
            {active ? (
              <span className="h-1.5 w-32 overflow-hidden rounded bg-muted">
                <span
                  className="block h-full bg-brand transition-all"
                  style={{ width: `${pct}%` }}
                />
              </span>
            ) : null}
          </>
        ) : (
          <span>
            {frozen ? "PDFs not generated yet." : "Drafts can be previewed before approval."}
          </span>
        )}
        {printable ? (
          <a
            href={`${base}/_batch.pdf`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 underline"
          >
            <ExternalLinkIcon className="size-3" /> open batch
          </a>
        ) : null}
      </div>
    </div>
  );
}
