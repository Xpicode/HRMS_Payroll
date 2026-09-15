"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { decideRequestAction } from "../actions";

type Props = {
  companyId: string;
  requestId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  canApprove: boolean;
  canRequest: boolean;
  returnTo: string | null;
  summary: string;
};

/** Approve / Reject (with an optional note) and Cancel, inline in the requests table. */
export function RequestActions({
  companyId,
  requestId,
  status,
  canApprove,
  canRequest,
  returnTo,
  summary,
}: Props) {
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const [approveState, approve] = useActionState(
    decideRequestAction.bind(null, companyId, requestId, "approve", returnTo),
    initialActionState,
  );
  const [rejectState, reject] = useActionState(
    decideRequestAction.bind(null, companyId, requestId, "reject", returnTo),
    initialActionState,
  );
  const [cancelState, cancel] = useActionState(
    decideRequestAction.bind(null, companyId, requestId, "cancel", returnTo),
    initialActionState,
  );
  const error = [approveState, rejectState, cancelState].find((s) => !s.ok && s.message);

  if (status === "REJECTED" || status === "CANCELLED") return null;
  const canCancel = status === "PENDING" ? canRequest : canApprove;

  return (
    <div className="flex flex-col items-end gap-1">
      {open ? (
        <form
          action={open === "approve" ? approve : reject}
          className="flex items-center gap-1"
          onSubmit={(e) => {
            if (open === "approve" && !window.confirm(`Approve ${summary}?`)) e.preventDefault();
          }}
        >
          <Input
            name="note"
            placeholder={open === "approve" ? "Note (optional)" : "Reason (optional)"}
            className="h-7 w-44 text-xs"
            maxLength={300}
            autoFocus
          />
          <SubmitButton
            size="sm"
            variant={open === "approve" ? "default" : "destructive"}
            pendingText="…"
          >
            {open === "approve" ? "Confirm" : "Reject"}
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>
            Back
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          {status === "PENDING" && canApprove ? (
            <>
              <Button size="sm" onClick={() => setOpen("approve")}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen("reject")}>
                Reject
              </Button>
            </>
          ) : null}
          {canCancel ? (
            <form
              action={cancel}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    status === "APPROVED"
                      ? `Cancel the approved ${summary}? The leave days are removed from attendance and credits returned.`
                      : `Cancel ${summary}?`,
                  )
                )
                  e.preventDefault();
              }}
            >
              <SubmitButton
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                pendingText="…"
              >
                Cancel
              </SubmitButton>
            </form>
          ) : null}
        </div>
      )}
      {error && !error.ok ? (
        <span role="alert" className="max-w-72 text-right text-xs text-destructive">
          {error.message}
        </span>
      ) : null}
    </div>
  );
}
