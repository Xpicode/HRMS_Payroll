import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { Scope } from "@/lib/scope";
import { ImmutablePayslipError } from "@/modules/payroll/repo";
import * as payroll from "@/modules/payroll/service";
import * as loans from "@/modules/loans/service";
import * as repo from "@/modules/payroll/repo";
import { seedStatutory } from "../../prisma/seed/statutory-2026";

/**
 * Lifecycle: create period → compute → adjust → recompute (adjustment survives) → approve
 * (slip codes, snapshot, loan payment posted) → every edit path fails (service guard and the
 * database trigger) → the employee's rate changes; the approved payslip does not → revert
 * (admin only; loan balance restored) → recompute → re-approve (slip code reused) → release → lock.
 *
 * Runs against the database in DATABASE_URL with its own throw-away company.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TAG = `ITEST${Date.now().toString(36).toUpperCase().slice(-6)}`;

let companyId = "";
let adminId = "";
let officerId = "";
let employeeDailyId = "";
let employeeMonthlyId = "";
let loanId = "";
let periodId = "";
let admin: Scope;
let officer: Scope;
let officerElsewhere: Scope;

beforeAll(async () => {
  await seedStatutory(prisma);
  const [a, o] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-admin@example.com`,
        name: "Test Admin",
        passwordHash: "x",
        role: "ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-officer@example.com`,
        name: "Test Officer",
        passwordHash: "x",
        role: "PAYROLL_OFFICER",
      },
    }),
  ]);
  adminId = a.id;
  officerId = o.id;
  const company = await prisma.company.create({
    data: {
      code: TAG,
      legalName: `${TAG} Integration Co.`,
      address: "Test St.",
      payFrequency: "SEMI_MONTHLY",
      signatoryName: "Sig",
      signatoryTitle: "Payroll",
      slipCodePrefix: TAG,
      slipCodeNext: 7,
      slipCodePad: 3,
      employeeNoPrefix: TAG,
      policies: { create: { effectiveFrom: d("2026-01-01") } },
      users: { create: { userId: o.id } },
    },
  });
  companyId = company.id;
  admin = { userId: adminId, role: "ADMIN", companyIds: null, ip: null };
  officer = { userId: officerId, role: "PAYROLL_OFFICER", companyIds: [companyId], ip: null };
  officerElsewhere = {
    userId: officerId,
    role: "PAYROLL_OFFICER",
    companyIds: ["01a09ebb-0000-7000-8000-000000000000"],
    ip: null,
  };

  const daily = await prisma.employee.create({
    data: {
      companyId,
      employeeNo: `${TAG}-0001`,
      lastName: "Santos",
      firstName: "Juan",
      birthDate: d("1998-11-02"),
      hireDate: d("2024-06-16"),
      status: "ACTIVE",
      taxStatus: "S",
      paySettings: {
        create: {
          companyId,
          effectiveFrom: d("2026-01-01"),
          payType: "DAILY",
          dailyRate: "700.00",
          payFrequency: "SEMI_MONTHLY",
        },
      },
    },
  });
  employeeDailyId = daily.id;
  const monthly = await prisma.employee.create({
    data: {
      companyId,
      employeeNo: `${TAG}-0002`,
      lastName: "Garcia",
      firstName: "Jose",
      birthDate: d("1988-07-07"),
      hireDate: d("2020-01-15"),
      status: "ACTIVE",
      taxStatus: "S",
      paySettings: {
        create: {
          companyId,
          effectiveFrom: d("2026-01-01"),
          payType: "MONTHLY",
          monthlyRate: "35000.00",
          payFrequency: "SEMI_MONTHLY",
        },
      },
      recurringItems: {
        create: {
          companyId,
          componentCode: "ALLOWANCE",
          kind: "EARNING",
          label: "Allowance",
          amount: "1000.00",
          effectiveFrom: d("2026-01-01"),
        },
      },
    },
  });
  employeeMonthlyId = monthly.id;

  // Attendance 16–31 Aug 2026: Sundays 16/23/30 rest, 21 SNW, 31 RH → 11 scheduled days.
  const rhDates = new Set(["2026-08-31"]);
  const restOrHoliday = new Set([
    "2026-08-16",
    "2026-08-23",
    "2026-08-30",
    "2026-08-21",
    "2026-08-31",
  ]);
  const rows: Prisma.DailyTimeRecordCreateManyInput[] = [];
  for (let day = 16; day <= 31; day++) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    for (const employeeId of [employeeDailyId, employeeMonthlyId]) {
      const worked = !restOrHoliday.has(date) && !(employeeId === employeeDailyId && day === 18);
      rows.push({
        companyId,
        employeeId,
        date: d(date),
        dayType: rhDates.has(date)
          ? "REGULAR_HOLIDAY"
          : date === "2026-08-21"
            ? "SPECIAL_NON_WORKING"
            : ["2026-08-16", "2026-08-23", "2026-08-30"].includes(date)
              ? "REST_DAY"
              : "REGULAR",
        timeIn: worked ? "08:00" : null,
        timeOut: worked ? "17:00" : null,
        hoursWorked: worked ? 8 : 0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        otHours: 0,
        nightDiffHours: 0,
        isAbsent: !worked && !restOrHoliday.has(date),
        source: "MANUAL",
      });
    }
  }
  await prisma.dailyTimeRecord.createMany({ data: rows });

  const loan = await loans.createLoan(admin, companyId, employeeDailyId, {
    type: "SSS_LOAN",
    label: null,
    principal: "3000.00",
    amortization: "500.00",
    balance: null,
    startDate: "2026-08-01",
    note: null,
  });
  loanId = loan.id;
});

afterAll(async () => {
  if (companyId) {
    // the delete guard refuses frozen periods; reopen them first (raw, test-only)
    await prisma.$executeRaw`UPDATE pay_periods SET status = 'COMPUTED' WHERE company_id = ${companyId}::uuid`;
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.$disconnect();
});

describe("pay period lifecycle", () => {
  it("creates the next period and computes every employee", async () => {
    const period = await payroll.createPeriod(officer, companyId, {
      month: "2026-08",
      half: "2",
      payDate: "2026-08-31",
    });
    periodId = period.id;
    expect(period.status).toBe("DRAFT");
    expect(period.coverageStart.toISOString().slice(0, 10)).toBe("2026-08-16");

    const result = await payroll.computePeriod(officer, companyId, periodId);
    expect(result).toEqual({ computed: 2, skipped: 0, flagged: 0 });
    const slips = await payroll.listPayslips(officer, companyId, periodId);
    expect(slips.map((s) => s.employee.employeeNo)).toEqual([`${TAG}-0002`, `${TAG}-0001`]);
    const santos = slips.find((s) => s.employeeId === employeeDailyId)!;
    // 10 regular days × 700 + RH not worked 700 = 7,700 gross; SSS 925 + HDMF 200 + PHIC 456.46 + loan 500
    expect(santos.grossPay.toString()).toBe("7700");
    expect(santos.totalDeductions.toString()).toBe("2081.46");
    expect(santos.netPay.toString()).toBe("5618.54");
    expect(santos.slipCode).toBeNull();
    const garcia = slips.find((s) => s.employeeId === employeeMonthlyId)!;
    expect(garcia.grossPay.toString()).toBe("18500"); // 17,500 + 1,000 allowance
  });

  it("scoped officer of another company sees nothing and cannot compute", async () => {
    await expect(payroll.getPeriod(officerElsewhere, companyId, periodId)).rejects.toThrow(
      /access/,
    );
    await expect(payroll.computePeriod(officerElsewhere, companyId, periodId)).rejects.toThrow(
      /access/,
    );
  });

  it("keeps a manual adjustment through recompute", async () => {
    const before = await payroll.listPayslips(officer, companyId, periodId);
    const santosBefore = before.find((s) => s.employeeId === employeeDailyId)!;
    await payroll.addAdjustment(officer, companyId, periodId, employeeDailyId, {
      componentCode: "OTHERS",
      kind: "DEDUCTION",
      label: "Uniform",
      amount: "150.00",
      reason: "uniform replacement",
    });
    let slip = await payroll.getPayslip(officer, companyId, santosBefore.id);
    expect(slip!.netPay.toString()).toBe("5468.54");
    const manual = slip!.lines.filter((l) => l.isManual);
    expect(manual).toHaveLength(1);
    expect(manual[0]!.note).toBe("uniform replacement");

    await payroll.computePeriod(officer, companyId, periodId);
    slip = await payroll.getPayslip(officer, companyId, santosBefore.id);
    expect(slip!.netPay.toString()).toBe("5468.54");
    expect(slip!.lines.filter((l) => l.isManual)).toHaveLength(1);
    // the other employee is untouched by the per-employee recompute path
    const garcia = before.find((s) => s.employeeId === employeeMonthlyId)!;
    expect((await payroll.getPayslip(officer, companyId, garcia.id))!.netPay.toString()).toBe(
      garcia.netPay.toString(),
    );
  });

  it("approves: slip codes from the company counter, snapshots, loan payment posted", async () => {
    await expect(payroll.releasePeriod(officer, companyId, periodId)).rejects.toThrow(
      /approved periods/,
    );
    const r = await payroll.approvePeriod(officer, companyId, periodId);
    expect(r).toEqual({ payslips: 2, paymentsPosted: 1 });
    const period = await payroll.getPeriod(officer, companyId, periodId);
    expect(period!.status).toBe("APPROVED");
    expect(period!.approvedById).toBe(officerId);

    const slips = await payroll.listPayslips(officer, companyId, periodId);
    // ordered by last name: Garcia gets 007, Santos 008
    expect(slips.map((s) => s.slipCode)).toEqual([`${TAG}-007`, `${TAG}-008`]);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    expect(company!.slipCodeNext).toBe(9);

    const santos = await payroll.getPayslip(officer, companyId, slips[1]!.id);
    expect(santos!.snapshot).not.toBeNull();
    expect(santos!.snapshot!.slipCode).toBe(`${TAG}-008`);
    expect(santos!.snapshot!.employee.lastName).toBe("Santos");
    expect(santos!.snapshot!.company.code).toBe(TAG);
    expect(santos!.snapshot!.computation.input.statutory.sss).toBe("2026-01-01");
    expect(santos!.snapshot!.loanPayments).toEqual([
      { loanId, amount: "500.00", balanceAfter: "2500.00" },
    ]);
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    expect(loan!.balance.toString()).toBe("2500");
    expect(loan!.status).toBe("ACTIVE");
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(1);
  });

  it("refuses every edit path once approved (service guard and database trigger)", async () => {
    const slips = await payroll.listPayslips(officer, companyId, periodId);
    const santos = slips.find((s) => s.employeeId === employeeDailyId)!;

    await expect(payroll.computePeriod(officer, companyId, periodId)).rejects.toThrow(/approved/);
    await expect(
      payroll.addAdjustment(officer, companyId, periodId, employeeDailyId, {
        componentCode: "OTHERS",
        kind: "DEDUCTION",
        label: "Late add",
        amount: "10.00",
        reason: "should fail",
      }),
    ).rejects.toThrow(ImmutablePayslipError);
    await expect(payroll.deletePeriod(officer, companyId, periodId)).rejects.toThrow(
      /draft or computed/,
    );

    // repo layer refuses directly
    await expect(
      repo.transaction(admin, (tx) =>
        repo.upsertPayslip(
          tx,
          companyId,
          periodId,
          employeeDailyId,
          {
            daysWorked: "0",
            otHours: "0",
            grossPay: "0",
            totalDeductions: "0",
            netPay: "0",
            taxableIncome: "0",
            flags: [],
            computation: {},
          },
          [],
        ),
      ),
    ).rejects.toThrow(ImmutablePayslipError);

    // the database trigger refuses even a raw client
    await expect(
      prisma.payslipLine.updateMany({ where: { payslipId: santos.id }, data: { amount: "1.00" } }),
    ).rejects.toThrow(/approved/);
    await expect(
      prisma.payslip.update({ where: { id: santos.id }, data: { netPay: "1.00" } }),
    ).rejects.toThrow(/approved/);
    await expect(prisma.payslip.delete({ where: { id: santos.id } })).rejects.toThrow(/approved/);
    await expect(prisma.payPeriod.delete({ where: { id: periodId } })).rejects.toThrow(
      /cannot be deleted/,
    );
    // ...but the PDF path (Phase 5) may still be written
    await expect(
      repo.setPayslipPdf(repo.root(admin), companyId, santos.id, "x.pdf"),
    ).resolves.toBeTruthy();
  });

  it("a rate change after approval does not touch the approved payslip", async () => {
    await prisma.employeePaySetting.create({
      data: {
        companyId,
        employeeId: employeeDailyId,
        effectiveFrom: d("2026-08-20"),
        payType: "DAILY",
        dailyRate: "900.00",
        payFrequency: "SEMI_MONTHLY",
      },
    });
    const slips = await payroll.listPayslips(officer, companyId, periodId);
    const santos = await payroll.getPayslip(
      officer,
      companyId,
      slips.find((s) => s.employeeId === employeeDailyId)!.id,
    );
    expect(santos!.grossPay.toString()).toBe("7700");
    expect(Number(santos!.snapshot!.computation.input.paySetting.dailyRate)).toBe(700);
    // the calculator, on live data, now sees the new rate
    const live = await payroll.calculatePayslip(officer, companyId, employeeDailyId, {
      start: "2026-08-16",
      end: "2026-08-31",
      sequenceInMonth: 2,
    });
    expect(live.computation.rates.dailyRate).toBe("900.00");
  });

  it("revert is admin-only, reverses the loan payment and reopens the payslips", async () => {
    await expect(payroll.revertPeriod(officer, companyId, periodId, "not allowed")).rejects.toThrow(
      /permission/,
    );
    await payroll.revertPeriod(admin, companyId, periodId, "rate correction for Santos");
    const period = await payroll.getPeriod(admin, companyId, periodId);
    expect(period!.status).toBe("COMPUTED");
    expect(period!.approvedById).toBeNull();
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    expect(loan!.balance.toString()).toBe("3000");
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(0);
    const slips = await payroll.listPayslips(admin, companyId, periodId);
    expect(slips.every((s) => s.slipCode !== null)).toBe(true);
    const santos = await payroll.getPayslip(
      admin,
      companyId,
      slips.find((s) => s.employeeId === employeeDailyId)!.id,
    );
    expect(santos!.snapshot).toBeNull();
    const auditRow = await prisma.auditLog.findFirst({
      where: { entity: "PayPeriod", entityId: periodId, userId: adminId },
      orderBy: { at: "desc" },
    });
    expect(JSON.stringify(auditRow!.after)).toContain("rate correction for Santos");
  });

  it("recompute uses the new rate, keeps the adjustment; re-approval reuses slip codes and reposts the loan", async () => {
    await payroll.computePeriod(officer, companyId, periodId);
    let slips = await payroll.listPayslips(officer, companyId, periodId);
    const santos = await payroll.getPayslip(
      officer,
      companyId,
      slips.find((s) => s.employeeId === employeeDailyId)!.id,
    );
    // 900 × 10 + 900 RH = 9,900 gross; adjustment still there
    expect(santos!.grossPay.toString()).toBe("9900");
    expect(santos!.lines.filter((l) => l.isManual)).toHaveLength(1);

    await payroll.approvePeriod(officer, companyId, periodId);
    slips = await payroll.listPayslips(officer, companyId, periodId);
    expect(slips.map((s) => s.slipCode)).toEqual([`${TAG}-007`, `${TAG}-008`]);
    expect((await prisma.company.findUnique({ where: { id: companyId } }))!.slipCodeNext).toBe(9);
    expect((await prisma.loan.findUnique({ where: { id: loanId } }))!.balance.toString()).toBe(
      "2500",
    );
  });

  it("release needs the pay date, then lock ends the lifecycle", async () => {
    await payroll.releasePeriod(officer, companyId, periodId);
    expect((await payroll.getPeriod(officer, companyId, periodId))!.status).toBe("RELEASED");
    await expect(payroll.revertPeriod(admin, companyId, periodId, "late")).resolves.toBeUndefined();
    // revert from RELEASED is allowed; approve + release again, then lock
    await payroll.computePeriod(officer, companyId, periodId);
    await payroll.approvePeriod(officer, companyId, periodId);
    await payroll.releasePeriod(officer, companyId, periodId);
    await payroll.lockPeriod(officer, companyId, periodId);
    expect((await payroll.getPeriod(officer, companyId, periodId))!.status).toBe("LOCKED");
    await expect(payroll.revertPeriod(admin, companyId, periodId, "too late")).rejects.toThrow(
      /locked/,
    );
  });

  it("officer approval can be switched off by policy", async () => {
    const second = await payroll.createPeriod(officer, companyId, {
      month: "2026-09",
      half: "1",
      payDate: "2026-12-31", // far ahead so the release check below stays deterministic
    });
    await payroll.computePeriod(officer, companyId, second.id);
    await prisma.companyPayrollPolicy.updateMany({
      where: { companyId },
      data: { officerCanApprove: false },
    });
    await expect(payroll.approvePeriod(officer, companyId, second.id)).rejects.toThrow(
      /administrator/,
    );
    expect(await payroll.canApprove(officer, companyId, "2026-09-15")).toBe(false);
    await payroll.approvePeriod(admin, companyId, second.id);
    expect((await payroll.getPeriod(admin, companyId, second.id))!.status).toBe("APPROVED");
    // a future pay date blocks release
    await expect(payroll.releasePeriod(admin, companyId, second.id)).rejects.toThrow(/pay date/);
  });
});
