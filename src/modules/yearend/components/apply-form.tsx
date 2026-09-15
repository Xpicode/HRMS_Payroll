"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { applyAnnualizationAction } from "../actions";

export function ApplyAnnualizationForm({
  companyId,
  year,
  disabled,
  periodLabel,
}: {
  companyId: string;
  year: number;
  disabled: boolean;
  periodLabel: string | null;
}) {
  const [state, formAction] = useActionState(
    applyAnnualizationAction.bind(null, companyId),
    initialActionState,
  );
  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Write the refund / additional-tax lines into ${periodLabel ?? "the last period"} and recompute it?`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="year" value={year} />
      <SubmitButton disabled={disabled} pendingText="Applying…">
        Apply to last period
      </SubmitButton>
      {!state.ok && state.message ? (
        <span role="alert" className="max-w-96 text-right text-xs text-destructive">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
