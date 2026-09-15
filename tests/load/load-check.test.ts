import { rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { resolveDataPath } from "@/lib/storage";
import type { Scope } from "@/lib/scope";
import * as payroll from "@/modules/payroll/service";
import * as documents from "@/modules/documents/service";
import { closeBrowser } from "@/modules/documents/pdf";
import { seedStatutory } from "../../prisma/seed/statutory-2026";

/**
 * Phase 8 load check: a company of 200 employees (half daily, half monthly, everyone with an
 * allowance, a quarter with a loan) over the 16–31 Aug 2026 cutoff. Times the three heavy
 * steps — compute, approve (snapshots), PDF generation (200 payslips + batch) — and asserts the
 * whole run finishes under two minutes. Run with `pnpm load-check`; the numbers are printed.
 */

const EMPLOYEES = Number(process.env.LOAD_EMPLOYEES ?? 200);
const BUDGET_MS = 2 * 60_000;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TAG = `LOAD${Date.now().toString(36).toUpperCase().slice(-5)}`;

let companyId = "";
let adminId = "";
let periodId = "";
let admin: Scope;
const timings: Record<string, number> = {};

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  timings[label] = Math.round(performance.now() - t0);
  return out;
}

beforeAll(async () => {
  await seedStatutory(prisma);
  const a = await prisma.user.create({
    data: {
      email: `${TAG.toLowerCase()}-admin@example.com`,
      name: "Load Admin",
      passwordHash: "x",
      role: "ADMIN",
    },
  });
  adminId = a.id;
  admin = { userId: adminId, role: "ADMIN", companyIds: null, ip: null };
  const company = await prisma.company.create({
    data: {
      code: TAG,
      legalName: `${TAG} Load Co.`,
      address: "Load St.",
      payFrequency: "SEMI_MONTHLY",
      signatoryName: "Sig",
      signatoryTitle: "Payroll",
      slipCodePrefix: TAG,
      slipCodePad: 4,
      employeeNoPrefix: TAG,
      policies: { create: { effectiveFrom: d("2026-01-01") } },
    },
  });
  companyId = company.id;

  // Employees in bulk: rows, then pay settings, recurring items and loans by employee id.
  const employeeRows: Prisma.EmployeeCreateManyInput[] = Array.from(
    { length: EMPLOYEES },
    (_, i) => ({
      companyId,
      employeeNo: `${TAG}-${String(i + 1).padStart(4, "0")}`,
      lastName: `Employee${String(i + 1).padStart(3, "0")}`,
      firstName: i % 2 ? "Maria" : "Jose",
      birthDate: d("1990-01-15"),
      hireDate: d("2024-01-15"),
      status: "ACTIVE",
      taxStatus: "S",
      sssNo: `34${String(1000000 + i).padStart(7, "0")}1`,
      tin: `${String(100000000 + i)}`,
    }),
  );
  await prisma.employee.createMany({ data: employeeRows });
  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, employeeNo: true },
    orderBy: { employeeNo: "asc" },
  });
  await prisma.employeePaySetting.createMany({
    data: employees.map((e, i) => ({
      companyId,
      employeeId: e.id,
      effectiveFrom: d("2026-01-01"),
      payType: i % 2 ? "MONTHLY" : "DAILY",
      dailyRate: i % 2 ? null : String(600 + (i % 7) * 25) + ".00",
      monthlyRate: i % 2 ? String(18000 + (i % 11) * 2500) + ".00" : null,
      payFrequency: "SEMI_MONTHLY",
    })),
  });
  await prisma.employeeRecurringItem.createMany({
    data: employees.map((e) => ({
      companyId,
      employeeId: e.id,
      componentCode: "ALLOWANCE",
      kind: "EARNING",
      label: "Allowance",
      amount: "500.00",
      effectiveFrom: d("2026-01-01"),
    })),
  });
  await prisma.loan.createMany({
    data: employees
      .filter((_, i) => i % 4 === 0)
      .map((e) => ({
        companyId,
        employeeId: e.id,
        type: "SSS_LOAN",
        label: "SSS salary loan",
        principal: "6000.00",
        amortization: "500.00",
        balance: "6000.00",
        startDate: d("2026-08-01"),
        status: "ACTIVE",
      })),
  });

  // Attendance 16–31 Aug 2026: Sundays rest, 21 Aug SNW, 31 Aug RH; one absence per 5th employee.
  const rest = new Set(["2026-08-16", "2026-08-23", "2026-08-30"]);
  const dtr: Prisma.DailyTimeRecordCreateManyInput[] = [];
  employees.forEach((e, i) => {
    for (let day = 16; day <= 31; day++) {
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      const off = rest.has(date) || date === "2026-08-21" || date === "2026-08-31";
      const absent = !off && i % 5 === 0 && day === 19;
      const worked = !off && !absent;
      dtr.push({
        companyId,
        employeeId: e.id,
        date: d(date),
        dayType:
          date === "2026-08-31"
            ? "REGULAR_HOLIDAY"
            : date === "2026-08-21"
              ? "SPECIAL_NON_WORKING"
              : rest.has(date)
                ? "REST_DAY"
                : "REGULAR",
        timeIn: worked ? "08:00" : null,
        timeOut: worked ? (i % 3 === 0 ? "19:00" : "17:00") : null,
        hoursWorked: worked ? 8 : 0,
        lateMinutes: worked && i % 9 === 0 ? 15 : 0,
        undertimeMinutes: 0,
        otHours: worked && i % 3 === 0 ? 2 : 0,
        nightDiffHours: 0,
        isAbsent: absent,
        source: "MANUAL",
      });
    }
  });
  for (let i = 0; i < dtr.length; i += 2000) {
    await prisma.dailyTimeRecord.createMany({ data: dtr.slice(i, i + 2000) });
  }
});

afterAll(async () => {
  await closeBrowser();
  if (companyId && process.env.LOAD_KEEP !== "1") {
    await prisma.$executeRaw`UPDATE pay_periods SET status = 'COMPUTED' WHERE company_id = ${companyId}::uuid`;
    await prisma.company.delete({ where: { id: companyId } });
    // stored PDFs of the throw-away company
    await rm(resolveDataPath("payslips", companyId), { recursive: true, force: true });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.$disconnect();
});

function report() {
  const total = Object.values(timings).reduce((a, b) => a + b, 0);
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  process.stdout.write(
    [
      "",
      `Load check: ${EMPLOYEES} employees, 16-31 Aug 2026 (${process.platform}, node ${process.version})`,
      ...Object.entries(timings).map(([k, v]) => `  ${k.padEnd(22)} ${fmt(v).padStart(8)}`),
      `  ${"total".padEnd(22)} ${fmt(total).padStart(8)}   budget ${fmt(BUDGET_MS)}`,
      "",
      "",
    ].join("\n"),
  );
  return total;
}

describe(`load check: ${EMPLOYEES} employees`, () => {
  it("compute → approve → PDFs within the budget", async () => {
    const period = await payroll.createPeriod(admin, companyId, {
      month: "2026-08",
      half: "2",
      payDate: "2026-08-31",
    });
    periodId = period.id;

    const computed = await timed("compute", () =>
      payroll.computePeriod(admin, companyId, periodId),
    );
    expect(computed.computed).toBe(EMPLOYEES);
    expect(computed.skipped).toBe(0);

    await timed("approve", () => payroll.approvePeriod(admin, companyId, periodId));
    const slips = await payroll.listPayslips(admin, companyId, periodId);
    expect(slips).toHaveLength(EMPLOYEES);
    expect(slips.every((s) => s.slipCode)).toBe(true);

    const pdf = await timed("pdf (slips + batch)", () =>
      documents.generatePeriodPdfs(admin, companyId, periodId),
    );
    expect(pdf.rendered).toBe(EMPLOYEES);
    const status = await documents.periodPdfStatus(admin, companyId, periodId);
    expect(status.finalReady).toBe(true);
    expect(status.files).toHaveLength(EMPLOYEES + 1);

    expect(report()).toBeLessThan(BUDGET_MS);
  });
});
