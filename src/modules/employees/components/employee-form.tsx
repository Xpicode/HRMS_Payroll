"use client";

import { useActionState, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { EmployeeStatus, TaxStatus } from "@/generated/prisma/enums";
import { EMPLOYEE_STATUS_LABELS, formatGovId } from "../schema";
import { createEmployeeAction, updateEmployeeAction } from "../actions";

export type EmployeeFormValues = {
  id: string;
  employeeNo: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  birthDate: string | null;
  hireDate: string;
  separationDate: string | null;
  status: EmployeeStatus;
  position: string | null;
  department: string | null;
  email: string | null;
  mobile: string | null;
  address: string | null;
  sssNo: string | null;
  philhealthNo: string | null;
  pagibigMid: string | null;
  tin: string | null;
  taxStatus: TaxStatus;
};

type Props = {
  companyId: string;
  departments: string[];
  nextEmployeeNo: string;
} & ({ mode: "create"; employee?: undefined } | { mode: "edit"; employee: EmployeeFormValues });

export function EmployeeForm(props: Props) {
  const action =
    props.mode === "create"
      ? createEmployeeAction.bind(null, props.companyId)
      : updateEmployeeAction.bind(null, props.companyId, props.employee.id);
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const errors = !state.ok ? state.fieldErrors : undefined;
  const warnings = !state.ok && state.needsConfirm ? state.warnings : undefined;
  const e = props.employee;
  // After a failed submit React resets uncontrolled inputs; re-seed them from the echoed values.
  const v = !state.ok ? state.values : undefined;
  const [status, setStatus] = useState<EmployeeStatus>(
    (v?.status as EmployeeStatus | undefined) ?? props.employee?.status ?? "ACTIVE",
  );
  const d = (name: keyof EmployeeFormValues, fallback: string | null | undefined) =>
    v?.[name] ?? fallback ?? "";

  return (
    <form action={formAction} noValidate>
      {/* key changes per result so inputs remount with fresh defaults instead of mutating them */}
      <div
        key={pending ? "pending" : state.ok ? "ok" : state.values ? "echo" : "init"}
        className="contents"
      >
        <Card>
          <CardHeader>
            <CardTitle>{props.mode === "create" ? "New employee" : "201 record"}</CardTitle>
            <CardDescription>
              Personal details, employment, contact and government IDs. Pay is set on the Pay
              settings tab.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormAlert state={state} />
            {warnings?.length ? (
              <Alert className="border-warning/50 bg-warning/10 text-warning-foreground">
                <AlertTriangleIcon />
                <AlertTitle>Check the government IDs before saving</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  {/* A submit button with its own name/value: the flag travels with this click only. */}
                  <Button
                    type="submit"
                    name="confirmWarnings"
                    value="1"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    Save anyway
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            <FieldGrid className="sm:grid-cols-4">
              <Field
                label="Employee no."
                name="employeeNo"
                error={errors?.employeeNo}
                hint={props.mode === "create" ? `Blank = ${props.nextEmployeeNo}` : undefined}
              >
                <Input
                  id="employeeNo"
                  name="employeeNo"
                  defaultValue={d("employeeNo", e?.employeeNo)}
                  placeholder={props.mode === "create" ? props.nextEmployeeNo : undefined}
                  className="font-mono uppercase"
                  maxLength={20}
                />
              </Field>
              <Field label="Last name" name="lastName" error={errors?.lastName} required>
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={d("lastName", e?.lastName)}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="First name" name="firstName" error={errors?.firstName} required>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={d("firstName", e?.firstName)}
                  autoComplete="off"
                  required
                />
              </Field>
              <FieldGrid className="grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem]">
                <Field label="Middle name" name="middleName" error={errors?.middleName}>
                  <Input
                    id="middleName"
                    name="middleName"
                    defaultValue={d("middleName", e?.middleName)}
                  />
                </Field>
                <Field label="Suffix" name="suffix" error={errors?.suffix}>
                  <Input
                    id="suffix"
                    name="suffix"
                    defaultValue={d("suffix", e?.suffix)}
                    placeholder="Jr."
                  />
                </Field>
              </FieldGrid>
            </FieldGrid>

            <Separator />
            <div>
              <p className="mb-3 text-sm font-medium">Employment</p>
              <FieldGrid className="sm:grid-cols-4">
                <Field label="Birth date" name="birthDate" error={errors?.birthDate}>
                  <Input
                    id="birthDate"
                    name="birthDate"
                    type="date"
                    defaultValue={d("birthDate", e?.birthDate)}
                  />
                </Field>
                <Field label="Hire date" name="hireDate" error={errors?.hireDate} required>
                  <Input
                    id="hireDate"
                    name="hireDate"
                    type="date"
                    defaultValue={d("hireDate", e?.hireDate)}
                    required
                  />
                </Field>
                <Field label="Status" name="status" error={errors?.status} required>
                  <NativeSelect
                    id="status"
                    name="status"
                    value={status}
                    onChange={(ev) => setStatus(ev.target.value as EmployeeStatus)}
                  >
                    {(Object.keys(EMPLOYEE_STATUS_LABELS) as EmployeeStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {EMPLOYEE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field
                  label="Separation date"
                  name="separationDate"
                  error={errors?.separationDate}
                  required={status === "SEPARATED"}
                >
                  <Input
                    id="separationDate"
                    name="separationDate"
                    type="date"
                    defaultValue={d("separationDate", e?.separationDate)}
                    disabled={status !== "SEPARATED"}
                  />
                </Field>
                <Field label="Position" name="position" error={errors?.position}>
                  <Input id="position" name="position" defaultValue={d("position", e?.position)} />
                </Field>
                <Field
                  label="Department"
                  name="department"
                  error={errors?.department}
                  hint="Type a new one or pick an existing."
                >
                  <Input
                    id="department"
                    name="department"
                    defaultValue={d("department", e?.department)}
                    list="departments"
                  />
                  <datalist id="departments">
                    {props.departments.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </Field>
              </FieldGrid>
            </div>

            <Separator />
            <div>
              <p className="mb-3 text-sm font-medium">Contact</p>
              <FieldGrid className="sm:grid-cols-4">
                <Field
                  label="Email"
                  name="email"
                  error={errors?.email}
                  hint="Used for payslip emailing later."
                >
                  <Input id="email" name="email" type="email" defaultValue={d("email", e?.email)} />
                </Field>
                <Field label="Mobile" name="mobile" error={errors?.mobile}>
                  <Input
                    id="mobile"
                    name="mobile"
                    defaultValue={d("mobile", e?.mobile)}
                    inputMode="tel"
                  />
                </Field>
                <Field
                  label="Address"
                  name="address"
                  error={errors?.address}
                  className="sm:col-span-2"
                >
                  <Textarea
                    id="address"
                    name="address"
                    defaultValue={d("address", e?.address)}
                    rows={1}
                  />
                </Field>
              </FieldGrid>
            </div>

            <Separator />
            <div>
              <p className="mb-1 text-sm font-medium">Government IDs</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Dashes are optional; only digits are kept. Unusual lengths are flagged, not blocked.
              </p>
              <FieldGrid className="sm:grid-cols-5">
                <Field label="SSS no." name="sssNo" error={errors?.sssNo} hint="10 digits">
                  <Input
                    id="sssNo"
                    name="sssNo"
                    defaultValue={v?.sssNo ?? formatGovId("sssNo", e?.sssNo ?? null)}
                    className="font-mono"
                    inputMode="numeric"
                  />
                </Field>
                <Field
                  label="PhilHealth no."
                  name="philhealthNo"
                  error={errors?.philhealthNo}
                  hint="12 digits"
                >
                  <Input
                    id="philhealthNo"
                    name="philhealthNo"
                    defaultValue={
                      v?.philhealthNo ?? formatGovId("philhealthNo", e?.philhealthNo ?? null)
                    }
                    className="font-mono"
                    inputMode="numeric"
                  />
                </Field>
                <Field
                  label="Pag-IBIG MID"
                  name="pagibigMid"
                  error={errors?.pagibigMid}
                  hint="12 digits"
                >
                  <Input
                    id="pagibigMid"
                    name="pagibigMid"
                    defaultValue={v?.pagibigMid ?? formatGovId("pagibigMid", e?.pagibigMid ?? null)}
                    className="font-mono"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="TIN" name="tin" error={errors?.tin} hint="9–12 digits">
                  <Input
                    id="tin"
                    name="tin"
                    defaultValue={v?.tin ?? formatGovId("tin", e?.tin ?? null)}
                    className="font-mono"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Tax status" name="taxStatus" error={errors?.taxStatus}>
                  <NativeSelect
                    id="taxStatus"
                    name="taxStatus"
                    defaultValue={v?.taxStatus ?? e?.taxStatus ?? "S"}
                  >
                    {Object.values(TaxStatus).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldGrid>
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <SubmitButton pendingText="Saving…">
              {props.mode === "create" ? "Create employee" : "Save changes"}
            </SubmitButton>
          </CardFooter>
        </Card>
      </div>
    </form>
  );
}
