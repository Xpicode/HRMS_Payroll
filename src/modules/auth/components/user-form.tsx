"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";
import { createUserAction, updateUserAction } from "../actions";

type CompanyOption = { id: string; code: string; legalName: string };

type Props =
  | { mode: "create"; companies: CompanyOption[]; user?: undefined; isSelf?: undefined }
  | {
      mode: "edit";
      companies: CompanyOption[];
      isSelf: boolean;
      user: {
        id: string;
        email: string;
        name: string;
        role: Role;
        isActive: boolean;
        companyIds: string[];
      };
    };

export function UserForm(props: Props) {
  const action =
    props.mode === "create" ? createUserAction : updateUserAction.bind(null, props.user.id);
  const [state, formAction] = useActionState(action, initialActionState);
  const errors = !state.ok ? state.fieldErrors : undefined;
  const [role, setRole] = useState<Role>(props.user?.role ?? "ENCODER");

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>{props.mode === "create" ? "Account" : "Account details"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <FormAlert state={state} />
          <FieldGrid>
            <Field label="Full name" name="name" error={errors?.name} required>
              <Input
                id="name"
                name="name"
                defaultValue={props.user?.name}
                autoComplete="off"
                required
              />
            </Field>
            <Field
              label="Email"
              name="email"
              error={errors?.email}
              required
              hint={props.mode === "edit" ? "Email cannot be changed." : undefined}
            >
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={props.user?.email}
                autoComplete="off"
                readOnly={props.mode === "edit"}
                disabled={props.mode === "edit"}
                required
              />
            </Field>
            <Field
              label="Role"
              name="role"
              error={errors?.role}
              required
              hint={props.isSelf ? "You cannot change your own role." : undefined}
            >
              <NativeSelect
                id="role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={props.isSelf}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
              {props.isSelf ? <input type="hidden" name="role" value={role} /> : null}
            </Field>
            {props.mode === "create" ? (
              <Field
                label="Temporary password"
                name="password"
                error={errors?.password}
                required
                hint="At least 12 characters with a letter and a digit."
              >
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </Field>
            ) : (
              <Field
                label="Status"
                name="isActive"
                error={errors?.isActive}
                hint={props.isSelf ? "You cannot disable your own account." : undefined}
              >
                <label className="flex h-8 items-center gap-2 text-sm">
                  <Checkbox
                    id="isActive"
                    name="isActive"
                    defaultChecked={props.user.isActive}
                    disabled={props.isSelf}
                  />
                  Active — can sign in
                </label>
                {props.isSelf ? <input type="hidden" name="isActive" value="on" /> : null}
              </Field>
            )}
          </FieldGrid>

          <div className="space-y-2">
            <Label className="text-[13px]">Company access</Label>
            {role === "ADMIN" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Administrators have access to every company automatically.
              </p>
            ) : props.companies.length === 0 ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                No companies exist yet.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {props.companies.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm has-checked:border-primary/40 has-checked:bg-accent/60">
                      <Checkbox
                        name="companyIds"
                        value={c.id}
                        defaultChecked={props.user?.companyIds.includes(c.id)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.legalName}</span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {c.code}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {errors?.companyIds?.length ? (
              <p className="text-xs text-destructive">{errors.companyIds[0]}</p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <SubmitButton pendingText="Saving…">
            {props.mode === "create" ? "Create user" : "Save changes"}
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
