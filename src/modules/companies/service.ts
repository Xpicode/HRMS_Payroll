import "server-only";
import sharp from "sharp";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { todayInManila } from "@/lib/dates";
import { assertCompanyAccess, isAdmin, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { readFileIfExists, resolveDataPath, writeFileAtomic } from "@/lib/storage";
import * as repo from "./repo";
import type { CompanyInput, HolidayInput, PolicyInput, UpdateCompanyInput } from "./schema";

export const DEFAULT_POLICY: Omit<repo.PolicyData, "effectiveFrom"> = {
  workingDaysPerYear: 313,
  hoursPerDay: "8",
  otRegular: "1.25",
  otRestDay: "1.30",
  otRestDayExcess: "1.69",
  otRegularHoliday: "2.00",
  otRegularHolidayExcess: "2.60",
  nightDiffRate: "0.10",
  statutoryTiming: "SECOND_CUTOFF",
  lateGraceMinutes: 0,
};

function isUniqueViolation(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// ---------------------------------------------------------------------------
// companies
// ---------------------------------------------------------------------------

export function listCompanies(scope: Scope) {
  return repo.listCompanies(scope);
}

export async function getCompany(scope: Scope, id: string) {
  assertCompanyAccess(scope, id);
  return repo.getCompany(scope, id);
}

export async function createCompany(scope: Scope, input: CompanyInput) {
  assertPermission(scope, "companies.create");
  try {
    const company = await repo.createCompany(scope, input, {
      ...DEFAULT_POLICY,
      effectiveFrom: todayInManila(),
    });
    await audit("Company", company.id, "CREATE", null, company, { scope, companyId: company.id });
    return company;
  } catch (e) {
    if (isUniqueViolation(e))
      throw new AppError("That company code is already used.", { code: ["Already in use"] });
    throw e;
  }
}

export async function updateCompany(scope: Scope, id: string, input: UpdateCompanyInput) {
  assertPermission(scope, "companies.update");
  assertCompanyAccess(scope, id);
  const before = await repo.getCompany(scope, id);
  if (!before) throw new AppError("Company not found.");
  try {
    const after = await repo.updateCompany(scope, id, input);
    const { policies: _p, ...beforeRow } = before;
    await audit("Company", id, "UPDATE", beforeRow, after, { scope, companyId: id });
    return after;
  } catch (e) {
    if (isUniqueViolation(e))
      throw new AppError("That company code is already used.", { code: ["Already in use"] });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// logo upload — validated by content, re-encoded, stored outside the web root
// ---------------------------------------------------------------------------

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_FORMATS = new Set(["png", "jpeg", "webp"]);

export async function uploadLogo(scope: Scope, companyId: string, file: File) {
  assertPermission(scope, "companies.update");
  assertCompanyAccess(scope, companyId);
  const company = await repo.getCompany(scope, companyId);
  if (!company) throw new AppError("Company not found.");

  if (file.size === 0) throw new AppError("Choose an image file.", { logo: ["No file selected"] });
  if (file.size > LOGO_MAX_BYTES)
    throw new AppError("Logo must be 2 MB or smaller.", { logo: ["File too large"] });

  const input = Buffer.from(await file.arrayBuffer());
  let png: Buffer;
  try {
    // sharp inspects the actual bytes; the browser-supplied MIME type and extension are ignored.
    const meta = await sharp(input, { limitInputPixels: 30_000_000 }).metadata();
    if (!meta.format || !LOGO_FORMATS.has(meta.format)) {
      throw new AppError("Logo must be a PNG, JPEG or WebP image.", {
        logo: ["Unsupported image type"],
      });
    }
    png = await sharp(input)
      .rotate()
      .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("That file is not a valid image.", { logo: ["Could not read image"] });
  }

  const relative = ["uploads", "logos", `${companyId}.png`] as const;
  await writeFileAtomic(resolveDataPath(...relative), png);
  const after = await repo.setLogoPath(scope, companyId, relative.join("/"));
  await audit("Company", companyId, "UPLOAD", { logoPath: company.logoPath }, after, {
    scope,
    companyId,
  });
  return after;
}

/** Bytes of the company logo, or null. Access is checked against the scope. */
export async function readLogo(scope: Scope, companyId: string): Promise<Buffer | null> {
  assertCompanyAccess(scope, companyId);
  const company = await repo.getCompany(scope, companyId);
  if (!company?.logoPath) return null;
  return readFileIfExists(resolveDataPath(...company.logoPath.split("/")));
}

// ---------------------------------------------------------------------------
// payroll policy
// ---------------------------------------------------------------------------

/** Policy in force on a date (latest effective_from <= date); the engine reads this. */
export async function getPolicyOn(scope: Scope, companyId: string, date: string) {
  assertCompanyAccess(scope, companyId);
  return repo.findPolicyEffectiveOn(scope, companyId, date);
}

export async function savePolicy(scope: Scope, companyId: string, input: PolicyInput) {
  assertPermission(scope, "policy.update");
  assertCompanyAccess(scope, companyId);
  const existing = await repo.findPolicyByEffectiveDate(scope, companyId, input.effectiveFrom);
  if (existing) {
    const after = await repo.updatePolicy(scope, existing.id, input);
    await audit("CompanyPayrollPolicy", existing.id, "UPDATE", existing, after, {
      scope,
      companyId,
    });
    return after;
  }
  const created = await repo.createPolicy(scope, companyId, input);
  await audit("CompanyPayrollPolicy", created.id, "CREATE", null, created, { scope, companyId });
  return created;
}

// ---------------------------------------------------------------------------
// holidays
// ---------------------------------------------------------------------------

/** Holidays (national + this company) between two ISO dates inclusive. */
export async function listHolidaysInRange(
  scope: Scope,
  companyId: string,
  start: string,
  end: string,
) {
  assertCompanyAccess(scope, companyId);
  return repo.listHolidaysInRange(scope, companyId, start, end);
}

export async function listHolidays(scope: Scope, companyId: string, year: number) {
  assertCompanyAccess(scope, companyId);
  return repo.listHolidaysForYear(scope, companyId, year);
}

function assertHolidayLevel(scope: Scope, companyId: string | null) {
  if (companyId === null) assertPermission(scope, "holidays.manage_national");
  else {
    assertPermission(scope, "holidays.manage_company");
    assertCompanyAccess(scope, companyId);
  }
}

export async function createHoliday(scope: Scope, companyId: string, input: HolidayInput) {
  const targetCompanyId = input.level === "NATIONAL" ? null : companyId;
  assertHolidayLevel(scope, targetCompanyId);
  const clash = await repo.findHolidayOnDate(scope, targetCompanyId, input.date);
  if (clash)
    throw new AppError("There is already a holiday on that date.", {
      date: ["Date already has a holiday"],
    });
  const row = await repo.createHoliday(scope, {
    companyId: targetCompanyId,
    date: input.date,
    name: input.name,
    type: input.type,
  });
  await audit("Holiday", row.id, "CREATE", null, row, { scope, companyId: targetCompanyId });
  return row;
}

export async function updateHoliday(
  scope: Scope,
  companyId: string,
  id: string,
  input: HolidayInput,
) {
  assertCompanyAccess(scope, companyId);
  const before = await repo.getHoliday(scope, id);
  if (!before || (before.companyId !== null && before.companyId !== companyId))
    throw new AppError("Holiday not found.");
  assertHolidayLevel(scope, before.companyId);
  const clash = await repo.findHolidayOnDate(scope, before.companyId, input.date);
  if (clash && clash.id !== id)
    throw new AppError("There is already a holiday on that date.", {
      date: ["Date already has a holiday"],
    });
  const after = await repo.updateHoliday(scope, id, {
    date: input.date,
    name: input.name,
    type: input.type,
  });
  await audit("Holiday", id, "UPDATE", before, after, { scope, companyId: before.companyId });
  return after;
}

export async function deleteHoliday(scope: Scope, companyId: string, id: string) {
  assertCompanyAccess(scope, companyId);
  const before = await repo.getHoliday(scope, id);
  if (!before || (before.companyId !== null && before.companyId !== companyId))
    throw new AppError("Holiday not found.");
  assertHolidayLevel(scope, before.companyId);
  await repo.deleteHoliday(scope, id);
  await audit("Holiday", id, "DELETE", before, null, { scope, companyId: before.companyId });
}

export function canManageNationalHolidays(scope: Scope) {
  return isAdmin(scope);
}
