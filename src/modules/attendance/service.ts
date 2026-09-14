import "server-only";
import type { DayType, HolidayType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { parseCsv } from "@/lib/csv";
import { dayOfWeek, daysInMonth, eachDay, toDateOnly, toIsoDate, type Cutoff } from "@/lib/dates";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { getCompany, listHolidaysInRange } from "@/modules/companies/service";
import * as repo from "./repo";
import { computeDay, DEFAULT_SHIFT, round2, type DayEntry } from "./compute";
import { resolveDayType, summarizeCutoff, type SummaryDay } from "./summary";
import {
  BIOMETRICS_COLUMNS,
  biometricsPayloadSchema,
  dtrGridSchema,
  normalizeCsvDate,
  normalizeCsvTime,
  type DtrRowInput,
} from "./schema";
import type { AttendanceDay, CutoffSummary, Shift } from "./types";

// ---------------------------------------------------------------------------
// Context: policy, holidays, per-employee schedule
// ---------------------------------------------------------------------------

type PaySettingLike = {
  effectiveFrom: Date;
  restDayOfWeek: number;
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
};

/** The pay setting in force on `date`; before the first one, the earliest is used. */
export function paySettingOn<T extends { effectiveFrom: Date }>(
  settingsDesc: T[],
  date: string,
): T | null {
  if (settingsDesc.length === 0) return null;
  const d = toDateOnly(date).getTime();
  return (
    settingsDesc.find((s) => s.effectiveFrom.getTime() <= d) ??
    settingsDesc[settingsDesc.length - 1]!
  );
}

export type CutoffContext = {
  cutoff: Cutoff;
  days: string[];
  hoursPerDay: number;
  lateGraceMinutes: number;
  /** date -> holiday type (company-specific row wins over national). */
  holidays: Map<string, { type: HolidayType; name: string }>;
};

async function loadContext(
  scope: Scope,
  companyId: string,
  cutoff: Cutoff,
): Promise<CutoffContext> {
  const [policy, holidayRows] = await Promise.all([
    repo.findPolicyOn(scope, companyId, cutoff.end),
    listHolidaysInRange(scope, companyId, cutoff.start, cutoff.end),
  ]);
  const holidays = new Map<string, { type: HolidayType; name: string }>();
  for (const h of holidayRows) {
    const key = toIsoDate(h.date);
    const existing = holidays.get(key);
    // company row (companyId set) overrides a national row on the same date
    if (!existing || h.companyId !== null) holidays.set(key, { type: h.type, name: h.name });
  }
  return {
    cutoff,
    days: eachDay(cutoff.start, cutoff.end),
    hoursPerDay: policy ? Number(policy.hoursPerDay.toString()) : DEFAULT_SHIFT.hoursPerDay,
    lateGraceMinutes: policy?.lateGraceMinutes ?? 0,
    holidays,
  };
}

/** Whole-month context ("YYYY-MM"), used when import rows span arbitrary dates. */
function monthCutoff(month: string): Cutoff {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`,
    sequenceInMonth: 1,
  };
}

function shiftFor(ctx: CutoffContext, setting: PaySettingLike | null): Shift {
  return {
    start: setting?.shiftStart ?? DEFAULT_SHIFT.start,
    end: setting?.shiftEnd ?? DEFAULT_SHIFT.end,
    breakMinutes: setting?.breakMinutes ?? DEFAULT_SHIFT.breakMinutes,
    hoursPerDay: ctx.hoursPerDay,
    lateGraceMinutes: ctx.lateGraceMinutes,
  };
}

function defaultDayType(ctx: CutoffContext, date: string, setting: PaySettingLike | null): DayType {
  const holiday = ctx.holidays.get(date)?.type ?? null;
  const restDay = setting?.restDayOfWeek ?? 0;
  return resolveDayType(holiday, dayOfWeek(date) === restDay);
}

function toAttendanceDay(r: {
  date: Date;
  dayType: DayType;
  timeIn: string | null;
  timeOut: string | null;
  hoursWorked: { toString(): string };
  lateMinutes: number;
  undertimeMinutes: number;
  otHours: { toString(): string };
  nightDiffHours: { toString(): string };
  isAbsent: boolean;
  remarks: string | null;
}): AttendanceDay {
  return {
    date: toIsoDate(r.date),
    dayType: r.dayType,
    timeIn: r.timeIn,
    timeOut: r.timeOut,
    hoursWorked: Number(r.hoursWorked.toString()),
    lateMinutes: r.lateMinutes,
    undertimeMinutes: r.undertimeMinutes,
    otHours: Number(r.otHours.toString()),
    nightDiffHours: Number(r.nightDiffHours.toString()),
    isAbsent: r.isAbsent,
    remarks: r.remarks,
  };
}

// ---------------------------------------------------------------------------
// Cutoff overview
// ---------------------------------------------------------------------------

export async function getPayFrequency(scope: Scope, companyId: string) {
  const company = await getCompany(scope, companyId);
  if (!company) throw new AppError("Company not found.");
  return company.payFrequency;
}

export type EmployeeCutoffRow = {
  employeeId: string;
  employeeNo: string;
  name: string;
  department: string | null;
  summary: CutoffSummary;
  recordedDays: number;
};

export async function cutoffOverview(scope: Scope, companyId: string, cutoff: Cutoff) {
  assertPermission(scope, "attendance.view");
  assertCompanyAccess(scope, companyId);
  const ctx = await loadContext(scope, companyId, cutoff);
  const [employees, records] = await Promise.all([
    repo.listEmployeesForRange(scope, companyId, cutoff.start, cutoff.end),
    repo.listRecords(scope, companyId, cutoff.start, cutoff.end),
  ]);
  const byEmployee = new Map<string, Map<string, AttendanceDay>>();
  for (const r of records) {
    const m = byEmployee.get(r.employeeId) ?? new Map<string, AttendanceDay>();
    m.set(toIsoDate(r.date), toAttendanceDay(r));
    byEmployee.set(r.employeeId, m);
  }
  const rows: EmployeeCutoffRow[] = employees.map((e) => {
    const recs = byEmployee.get(e.id) ?? new Map<string, AttendanceDay>();
    const days: SummaryDay[] = ctx.days.map((date) => ({
      date,
      dayType: defaultDayType(ctx, date, paySettingOn(e.paySettings, date)),
      record: recs.get(date) ?? null,
    }));
    const summary = summarizeCutoff({
      employeeId: e.id,
      employeeNo: e.employeeNo,
      coverageStart: cutoff.start,
      coverageEnd: cutoff.end,
      days,
    });
    return {
      employeeId: e.id,
      employeeNo: e.employeeNo,
      name: `${e.lastName}, ${e.firstName}`,
      department: e.department,
      summary,
      recordedDays: recs.size,
    };
  });
  return { ctx, rows };
}

/** Attendance summary for one employee — the engine's entry point in Phase 3. */
export async function cutoffSummaryFor(
  scope: Scope,
  companyId: string,
  employeeId: string,
  cutoff: Cutoff,
): Promise<CutoffSummary> {
  const { rows } = await cutoffOverview(scope, companyId, cutoff);
  const row = rows.find((r) => r.employeeId === employeeId);
  if (!row) throw new AppError("Employee not found in this cutoff.");
  return row.summary;
}

// ---------------------------------------------------------------------------
// Employee DTR grid
// ---------------------------------------------------------------------------

export type GridDay = {
  date: string;
  weekday: number;
  defaultDayType: DayType;
  holidayName: string | null;
  shift: Shift;
  record: AttendanceDay | null;
  source: "MANUAL" | "IMPORT" | null;
};

export async function employeeDtr(
  scope: Scope,
  companyId: string,
  employeeId: string,
  cutoff: Cutoff,
) {
  assertPermission(scope, "attendance.view");
  assertCompanyAccess(scope, companyId);
  const employee = await repo.getEmployeeWithPaySettings(scope, companyId, employeeId);
  if (!employee) throw new AppError("Employee not found.");
  const ctx = await loadContext(scope, companyId, cutoff);
  const records = await repo.listRecords(scope, companyId, cutoff.start, cutoff.end, employeeId);
  const byDate = new Map(records.map((r) => [toIsoDate(r.date), r]));
  const days: GridDay[] = ctx.days.map((date) => {
    const setting = paySettingOn(employee.paySettings, date);
    const r = byDate.get(date);
    return {
      date,
      weekday: dayOfWeek(date),
      defaultDayType: defaultDayType(ctx, date, setting),
      holidayName: ctx.holidays.get(date)?.name ?? null,
      shift: shiftFor(ctx, setting),
      record: r ? toAttendanceDay(r) : null,
      source: r?.source ?? null,
    };
  });
  const summaryDays: SummaryDay[] = days.map((d) => ({
    date: d.date,
    dayType: d.defaultDayType,
    record: d.record,
  }));
  const summary = summarizeCutoff({
    employeeId,
    employeeNo: employee.employeeNo,
    coverageStart: cutoff.start,
    coverageEnd: cutoff.end,
    days: summaryDays,
  });
  const version = `${records.length}:${records.reduce((m, r) => Math.max(m, r.updatedAt.getTime()), 0)}`;
  return { employee, ctx, days, summary, version };
}

/** Previous/next employee in cutoff order, for the grid's navigation. */
export async function employeeNeighbours(
  scope: Scope,
  companyId: string,
  cutoff: Cutoff,
  employeeId: string,
) {
  assertCompanyAccess(scope, companyId);
  const employees = await repo.listEmployeesForRange(scope, companyId, cutoff.start, cutoff.end);
  const i = employees.findIndex((e) => e.id === employeeId);
  const pick = (e: (typeof employees)[number] | undefined) =>
    e ? { id: e.id, name: `${e.lastName}, ${e.firstName}` } : null;
  return {
    prev: pick(i > 0 ? employees[i - 1] : undefined),
    next: pick(i >= 0 ? employees[i + 1] : undefined),
    index: i,
    total: employees.length,
  };
}

function toEntry(row: DtrRowInput): DayEntry {
  return {
    dayType: row.dayType,
    timeIn: row.timeIn,
    timeOut: row.timeOut,
    hoursWorked: row.hoursWorked,
    lateMinutes: row.lateMinutes,
    undertimeMinutes: row.undertimeMinutes,
    otHours: row.otHours,
    nightDiffHours: row.nightDiffHours,
    isAbsent: row.isAbsent,
  };
}

export async function saveEmployeeDtr(
  scope: Scope,
  companyId: string,
  employeeId: string,
  cutoff: Cutoff,
  input: unknown,
) {
  assertPermission(scope, "attendance.manage");
  assertCompanyAccess(scope, companyId);
  const parsed = dtrGridSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError("Some cells are invalid. Check times (HH:MM), hours and minutes.");
  const rows = parsed.data;
  const inRange = new Set(eachDay(cutoff.start, cutoff.end));
  if (rows.some((r) => !inRange.has(r.date))) throw new AppError("A row falls outside the cutoff.");
  if (new Set(rows.map((r) => r.date)).size !== rows.length)
    throw new AppError("Duplicate dates in the grid.");

  const employee = await repo.getEmployeeWithPaySettings(scope, companyId, employeeId);
  if (!employee) throw new AppError("Employee not found.");
  const ctx = await loadContext(scope, companyId, cutoff);

  const recordRows: repo.RecordRow[] = rows.map((r) => {
    const setting = paySettingOn(employee.paySettings, r.date);
    const c = computeDay(toEntry(r), shiftFor(ctx, setting));
    return {
      date: toDateOnly(r.date),
      dayType: r.dayType,
      timeIn: r.isAbsent ? null : r.timeIn,
      timeOut: r.isAbsent ? null : r.timeOut,
      hoursWorked: c.hoursWorked,
      lateMinutes: c.lateMinutes,
      undertimeMinutes: c.undertimeMinutes,
      otHours: c.otHours,
      nightDiffHours: c.nightDiffHours,
      isAbsent: c.isAbsent,
      remarks: r.remarks,
      source: "MANUAL",
    };
  });

  return repo.transaction(scope, async (tx) => {
    const before = await repo.listRecordsInRange(
      tx,
      companyId,
      cutoff.start,
      cutoff.end,
      employeeId,
    );
    const result = await repo.saveRecords(tx, companyId, employeeId, recordRows);
    const after = await repo.listRecordsInRange(
      tx,
      companyId,
      cutoff.start,
      cutoff.end,
      employeeId,
    );
    await audit(
      "DailyTimeRecord",
      `${employeeId}:${cutoff.start}..${cutoff.end}`,
      before.length ? "UPDATE" : "CREATE",
      before.map(toAttendanceDay),
      after.map(toAttendanceDay),
      { scope, companyId, tx },
    );
    return result;
  });
}

// ---------------------------------------------------------------------------
// Biometrics CSV import
// ---------------------------------------------------------------------------

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export type BiometricsPreviewRow = {
  line: number;
  employeeNo: string;
  name: string | null;
  date: string | null;
  timeIn: string | null;
  timeOut: string | null;
  dayType: DayType | null;
  computed: {
    hoursWorked: number;
    lateMinutes: number;
    undertimeMinutes: number;
    otHours: number;
  } | null;
  errors: string[];
  warnings: string[];
};

export type BiometricsPreview = {
  rows: BiometricsPreviewRow[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  /** Validated rows to commit, keyed by employee id. */
  payload: { employeeId: string; date: string; timeIn: string | null; timeOut: string | null }[];
};

/**
 * Multiple punches on the same employee-day are merged: earliest in, latest out.
 */
export async function previewBiometrics(
  scope: Scope,
  companyId: string,
  csvText: string,
): Promise<BiometricsPreview> {
  assertPermission(scope, "attendance.import");
  assertCompanyAccess(scope, companyId);
  const parsed = parseCsv(csvText, { maxRows: 5000 });
  const missing = BIOMETRICS_COLUMNS.filter((c) => !parsed.headers.includes(c));
  if (missing.length)
    throw new AppError(
      `Missing column(s): ${missing.join(", ")}. Expected: ${BIOMETRICS_COLUMNS.join(", ")}.`,
    );

  // First pass: normalise and merge punches per employee-day.
  type Punch = {
    line: number;
    employeeNo: string;
    date: string;
    timeIn: string | null;
    timeOut: string | null;
  };
  const merged = new Map<string, Punch>();
  const rows: BiometricsPreviewRow[] = [];
  parsed.rows.forEach((raw, i) => {
    const line = i + 2;
    const employeeNo = (raw.employee_no ?? "").trim().toUpperCase();
    const date = normalizeCsvDate(raw.date ?? "");
    const timeIn = normalizeCsvTime(raw.time_in ?? "");
    const timeOut = normalizeCsvTime(raw.time_out ?? "");
    const errors: string[] = [];
    if (!employeeNo) errors.push("employee_no: required");
    if (!date) errors.push("date: use YYYY-MM-DD or M/D/YYYY");
    if (timeIn === undefined) errors.push("time_in: use HH:MM");
    if (timeOut === undefined) errors.push("time_out: use HH:MM");
    if (errors.length) {
      rows.push({
        line,
        employeeNo,
        name: null,
        date,
        timeIn: timeIn ?? null,
        timeOut: timeOut ?? null,
        dayType: null,
        computed: null,
        errors,
        warnings: [],
      });
      return;
    }
    const key = `${employeeNo}|${date}`;
    const prev = merged.get(key);
    if (prev) {
      prev.timeIn = [prev.timeIn, timeIn].filter((t): t is string => t !== null).sort()[0] ?? null;
      prev.timeOut =
        [prev.timeOut, timeOut]
          .filter((t): t is string => t !== null)
          .sort()
          .at(-1) ?? null;
    } else {
      merged.set(key, {
        line,
        employeeNo,
        date: date!,
        timeIn: timeIn ?? null,
        timeOut: timeOut ?? null,
      });
    }
  });

  const punches = [...merged.values()];
  const nos = [...new Set(punches.map((p) => p.employeeNo))];
  const employees = nos.length ? await repo.findEmployeesByNos(scope, companyId, nos) : [];
  const byNo = new Map(employees.map((e) => [e.employeeNo, e]));
  const dates = punches.map((p) => p.date).sort();
  const start = dates[0];
  const end = dates.at(-1);
  const existing = start && end ? await repo.listRecords(scope, companyId, start, end) : [];
  const existingManual = new Set(
    existing
      .filter((r) => r.source === "MANUAL")
      .map((r) => `${r.employeeId}|${toIsoDate(r.date)}`),
  );
  const ctxCache = new Map<string, CutoffContext>();
  const payload: BiometricsPreview["payload"] = [];

  for (const p of punches) {
    const e = byNo.get(p.employeeNo);
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!e) errors.push(`employee_no: ${p.employeeNo} not found in this company`);
    if (p.timeIn && !p.timeOut)
      warnings.push("no time_out; will be saved as absent until completed");
    if (!p.timeIn && p.timeOut)
      warnings.push("no time_in; will be saved as absent until completed");
    if (e && existingManual.has(`${e.id}|${p.date}`))
      warnings.push("overwrites a manually encoded day");
    let dayType: DayType | null = null;
    let computed: BiometricsPreviewRow["computed"] = null;
    if (e) {
      const month = p.date.slice(0, 7);
      let ctx = ctxCache.get(month);
      if (!ctx) {
        ctx = await loadContext(scope, companyId, monthCutoff(month));
        ctxCache.set(month, ctx);
      }
      const setting = paySettingOn(e.paySettings, p.date);
      dayType = defaultDayType(ctx, p.date, setting);
      const c = computeDay(
        {
          dayType,
          timeIn: p.timeIn,
          timeOut: p.timeOut,
          hoursWorked: null,
          lateMinutes: null,
          undertimeMinutes: null,
          otHours: null,
          nightDiffHours: null,
          isAbsent: false,
        },
        shiftFor(ctx, setting),
      );
      computed = {
        hoursWorked: c.hoursWorked,
        lateMinutes: c.lateMinutes,
        undertimeMinutes: c.undertimeMinutes,
        otHours: c.otHours,
      };
      if (errors.length === 0)
        payload.push({ employeeId: e.id, date: p.date, timeIn: p.timeIn, timeOut: p.timeOut });
    }
    rows.push({
      line: p.line,
      employeeNo: p.employeeNo,
      name: e ? `${e.lastName}, ${e.firstName}` : null,
      date: p.date,
      timeIn: p.timeIn,
      timeOut: p.timeOut,
      dayType,
      computed,
      errors,
      warnings,
    });
  }
  rows.sort((a, b) => a.line - b.line);
  return {
    rows,
    validCount: payload.length,
    errorCount: rows.filter((r) => r.errors.length).length,
    warningCount: rows.filter((r) => r.warnings.length).length,
    payload,
  };
}

export async function commitBiometrics(
  scope: Scope,
  companyId: string,
  payload: unknown,
): Promise<{ saved: number; employees: number }> {
  assertPermission(scope, "attendance.import");
  assertCompanyAccess(scope, companyId);
  const parsed = biometricsPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new AppError("The import data is invalid. Upload the file again.");

  const byEmployee = new Map<string, typeof parsed.data>();
  for (const p of parsed.data)
    byEmployee.set(p.employeeId, [...(byEmployee.get(p.employeeId) ?? []), p]);

  let saved = 0;
  await repo.transaction(scope, async (tx) => {
    for (const [employeeId, punches] of byEmployee) {
      const employee = await repo.getEmployeeWithPaySettings(scope, companyId, employeeId);
      if (!employee)
        throw new AppError("An employee in the file no longer exists. Upload the file again.");
      const months = [...new Set(punches.map((p) => p.date.slice(0, 7)))];
      const ctxByMonth = new Map<string, CutoffContext>();
      for (const m of months)
        ctxByMonth.set(m, await loadContext(scope, companyId, monthCutoff(m)));
      const rows: repo.RecordRow[] = punches.map((p) => {
        const ctx = ctxByMonth.get(p.date.slice(0, 7))!;
        const setting = paySettingOn(employee.paySettings, p.date);
        const dayType = defaultDayType(ctx, p.date, setting);
        const c = computeDay(
          {
            dayType,
            timeIn: p.timeIn,
            timeOut: p.timeOut,
            hoursWorked: null,
            lateMinutes: null,
            undertimeMinutes: null,
            otHours: null,
            nightDiffHours: null,
            isAbsent: false,
          },
          shiftFor(ctx, setting),
        );
        return {
          date: toDateOnly(p.date),
          dayType,
          timeIn: p.timeIn,
          timeOut: p.timeOut,
          hoursWorked: c.hoursWorked,
          lateMinutes: c.lateMinutes,
          undertimeMinutes: c.undertimeMinutes,
          otHours: c.otHours,
          nightDiffHours: c.nightDiffHours,
          isAbsent: c.isAbsent,
          remarks: null,
          source: "IMPORT",
        };
      });
      const sorted = rows.map((r) => toIsoDate(r.date)).sort();
      const before = await repo.listRecordsInRange(
        tx,
        companyId,
        sorted[0]!,
        sorted.at(-1)!,
        employeeId,
      );
      const result = await repo.saveRecords(tx, companyId, employeeId, rows);
      saved += result.created + result.updated;
      await audit(
        "DailyTimeRecord",
        `${employeeId}:${sorted[0]}..${sorted.at(-1)}`,
        "UPDATE",
        before.map(toAttendanceDay),
        { source: "biometrics_import", rows: rows.map((r) => ({ ...r, date: toIsoDate(r.date) })) },
        { scope, companyId, tx },
      );
    }
  });
  return { saved, employees: byEmployee.size };
}

// re-exported for the grid's live computation
export { round2 };
