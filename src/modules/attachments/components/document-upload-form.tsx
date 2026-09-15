"use client";

import { useActionState } from "react";
import { UploadIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { DOCUMENT_ACCEPT, DOCUMENT_CATEGORIES } from "../schema";
import { uploadDocumentAction } from "../actions";

export function DocumentUploadForm({
  companyId,
  employeeId,
}: {
  companyId: string;
  employeeId: string;
}) {
  const [state, formAction] = useActionState(
    uploadDocumentAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="space-y-4" noValidate key={state.ok ? "ok" : "form"}>
      <FormAlert state={state} />
      <Field label="Category" name="category" error={errors?.category}>
        <NativeSelect id="category" name="category" defaultValue="">
          <option value="">—</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        label="File"
        name="file"
        error={errors?.file}
        required
        hint="PDF, JPEG, PNG or WebP, up to 8 MB"
      >
        <Input id="file" name="file" type="file" accept={DOCUMENT_ACCEPT} required />
      </Field>
      <SubmitButton className="w-full" pendingText="Uploading…">
        <UploadIcon data-icon="inline-start" />
        Attach file
      </SubmitButton>
    </form>
  );
}
