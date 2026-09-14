import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

/** Renders the top-level message of an action result (field errors render next to fields). */
export function FormAlert({ state }: { state: ActionResult<unknown> }) {
  if (state.ok) {
    if (!state.message) return null;
    return (
      <Alert className="border-success/30 bg-success/5 text-success">
        <CheckCircle2Icon />
        <AlertTitle>{state.message}</AlertTitle>
      </Alert>
    );
  }
  const formErrors = state.fieldErrors?._form;
  if (!state.message && !formErrors?.length) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{state.message ?? "Please check the form."}</AlertTitle>
      {formErrors?.length ? <AlertDescription>{formErrors.join(" ")}</AlertDescription> : null}
    </Alert>
  );
}
