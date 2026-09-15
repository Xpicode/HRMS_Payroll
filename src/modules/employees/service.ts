import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { AppError, NeedsConfirmError } from "@/lib/action-result";
import { parseCsv, toCsv } from "@/lib/csv";
import { toDateOnly, toIsoDate, todayInManila } from "@/lib/dates";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission, assertPermissionOrSelf } from "@/lib/session";
import { getCompany } from "@/modules/companies/service";
import {
  assertLoginEmailFree,
  createEmployeeLoginWithin,
  disableEmployeeLogin,
} from "@/modules/auth/service";
import { EMPLOYEE_TEMP_PASSWORD, hashPassword } from "@/lib/password";
import * as repo from "./repo";
import {
  CSV_COLUMNS,
  CSV_EXAMPLE_ROW,
  csvRowToInputs,
  employeeSchema,
  governmentIdWarnings,
  importPayloadSchema,
  paySettingSchema,
  RECURRING_COMPONENTS,
  type EmployeeInput,
  type ImportPayload,
  type PaySettingInput,
  type RecurringItemInput,
  type SeparationInput,
} from "./schema";

function isUniqueViolation(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function toEmployeeRow(input: EmployeeInput, employeeNo: string): repo.EmployeeRow {
  const { employeeNo: _ignored, birthDate, hireDate, separationDate, ...rest } = input;
  return {
    ...rest,
    employeeNo,
    birthDate: birthDate ? toDateOnly(birthDate) : null,
    hireDate: toDateOnly(hireDate),
    separationDate:
      input.status === "SEPARATED" && separationDate
        ? toDateOnly(separationDate)
        : separationDate
          ? toDateOnly(separationDate)
          : null,
  };
}

function toPaySettingRow(input: PaySettingInput): repo.PaySettingRow {
  const { effectiveFrom, ...rest } = input;
  return {
    ...rest,
    effectiveFrom: toDateOnly(effectiveFrom),
    monthlyRate: input.payType === "DAILY" ? null : input.monthlyRate,
    dailyRate: input.payType === "MONTHLY" ? null : input.dailyRate,
  };
}

function employeeNoError(): AppError {
  return new AppError("That employee number is already used in this company.", {
    employeeNo: ["Already in use — leave blank to auto-assign"],
  });
}

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

export async function listEmployees(scope: Scope, companyId: string) {
  assertPermission(scope, "employees.view");
  assertCompanyAccess(scope, companyId);
  const rows = await repo.listEmployees(scope, companyId, toDateOnly(todayInManila()));
  return rows.map(({ paySettings, ...e }) => ({ ...e, currentPay: paySettings[0] ?? null }));
}

/** Staff with employees.view, or the employee's own self-service login (Phase 9). */
export async function getEmployee(scope: Scope, companyId: string, id: string) {
  assertPermissionOrSelf(scope, "employees.view", id);
  assertCompanyAccess(scope, companyId);
  return repo.getEmployee(scope, companyId, id);
}

/** Employees to pay for a period, with pay-setting history and recurring items (payroll module). */
export async function listEmployeesForPayroll(
  scope: Scope,
  companyId: string,
  start: string,
  end: string,
) {
  assertPermission(scope, "employees.view");
  assertCompanyAccess(scope, companyId);
  return repo.listForPayroll(scope, companyId, toDateOnly(start), toDateOnly(end));
}

/** Brief rows of everyone not separated (leave requests, credit rollover). */
export async function listEmployeesForLeave(scope: Scope, companyId: string) {
  assertPermission(scope, "employees.view");
  assertCompanyAccess(scope, companyId);
  return repo.listNotSeparated(scope, companyId);
}

/** Headcount by status for the dashboard. */
export async function headcount(scope: Scope, companyId: string) {
  assertCompanyAccess(scope, companyId);
  const rows = await repo.countByStatus(scope, companyId);
  const out = { ACTIVE: 0, ON_LEAVE: 0, SEPARATED: 0 };
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

export async function listDepartments(scope: Scope, companyId: string) {
  assertCompanyAccess(scope, companyId);
  return repo.listDepartments(scope, companyId);
}

export async function getEmployeeNoSeries(scope: Scope, companyId: string) {
  assertCompanyAccess(scope, companyId);
  const s = await repo.getEmployeeNoSeries(scope, companyId);
  if (!s) throw new AppError("Company not found.");
  return {
    ...s,
    next: repo.formatEmployeeNo(s.employeeNoPrefix, s.employeeNoNext, s.employeeNoPad),
  };
}

/** Latest payroll policy — used to show derived daily/hourly rates next to pay settings. */
export async function getRateContext(scope: Scope, companyId: string) {
  const company = await getCompany(scope, companyId);
  const policy = company?.policies[0];
  return {
    payFrequency: company?.payFrequency ?? "SEMI_MONTHLY",
    workingDaysPerYear: policy?.workingDaysPerYear ?? 313,
    hoursPerDay: policy?.hoursPerDay.toString() ?? "8",
  };
}

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

export type SaveOptions = { confirmWarnings: boolean };

/** Portal login to create together with the employee (Phase 9); `null` = none. Email `null` = the employee's. */
export type PortalLoginRequest = { email: string | null } | null;

export async function createEmployee(
  scope: Scope,
  companyId: string,
  input: EmployeeInput,
  opts: SaveOptions,
  portal: PortalLoginRequest = null,
) {
  assertPermission(scope, "employees.manage");
  assertCompanyAccess(scope, companyId);
  const warnings = governmentIdWarnings(input);
  if (warnings.length && !opts.confirmWarnings) throw new NeedsConfirmError(warnings);

  // Resolve and check the login before the transaction: bcrypt is slow and the email must be free.
  let login: { email: string; passwordHash: string } | null = null;
  if (portal) {
    assertPermission(scope, "employees.portal_access");
    const email = portal.email ?? input.email;
    if (!email)
      throw new AppError("Enter a sign-in email for the portal login.", {
        portalEmail: ["Required when the employee has no email"],
      });
    try {
      await assertLoginEmailFree(email);
    } catch (e) {
      if (e instanceof AppError && e.fieldErrors?.email)
        throw new AppError(e.message, { portalEmail: e.fieldErrors.email });
      throw e;
    }
    login = { email, passwordHash: await hashPassword(EMPLOYEE_TEMP_PASSWORD) };
  }

  try {
    return await repo.transaction(scope, async (tx) => {
      const employeeNo = input.employeeNo ?? (await repo.allocateEmployeeNo(tx, companyId));
      const row = await repo.createEmployee(tx, companyId, toEmployeeRow(input, employeeNo));
      await audit("Employee", row.id, "CREATE", null, row, { scope, companyId, tx });
      if (login) await createEmployeeLoginWithin(tx, scope, companyId, row, login);
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw employeeNoError();
    throw e;
  }
}

export async function updateEmployee(
  scope: Scope,
  companyId: string,
  id: string,
  input: EmployeeInput,
  opts: SaveOptions,
) {
  assertPermission(scope, "employees.manage");
  assertCompanyAccess(scope, companyId);
  const before = await repo.getEmployee(scope, companyId, id);
  if (!before) throw new AppError("Employee not found.");
  const warnings = governmentIdWarnings(input);
  if (warnings.length && !opts.confirmWarnings) throw new NeedsConfirmError(warnings);

  try {
    return await repo.transaction(scope, async (tx) => {
      const after = await repo.updateEmployee(
        tx,
        companyId,
        id,
        toEmployeeRow(input, input.employeeNo ?? before.employeeNo),
      );
      const { paySettings: _p, recurringItems: _r, ...beforeRow } = before;
      await audit("Employee", id, "UPDATE", beforeRow, after, { scope, companyId, tx });
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw employeeNoError();
    throw e;
  }
}

/**
 * Separation (Phase 6): dated and audited. The employee stays in the pay period that contains
 * the date (that payslip is marked final pay) and drops out of every later one.
 */
export async function separateEmployee(
  scope: Scope,
  companyId: string,
  id: string,
  input: SeparationInput,
) {
  assertPermission(scope, "employees.separate");
  assertCompanyAccess(scope, companyId);
  const before = await repo.getEmployee(scope, companyId, id);
  if (!before) throw new AppError("Employee not found.");
  if (before.status === "SEPARATED") throw new AppError("The employee is already separated.");
  if (input.separationDate < toIsoDate(before.hireDate))
    throw new AppError("The separation date is before the hire date.", {
      separationDate: ["Before the hire date"],
    });
  return repo.transaction(scope, async (tx) => {
    const after = await repo.setSeparation(tx, companyId, id, {
      status: "SEPARATED",
      separationDate: toDateOnly(input.separationDate),
    });
    await audit(
      "Employee",
      id,
      "UPDATE",
      { status: before.status, separationDate: before.separationDate },
      { status: after.status, separationDate: after.separationDate, reason: input.reason },
      { scope, companyId, tx },
    );
    // A separated employee loses portal access in the same transaction (audited as a User change).
    await disableEmployeeLogin(tx, scope, companyId, id);
    return after;
  });
}

/** ADMIN only: undo a separation (e.g. entered on the wrong employee). */
export async function reinstateEmployee(
  scope: Scope,
  companyId: string,
  id: string,
  reason: string,
) {
  assertPermission(scope, "employees.reinstate");
  assertCompanyAccess(scope, companyId);
  const before = await repo.getEmployee(scope, companyId, id);
  if (!before) throw new AppError("Employee not found.");
  if (before.status !== "SEPARATED") throw new AppError("The employee is not separated.");
  return repo.transaction(scope, async (tx) => {
    const after = await repo.setSeparation(tx, companyId, id, {
      status: "ACTIVE",
      separationDate: null,
    });
    await audit(
      "Employee",
      id,
      "UPDATE",
      { status: before.status, separationDate: before.separationDate },
      { status: after.status, separationDate: null, reason },
      { scope, companyId, tx },
    );
    return after;
  });
}

export async function addPaySetting(
  scope: Scope,
  companyId: string,
  employeeId: string,
  input: PaySettingInput,
) {
  assertPermission(scope, "employees.manage");
  assertCompanyAccess(scope, companyId);
  const employee = await repo.getEmployee(scope, companyId, employeeId);
  if (!employee) throw new AppError("Employee not found.");
  const row = toPaySettingRow(input);
  return repo.transaction(scope, async (tx) => {
    const clash = await repo.findPaySettingOn(tx, employeeId, row.effectiveFrom);
    if (clash) {
      throw new AppError("A pay setting already exists effective that date.", {
        effectiveFrom: ["Choose a different effective date"],
      });
    }
    const created = await repo.createPaySetting(tx, companyId, employeeId, row);
    await audit(
      "EmployeePaySetting",
      created.id,
      "CREATE",
      null,
      { ...created, employeeNo: employee.employeeNo },
      { scope, companyId, tx },
    );
    return created;
  });
}

export async function addRecurringItem(
  scope: Scope,
  companyId: string,
  employeeId: string,
  input: RecurringItemInput,
) {
  assertPermission(scope, "employees.manage");
  assertCompanyAccess(scope, companyId);
  const employee = await repo.getEmployee(scope, companyId, employeeId);
  if (!employee) throw new AppError("Employee not found.");
  const component = RECURRING_COMPONENTS[input.componentCode];
  return repo.transaction(scope, async (tx) => {
    const created = await repo.createRecurringItem(tx, companyId, employeeId, {
      componentCode: input.componentCode,
      kind: component.kind,
      label: input.label ?? component.label,
      amount: input.amount,
      effectiveFrom: toDateOnly(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? toDateOnly(input.effectiveTo) : null,
    });
    await audit("EmployeeRecurringItem", created.id, "CREATE", null, created, {
      scope,
      companyId,
      tx,
    });
    return created;
  });
}

export async function endRecurringItem(
  scope: Scope,
  companyId: string,
  employeeId: string,
  id: string,
  effectiveTo: string,
) {
  assertPermission(scope, "employees.manage");
  assertCompanyAccess(scope, companyId);
  const before = await repo.getRecurringItem(scope, companyId, employeeId, id);
  if (!before) throw new AppError("Item not found.");
  const to = toDateOnly(effectiveTo);
  if (to < before.effectiveFrom)
    throw new AppError("End date must be on or after the start date.", {
      effectiveTo: ["Before the start date"],
    });
  return repo.transaction(scope, async (tx) => {
    const after = await repo.endRecurringItem(tx, companyId, id, to);
    await audit("EmployeeRecurringItem", id, "UPDATE", before, after, { scope, companyId, tx });
    return after;
  });
}

export async function deleteRecurringItem(
  scope: Scope,
  companyId: string,
  employeeId: string,
  id: string,
) {
  assertPermission(scope, "employees.manage");
  assertCompanyAccess(scope, companyId);
  const before = await repo.getRecurringItem(scope, companyId, employeeId, id);
  if (!before) throw new AppError("Item not found.");
  await repo.transaction(scope, async (tx) => {
    await repo.deleteRecurringItem(tx, companyId, id);
    await audit("EmployeeRecurringItem", id, "DELETE", before, null, { scope, companyId, tx });
  });
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export const IMPORT_MAX_BYTES = 1024 * 1024;

export function csvTemplate(): string {
  const headers = CSV_COLUMNS.map((c) => c.key);
  return toCsv(headers, [headers.map((h) => CSV_EXAMPLE_ROW[h])]);
}

export type ImportPreviewRow = {
  line: number;
  employeeNo: string | null;
  name: string;
  errors: string[];
  warnings: string[];
  payload: ImportPayload[number] | null;
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  missingColumns: string[];
};

export async function previewImport(
  scope: Scope,
  companyId: string,
  csvText: string,
): Promise<ImportPreview> {
  assertPermission(scope, "employees.import");
  assertCompanyAccess(scope, companyId);
  const series = await getEmployeeNoSeries(scope, companyId);
  const parsed = parseCsv(csvText);

  const required = CSV_COLUMNS.filter((c) => c.required).map((c) => c.key);
  const missingColumns = required.filter((k) => !parsed.headers.includes(k));
  if (missingColumns.length) {
    throw new AppError(
      `Missing required column(s): ${missingColumns.join(", ")}. Download the template to see the expected layout.`,
    );
  }

  const seen = new Map<string, number>();
  const rows: ImportPreviewRow[] = parsed.rows.map((raw, i) => {
    const line = i + 2; // header is line 1
    const mapped = csvRowToInputs(raw, { payFrequency: series.payFrequency });
    const errors = [...mapped.errors];
    const warnings: string[] = [];
    const emp = employeeSchema.safeParse(mapped.employee);
    const pay = paySettingSchema.safeParse(mapped.pay);
    if (!emp.success)
      errors.push(
        ...emp.error.issues.map((iss) => `${String(iss.path[0] ?? "row")}: ${iss.message}`),
      );
    if (!pay.success)
      errors.push(
        ...pay.error.issues.map((iss) => `${String(iss.path[0] ?? "pay")}: ${iss.message}`),
      );

    let employeeNo: string | null = null;
    if (emp.success) {
      employeeNo = emp.data.employeeNo;
      warnings.push(...governmentIdWarnings(emp.data));
      if (employeeNo) {
        const firstLine = seen.get(employeeNo);
        if (firstLine) errors.push(`employee_no: duplicate of line ${firstLine}`);
        else seen.set(employeeNo, line);
      }
    }
    const name = emp.success
      ? `${emp.data.lastName}, ${emp.data.firstName}`
      : `${raw.last_name ?? ""}, ${raw.first_name ?? ""}`.trim();
    return {
      line,
      employeeNo,
      name,
      errors,
      warnings,
      payload:
        emp.success && pay.success && errors.length === 0
          ? { employee: emp.data, pay: pay.data }
          : null,
    };
  });

  // Existing employee numbers in this company
  const nos = rows.map((r) => r.employeeNo).filter((n): n is string => Boolean(n));
  if (nos.length) {
    const existing = new Set(
      (await repo.findEmployeeNos(repo.root(scope), companyId, nos)).map((e) => e.employeeNo),
    );
    for (const r of rows) {
      if (r.employeeNo && existing.has(r.employeeNo)) {
        r.errors.push(`employee_no: ${r.employeeNo} already exists`);
        r.payload = null;
      }
    }
  }

  return {
    rows,
    validCount: rows.filter((r) => r.payload).length,
    errorCount: rows.filter((r) => r.errors.length).length,
    warningCount: rows.filter((r) => r.warnings.length).length,
    missingColumns,
  };
}

/** Commit previously previewed rows. Everything is re-validated; all-or-nothing. */
export async function commitImport(
  scope: Scope,
  companyId: string,
  payload: unknown,
): Promise<{ created: number }> {
  assertPermission(scope, "employees.import");
  assertCompanyAccess(scope, companyId);
  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new AppError("The import data is invalid. Upload the file again.");
  const rows = parsed.data;

  const nos = rows.map((r) => r.employee.employeeNo).filter((n): n is string => Boolean(n));
  if (new Set(nos).size !== nos.length)
    throw new AppError("Duplicate employee numbers in the file.");

  try {
    return await repo.transaction(scope, async (tx) => {
      if (nos.length) {
        const existing = await repo.findEmployeeNos(tx, companyId, nos);
        if (existing.length)
          throw new AppError(
            `Already existing employee number(s): ${existing.map((e) => e.employeeNo).join(", ")}`,
          );
      }
      let created = 0;
      for (const r of rows) {
        const employeeNo = r.employee.employeeNo ?? (await repo.allocateEmployeeNo(tx, companyId));
        const employee = await repo.createEmployee(
          tx,
          companyId,
          toEmployeeRow(r.employee, employeeNo),
        );
        const pay = await repo.createPaySetting(tx, companyId, employee.id, toPaySettingRow(r.pay));
        await audit(
          "Employee",
          employee.id,
          "CREATE",
          null,
          { ...employee, source: "csv_import", paySetting: pay },
          { scope, companyId, tx },
        );
        created++;
      }
      return { created };
    });
  } catch (e) {
    if (isUniqueViolation(e))
      throw new AppError(
        "An employee number in the file is already used. Upload the file again to see which.",
      );
    throw e;
  }
}
