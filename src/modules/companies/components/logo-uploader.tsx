"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { CompanyMark } from "@/components/company-mark";
import { initialActionState } from "@/lib/action-result";
import { uploadLogoAction } from "../actions";

type Props = { company: { id: string; code: string; legalName: string; logoPath: string | null } };

export function LogoUploader({ company }: Props) {
  const [state, formAction] = useActionState(
    uploadLogoAction.bind(null, company.id),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img
            src={preview}
            alt=""
            className="size-16 rounded-md border bg-white object-contain p-1"
          />
        ) : (
          <CompanyMark company={company} size="lg" key={state.ok ? "updated" : "current"} />
        )}
        <p className="text-xs text-muted-foreground">
          {company.logoPath
            ? "Current logo. Upload a new file to replace it."
            : "No logo yet. Initials are shown until one is uploaded."}
        </p>
      </div>
      <FormAlert state={state} />
      <Field label="Image file" name="logo" error={errors?.logo}>
        <Input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </Field>
      <SubmitButton variant="outline" pendingText="Uploading…">
        Upload logo
      </SubmitButton>
    </form>
  );
}
