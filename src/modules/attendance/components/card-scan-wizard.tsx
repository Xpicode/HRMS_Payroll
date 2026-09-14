"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { AlertTriangleIcon, ScanLineIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import type { CardScanPreview } from "../service";
import { cardScanPreviewAction, saveScannedDtrAction } from "../actions";
import { DtrGrid } from "./dtr-grid";

type Employee = { id: string; employeeNo: string; name: string };

type Props = {
  companyId: string;
  start: string;
  end: string;
  employees: Employee[];
  defaultEmployeeId?: string;
  canSave: boolean;
};

/** Longest side sent to the server; phone photos are 3–5 MB and the OCR needs far less. */
const MAX_SIDE = 2200;

/**
 * Downscale and re-encode in the browser (also strips EXIF; orientation is applied by
 * createImageBitmap). If the browser cannot decode the file (e.g. HEIC on Windows) the
 * original is sent and the server validates it.
 */
async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) throw new Error("encode failed");
    return blob;
  } catch {
    return file;
  }
}

const initialPreview: ActionResult<CardScanPreview> = { ok: false };

const BOX_STYLE = {
  time: "border-success bg-success/15",
  anchor: "border-brand bg-brand/15",
  ignored: "border-dashed border-muted-foreground/60",
} as const;

export function CardScanWizard({
  companyId,
  start,
  end,
  employees,
  defaultEmployeeId,
  canSave,
}: Props) {
  const [preview, previewAction, pending] = useActionState(
    cardScanPreviewAction.bind(null, companyId),
    initialPreview,
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [scanKey, setScanKey] = useState(0);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("image");
    if (!(file instanceof File) || file.size === 0) {
      setLocalError("Choose a photo of the card.");
      return;
    }
    setLocalError(null);
    setPreparing(true);
    try {
      const blob = await downscale(file);
      fd.set("image", blob, "card.jpg");
      setImageUrl(URL.createObjectURL(blob));
      setScanKey((k) => k + 1);
      startTransition(() => previewAction(fd));
    } finally {
      setPreparing(false);
    }
  }

  const data = preview.ok ? preview.data : undefined;
  const fieldErrors = !preview.ok ? preview.fieldErrors : undefined;
  const busy = preparing || pending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Pick the employee and photograph the card</CardTitle>
          <CardDescription>
            One side of the card per photo (days 1–15 or 16–31). Lay it flat, keep it straight, fill
            the frame, avoid shadows. The photo is read on this server and not stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="start" value={start} />
            <input type="hidden" name="end" value={end} />
            <Field
              label="Employee"
              name="employeeId"
              error={fieldErrors?.employeeId}
              className="w-full sm:w-72"
            >
              <NativeSelect
                id="employeeId"
                name="employeeId"
                defaultValue={defaultEmployeeId ?? ""}
                required
              >
                <option value="" disabled>
                  Choose…
                </option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeNo} · {e.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Card photo"
              name="image"
              error={fieldErrors?.image ?? (localError ? [localError] : undefined)}
              className="w-full sm:w-80"
            >
              <Input id="image" name="image" type="file" accept="image/*" required />
            </Field>
            <SubmitButton disabled={busy} pendingText="Reading…">
              {preparing ? "Preparing…" : pending ? "Reading…" : "Scan card"}
            </SubmitButton>
          </form>
          {!preview.ok && preview.message ? (
            <div className="mt-4">
              <FormAlert state={preview} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data && imageUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Check the grid against the card, then save</CardTitle>
            <CardDescription>
              {data.employee.employeeNo} · {data.employee.name}. Punches were read on{" "}
              <span className="font-medium text-foreground">{data.found}</span> day(s). Rows in
              amber need a look; the text under each date is what the card says.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.warnings.map((w) => (
              <Alert key={w} className="border-warning/40 bg-warning/5 text-warning-foreground">
                <AlertTriangleIcon />
                <AlertTitle>Check the scan</AlertTitle>
                <AlertDescription>{w}</AlertDescription>
              </Alert>
            ))}
            <div className="grid gap-6 xl:grid-cols-[minmax(260px,360px)_1fr]">
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-lg border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  <img src={imageUrl} alt="Scanned DTR card" className="block w-full" />
                  {showBoxes
                    ? data.words.map((w, i) => (
                        <div
                          key={i}
                          title={`${w.text} (${Math.round(w.confidence)}%)${w.day ? ` · day ${w.day}` : ""}`}
                          className={cn(
                            "pointer-events-auto absolute rounded-sm border",
                            BOX_STYLE[w.kind],
                          )}
                          style={{
                            left: `${(w.x0 / data.image.width) * 100}%`,
                            top: `${(w.y0 / data.image.height) * 100}%`,
                            width: `${((w.x1 - w.x0) / data.image.width) * 100}%`,
                            height: `${((w.y1 - w.y0) / data.image.height) * 100}%`,
                          }}
                        />
                      ))
                    : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={showBoxes}
                      onChange={(e) => setShowBoxes(e.target.checked)}
                      className="size-3.5"
                    />
                    Show what was read
                  </label>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-3 rounded-sm border border-success bg-success/15" />
                    punch
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-3 rounded-sm border border-brand bg-brand/15" />
                    day number
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-3 rounded-sm border border-dashed border-muted-foreground/60" />
                    ignored
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <DtrGrid
                  key={scanKey}
                  companyId={companyId}
                  employeeId={data.employee.id}
                  start={start}
                  end={end}
                  days={data.days}
                  canEdit={canSave}
                  action={saveScannedDtrAction.bind(null, companyId, data.employee.id, start, end)}
                  submitLabel="Save scanned attendance"
                  hints={data.hints}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : busy ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ScanLineIcon className="size-4 animate-pulse" /> Reading the card…
        </p>
      ) : null}
    </div>
  );
}
