"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
import { initialActionState } from "@/lib/action-result";
import { withdrawLeaveAction } from "../actions";

/** Cancels one of the employee's own pending requests, after confirming. */
export function WithdrawButton({ requestId, summary }: { requestId: string; summary: string }) {
  const [state, formAction] = useActionState(
    withdrawLeaveAction.bind(null, requestId),
    initialActionState,
  );
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <ConfirmSubmit
        variant="ghost"
        size="sm"
        message={`Withdraw your request for ${summary}?`}
        pendingText="Withdrawing…"
      >
        Withdraw
      </ConfirmSubmit>
      {!state.ok && state.message ? (
        <span role="alert" className="text-[11px] text-destructive">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
