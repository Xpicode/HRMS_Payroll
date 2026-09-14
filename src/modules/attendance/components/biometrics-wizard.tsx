"use client";

import { useActionState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState, type ActionResult } from "@/lib/action-result";
import type { BiometricsPreview } from "../service";
import { DAY_TYPE_SHORT } from "../schema";
import { biometricsCommitAction, biometricsPreviewAction } from "../actions";

const initialPreview: ActionResult<BiometricsPreview> = { ok: false };

export function BiometricsWizard({ companyId }: { companyId: string }) {
  const [preview, previewAction] = useActionState(
    biometricsPreviewAction.bind(null, companyId),
    initialPreview,
  );
  const [commit, commitAction] = useActionState(
    biometricsCommitAction.bind(null, companyId),
    initialActionState,
  );
  const data = preview.ok ? preview.data : undefined;
  const previewErrors = !preview.ok ? preview.fieldErrors : undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Upload the biometrics export</CardTitle>
          <CardDescription>
            Columns: employee_no, date, time_in, time_out. Several punches on the same day are
            merged (earliest in, latest out). Nothing is saved until you confirm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={previewAction} className="flex flex-wrap items-end gap-3">
            <Field
              label="CSV file"
              name="file"
              error={previewErrors?.file}
              className="w-full sm:w-96"
            >
              <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
            </Field>
            <SubmitButton pendingText="Checking…">Preview</SubmitButton>
          </form>
          {!preview.ok && preview.message ? (
            <div className="mt-4">
              <FormAlert state={preview} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Review and import</CardTitle>
            <CardDescription className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2Icon className="size-4" /> {data.validCount} ready
              </span>
              <span className="inline-flex items-center gap-1 text-warning-foreground">
                <AlertTriangleIcon className="size-4" /> {data.warningCount} with warnings
              </span>
              <span className="inline-flex items-center gap-1 text-destructive">
                <XCircleIcon className="size-4" /> {data.errorCount} with errors
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Line</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-16">Type</TableHead>
                    <TableHead className="w-16">In</TableHead>
                    <TableHead className="w-16">Out</TableHead>
                    <TableHead className="w-16 text-right">Hours</TableHead>
                    <TableHead className="w-14 text-right">Late</TableHead>
                    <TableHead className="w-14 text-right">UT</TableHead>
                    <TableHead className="w-14 text-right">OT</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow
                      key={`${r.line}-${r.employeeNo}-${r.date}`}
                      className={r.errors.length ? "bg-destructive/5" : undefined}
                    >
                      <TableCell className="font-mono text-xs">{r.line}</TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono text-xs">{r.employeeNo}</span>
                        {r.name ? <span className="ml-2">{r.name}</span> : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.date ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.dayType ? DAY_TYPE_SHORT[r.dayType] : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.timeIn ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.timeOut ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs tabular">
                        {r.computed?.hoursWorked ?? ""}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular">
                        {r.computed?.lateMinutes || ""}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular">
                        {r.computed?.undertimeMinutes || ""}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular">
                        {r.computed?.otHours || ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.errors.length ? (
                          <ul className="list-disc space-y-0.5 pl-4 text-destructive">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : null}
                        {r.warnings.length ? (
                          <ul className="list-disc space-y-0.5 pl-4 text-warning-foreground">
                            {r.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        ) : null}
                        {!r.errors.length && !r.warnings.length ? (
                          <Badge variant="secondary">OK</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.validCount === 0 ? (
              <p className="text-sm text-destructive">
                No importable rows. Fix the file and upload it again.
              </p>
            ) : (
              <form action={commitAction} className="space-y-3">
                <input type="hidden" name="payload" value={JSON.stringify(data.payload)} />
                <FormAlert state={commit} />
                <p className="text-sm text-muted-foreground">
                  {data.errorCount > 0 ? "Rows with errors are skipped. " : ""}
                  Imported days are recomputed from the punches using each employee&apos;s shift and
                  the company policy.
                </p>
                <SubmitButton pendingText="Importing…">
                  Import {data.validCount} day(s)
                </SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
