"use client";

import { useActionState, useMemo, useState, type KeyboardEvent } from "react";
import type { DayType, DtrSource } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState, type ActionResult } from "@/lib/action-result";
import { formatDateOnly, WEEKDAY_SHORT } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { computeDay, parseHHMM } from "../compute";
import { summarizeCutoff } from "../summary";
import { DAY_TYPE_LABELS, DAY_TYPE_SHORT } from "../schema";
import type { AttendanceDay, Shift } from "../types";
import { saveDtrAction } from "../actions";

export type GridDayProp = {
  date: string;
  weekday: number;
  defaultDayType: DayType;
  holidayName: string | null;
  shift: Shift;
  record: AttendanceDay | null;
  source: DtrSource | null;
};

/** Per-row note shown under the date, e.g. what a card scan read for that day. */
export type DtrRowHint = { level: "ok" | "check" | "replaces"; note: string };

type Row = {
  date: string;
  dayType: DayType;
  timeIn: string;
  timeOut: string;
  hoursWorked: string;
  lateMinutes: string;
  undertimeMinutes: string;
  otHours: string;
  nightDiffHours: string;
  isAbsent: boolean;
  remarks: string;
};

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

const SOURCE_LABELS: Record<DtrSource, string | null> = {
  MANUAL: null,
  IMPORT: "imported",
  SCAN: "scanned",
  LEAVE: "approved leave",
};

function rowFrom(d: GridDayProp): Row {
  const r = d.record;
  return {
    date: d.date,
    dayType: r?.dayType ?? d.defaultDayType,
    timeIn: r?.timeIn ?? "",
    timeOut: r?.timeOut ?? "",
    hoursWorked: r && r.hoursWorked ? fmt(r.hoursWorked) : "",
    lateMinutes: r && r.lateMinutes ? String(r.lateMinutes) : "",
    undertimeMinutes: r && r.undertimeMinutes ? String(r.undertimeMinutes) : "",
    otHours: r && r.otHours ? fmt(r.otHours) : "",
    nightDiffHours: r && r.nightDiffHours ? fmt(r.nightDiffHours) : "",
    isAbsent: r?.isAbsent ?? false,
    remarks: r?.remarks ?? "",
  };
}

function computed(row: Row, shift: Shift) {
  return computeDay(
    {
      dayType: row.dayType,
      timeIn: row.timeIn || null,
      timeOut: row.timeOut || null,
      hoursWorked: numOrNull(row.hoursWorked),
      lateMinutes: numOrNull(row.lateMinutes),
      undertimeMinutes: numOrNull(row.undertimeMinutes),
      otHours: numOrNull(row.otHours),
      nightDiffHours: numOrNull(row.nightDiffHours),
      isAbsent: row.isAbsent,
    },
    shift,
  );
}

const ROW_TINT: Partial<Record<DayType, string>> = {
  REST_DAY: "bg-muted/60",
  REGULAR_HOLIDAY: "bg-brand/10",
  SPECIAL_NON_WORKING: "bg-brand/5",
  LEAVE_WITH_PAY: "bg-success/5",
  LEAVE_WITHOUT_PAY: "bg-warning/10",
};

const HINT_TEXT: Record<DtrRowHint["level"], string> = {
  ok: "text-success",
  check: "text-warning-foreground",
  replaces: "text-muted-foreground",
};

type Props = {
  companyId: string;
  employeeId: string;
  start: string;
  end: string;
  days: GridDayProp[];
  canEdit: boolean;
  /** Defaults to the manual save; the card scanner passes its own. */
  action?: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  submitLabel?: string;
  hints?: Record<string, DtrRowHint>;
};

export function DtrGrid({
  companyId,
  employeeId,
  start,
  end,
  days,
  canEdit,
  action,
  submitLabel,
  hints,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() => days.map(rowFrom));
  const [state, formAction] = useActionState(
    action ?? saveDtrAction.bind(null, companyId, employeeId, start, end),
    initialActionState,
  );
  const shifts = useMemo(() => new Map(days.map((d) => [d.date, d.shift])), [days]);

  const results = useMemo(() => rows.map((r) => computed(r, shifts.get(r.date)!)), [rows, shifts]);
  const summary = useMemo(
    () =>
      summarizeCutoff({
        employeeId,
        employeeNo: "",
        coverageStart: start,
        coverageEnd: end,
        days: rows.map((r, i) => ({
          date: r.date,
          dayType: r.dayType,
          record: {
            date: r.date,
            dayType: r.dayType,
            timeIn: r.timeIn || null,
            timeOut: r.timeOut || null,
            ...results[i]!,
            remarks: null,
          },
        })),
      }),
    [rows, results, employeeId, start, end],
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[i]!, ...patch };
      // When both punches are valid, refresh the OT / night-diff suggestions.
      const punchesChanged = "timeIn" in patch || "timeOut" in patch || "dayType" in patch;
      if (punchesChanged && parseHHMM(row.timeIn) !== null && parseHHMM(row.timeOut) !== null) {
        const c = computeDay(
          {
            dayType: row.dayType,
            timeIn: row.timeIn,
            timeOut: row.timeOut,
            hoursWorked: null,
            lateMinutes: null,
            undertimeMinutes: null,
            otHours: null,
            nightDiffHours: null,
            isAbsent: false,
          },
          shifts.get(row.date)!,
        );
        row.otHours = c.otHours ? fmt(c.otHours) : "";
        row.nightDiffHours = c.nightDiffHours ? fmt(c.nightDiffHours) : "";
      }
      next[i] = row;
      return next;
    });
  }

  /** Enter moves down the same column; the browser handles Tab. */
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Enter") return;
    const el = e.currentTarget;
    const col = el.dataset.col;
    const rowIndex = Number(el.dataset.row);
    if (!col || Number.isNaN(rowIndex)) return;
    e.preventDefault();
    const next = el
      .closest("table")
      ?.querySelector<HTMLElement>(`[data-col="${col}"][data-row="${rowIndex + 1}"]`);
    next?.focus();
    if (next instanceof HTMLInputElement) next.select();
  }

  const payload = useMemo(
    () =>
      JSON.stringify(
        rows.map((r) => ({
          date: r.date,
          dayType: r.dayType,
          timeIn: r.timeIn || null,
          timeOut: r.timeOut || null,
          hoursWorked: numOrNull(r.hoursWorked),
          lateMinutes: numOrNull(r.lateMinutes),
          undertimeMinutes: numOrNull(r.undertimeMinutes),
          otHours: numOrNull(r.otHours),
          nightDiffHours: numOrNull(r.nightDiffHours),
          isAbsent: r.isAbsent,
          remarks: r.remarks || null,
        })),
      ),
    [rows],
  );

  const cell =
    "h-8 w-full rounded-md border border-input bg-background px-1.5 text-sm tabular outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:bg-muted/60 disabled:text-muted-foreground read-only:bg-muted/40 read-only:text-muted-foreground";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rows" value={payload} />
      <FormAlert state={state} />

      <div className="scroll-shadow overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[980px] text-sm max-md:[&_tr>*:first-child]:sticky max-md:[&_tr>*:first-child]:left-0 max-md:[&_tr>*:first-child]:z-10 max-md:[&_tr>*:first-child]:bg-card max-md:[&_tr>*:first-child]:shadow-[inset_-1px_0_0_var(--border)]">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th className="w-36">Date</th>
              <th className="w-32">Type</th>
              <th className="w-24">In</th>
              <th className="w-24">Out</th>
              <th className="w-16 text-right">Hours</th>
              <th className="w-16 text-right">Late</th>
              <th className="w-16 text-right">UT</th>
              <th className="w-16 text-right">OT</th>
              <th className="w-16 text-right">ND</th>
              <th className="w-14 text-center">Absent</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const day = days[i]!;
              const c = results[i]!;
              const derived = c.derived && !r.isAbsent;
              const disabled = !canEdit || r.isAbsent;
              const hint = hints?.[r.date];
              const sourceLabel = day.source ? SOURCE_LABELS[day.source] : null;
              return (
                <tr
                  key={r.date}
                  className={cn(
                    "border-t [&>td]:px-2 [&>td]:py-1",
                    ROW_TINT[r.dayType],
                    c.isAbsent && "bg-destructive/5",
                    hint?.level === "check" && "bg-warning/10",
                  )}
                >
                  <td className="whitespace-nowrap">
                    <span className="font-medium">{formatDateOnly(r.date).slice(0, 6)}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {WEEKDAY_SHORT[day.weekday]}
                    </span>
                    {day.holidayName ? (
                      <span className="block truncate text-[11px] text-brand-foreground/80">
                        {day.holidayName}
                      </span>
                    ) : sourceLabel && !hint ? (
                      <span className="block text-[11px] text-muted-foreground">{sourceLabel}</span>
                    ) : null}
                    {hint ? (
                      <span
                        className={cn(
                          "block max-w-44 truncate font-mono text-[11px]",
                          HINT_TEXT[hint.level],
                        )}
                        title={hint.note}
                      >
                        {hint.note}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      value={r.dayType}
                      onChange={(e) => update(i, { dayType: e.target.value as DayType })}
                      onKeyDown={onKeyDown}
                      data-col="type"
                      data-row={i}
                      disabled={!canEdit}
                      aria-label={`Day type ${r.date}`}
                      className={cn(cell, "pr-1")}
                    >
                      {(Object.keys(DAY_TYPE_LABELS) as DayType[]).map((t) => (
                        <option key={t} value={t}>
                          {DAY_TYPE_SHORT[t]} · {DAY_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      value={r.timeIn}
                      onChange={(e) => update(i, { timeIn: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="in"
                      data-row={i}
                      disabled={disabled}
                      aria-label={`Time in ${r.date}`}
                      className={cell}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={r.timeOut}
                      onChange={(e) => update(i, { timeOut: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="out"
                      data-row={i}
                      disabled={disabled}
                      aria-label={`Time out ${r.date}`}
                      className={cell}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={derived ? fmt(c.hoursWorked) : r.hoursWorked}
                      readOnly={derived}
                      onChange={(e) => update(i, { hoursWorked: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="hours"
                      data-row={i}
                      disabled={disabled}
                      aria-label={`Hours ${r.date}`}
                      className={cn(cell, "text-right")}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={derived ? (c.lateMinutes ? String(c.lateMinutes) : "") : r.lateMinutes}
                      readOnly={derived}
                      onChange={(e) => update(i, { lateMinutes: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="late"
                      data-row={i}
                      disabled={disabled}
                      aria-label={`Late minutes ${r.date}`}
                      className={cn(cell, "text-right")}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={
                        derived
                          ? c.undertimeMinutes
                            ? String(c.undertimeMinutes)
                            : ""
                          : r.undertimeMinutes
                      }
                      readOnly={derived}
                      onChange={(e) => update(i, { undertimeMinutes: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="ut"
                      data-row={i}
                      disabled={disabled}
                      aria-label={`Undertime minutes ${r.date}`}
                      className={cn(cell, "text-right")}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={r.otHours}
                      onChange={(e) => update(i, { otHours: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="ot"
                      data-row={i}
                      disabled={disabled}
                      aria-label={`OT hours ${r.date}`}
                      className={cn(cell, "text-right")}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={r.nightDiffHours}
                      onChange={(e) => update(i, { nightDiffHours: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="nd"
                      data-row={i}
                      disabled={disabled}
                      aria-label={`Night differential hours ${r.date}`}
                      className={cn(cell, "text-right")}
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={r.isAbsent}
                      onChange={(e) => update(i, { isAbsent: e.target.checked })}
                      onKeyDown={onKeyDown}
                      data-col="absent"
                      data-row={i}
                      disabled={!canEdit}
                      aria-label={`Absent ${r.date}`}
                      className="size-4 accent-destructive"
                    />
                    {!r.isAbsent && c.isAbsent ? (
                      <span className="block text-[10px] text-destructive">auto</span>
                    ) : null}
                  </td>
                  <td>
                    <input
                      value={r.remarks}
                      onChange={(e) => update(i, { remarks: e.target.value })}
                      onKeyDown={onKeyDown}
                      data-col="remarks"
                      data-row={i}
                      disabled={!canEdit}
                      maxLength={200}
                      aria-label={`Remarks ${r.date}`}
                      className={cell}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t bg-muted/40 text-xs">
            <tr className="[&>td]:px-2 [&>td]:py-2">
              <td colSpan={4} className="text-muted-foreground">
                <span className="font-medium text-foreground">{summary.daysWorked}</span> days
                worked · <span className="font-medium text-foreground">{summary.absentDays}</span>{" "}
                absent of {summary.scheduledDays} scheduled
              </td>
              <td className="text-right tabular">
                {fmt(
                  summary.hoursWorkedByType.REGULAR +
                    summary.hoursWorkedByType.REST_DAY +
                    summary.hoursWorkedByType.SPECIAL +
                    summary.hoursWorkedByType.REGULAR_HOLIDAY,
                )}
              </td>
              <td className="text-right tabular">{summary.lateMinutes}</td>
              <td className="text-right tabular">{summary.undertimeMinutes}</td>
              <td className="text-right tabular">{fmt(summary.otHours)}</td>
              <td className="text-right tabular">{fmt(summary.nightDiffHours)}</td>
              <td colSpan={2} className="text-muted-foreground">
                OT — Reg {fmt(summary.otHoursByType.REGULAR)} · Rest{" "}
                {fmt(summary.otHoursByType.REST_DAY)} · Spec {fmt(summary.otHoursByType.SPECIAL)} ·
                RH {fmt(summary.otHoursByType.REGULAR_HOLIDAY)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {canEdit ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Time in/out derive hours, late and undertime. OT and night differential are suggested
            from the punches and can be edited. Enter moves down a column; Tab moves across.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRows(days.map(rowFrom))}>
              Reset
            </Button>
            <SubmitButton pendingText="Saving…">{submitLabel ?? "Save attendance"}</SubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}
