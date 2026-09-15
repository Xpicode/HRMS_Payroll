import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Scope } from "@/lib/scope";
import { money } from "@/lib/money";
import * as payroll from "@/modules/payroll/service";
import * as reports from "@/modules/reports/service";
import * as yearend from "@/modules/yearend/service";
import * as email from "@/modules/email/service";
import * as documents from "@/modules/documents/service";
import { runDueJobs } from "@/modules/documents/jobs/service";
import { seedStatutory } from "../../prisma/seed/statutory-2026";

/**
 * Phase 7 acceptance: for a chosen month, each remittance report total equals the sum of that
 * component's payslip lines (SSS_EE / PHIC_EE / HDMF_EE / WTAX) for the company. Also: the
 * 13th-month period (Σ basic ÷ 12 via the same lifecycle), year-end annualization writing a
 * refund / additional line into the last period, and the email outbox with the JSON transport.
 *
 * Two employees, Jan–Aug 2026 semi-monthly (16 regular periods), full attendance filled in.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TAG = `RTEST${Date.now().toString(36).toUpperCase().slice(-6)}`;
const HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-02-25",
  "2026-04-02",
  "2026-04-03",
  "2026-04-09",
  "2026-05-01",
  "2026-06-12",
  "2026-08-21",
  "2026-08-31",
]);

let companyId = "";
let officerId = "";
let monthlyId = "";
let dailyId = "";
let officer: Scope;
let admin: Scope;
const periodIds: string[] = [];

async function fillYear(employeeId: string, start: string, end: string) {
  const rows = [];
  for (let t = d(start).getTime(); t <= d(end).getTime(); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const dow = new Date(t).getUTCDay();
    const holiday = HOLIDAYS_2026.has(date);
    const worked = dow !== 0 && !holiday;
    rows.push({
      companyId,
      employeeId,
      date: d(date),
      dayType:
        dow === 0
          ? ("REST_DAY" as const)
          : holiday
            ? ("REGULAR_HOLIDAY" as const)
            : ("REGULAR" as const),
      timeIn: worked ? "08:00" : null,
      timeOut: worked ? "17:00" : null,
      hoursWorked: worked ? 8 : 0,
      isAbsent: false,
      source: "MANUAL" as const,
    });
  }
  await prisma.dailyTimeRecord.createMany({ data: rows });
}

beforeAll(async () => {
  process.env.SMTP_HOST = "json";
  process.env.SMTP_FROM = "Payroll Test <payroll@example.com>";
  await seedStatutory(prisma);
  const [a, o] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-admin@example.com`,
        name: "A",
        passwordHash: "x",
        role: "ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-officer@example.com`,
        name: "O",
        passwordHash: "x",
        role: "PAYROLL_OFFICER",
      },
    }),
  ]);
  officerId = o.id;
  const company = await prisma.company.create({
    data: {
      code: TAG,
      legalName: `${TAG} Reports Co.`,
      address: "Test St.",
      payFrequency: "SEMI_MONTHLY",
      signatoryName: "Sig",
      signatoryTitle: "Payroll",
      slipCodePrefix: TAG,
      employeeNoPrefix: TAG,
      emailPayslipsEnabled: true,
      policies: { create: { effectiveFrom: d("2026-01-01"), officerCanApprove: true } },
      users: { create: { userId: o.id } },
    },
  });
  companyId = company.id;
  admin = { userId: a.id, role: "ADMIN", companyIds: null, ip: null };
  officer = { userId: officerId, role: "PAYROLL_OFFICER", companyIds: [companyId], ip: null };
  const monthly = await prisma.employee.create({
    data: {
      companyId,
      employeeNo: `${TAG}-0001`,
      lastName: "Garcia",
      firstName: "Jose",
      email: "jose@example.com",
      tin: "123456789000",
      sssNo: "3412345678",
      hireDate: d("2020-01-15"),
      paySettings: {
        create: {
          companyId,
          effectiveFrom: d("2026-01-01"),
          payType: "MONTHLY",
          monthlyRate: "35000.00",
          payFrequency: "SEMI_MONTHLY",
        },
      },
    },
  });
  monthlyId = monthly.id;
  const daily = await prisma.employee.create({
    data: {
      companyId,
      employeeNo: `${TAG}-0002`,
      lastName: "Santos",
      firstName: "Juan",
      email: null, // no email → SKIPPED in the outbox
      hireDate: d("2024-06-16"),
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
  dailyId = daily.id;
  await fillYear(monthlyId, "2026-01-01", "2026-08-31");
  await fillYear(dailyId, "2026-01-01", "2026-08-31");
  // 16 regular periods Jan–Aug, approved
  for (let m = 1; m <= 8; m++) {
    for (const half of ["1", "2"] as const) {
      const p = await payroll.createPeriod(officer, companyId, {
        month: `2026-${String(m).padStart(2, "0")}`,
        half,
        payDate: null,
      });
      await payroll.computePeriod(officer, companyId, p.id);
      await payroll.approvePeriod(officer, companyId, p.id);
      periodIds.push(p.id);
    }
  }
}, 120_000);

afterAll(async () => {
  if (companyId) {
    await prisma.$executeRaw`UPDATE pay_periods SET status = 'COMPUTED' WHERE company_id = ${companyId}::uuid`;
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.$disconnect();
});

/** Raw sum of one component's lines over the company's approved periods ending in a range. */
async function rawSum(code: string, start: string, end: string) {
  const r = await prisma.payslipLine.aggregate({
    where: {
      companyId,
      componentCode: code,
      payslip: {
        payPeriod: {
          status: { in: ["APPROVED", "RELEASED", "LOCKED"] },
          coverageEnd: { gte: d(start), lte: d(end) },
        },
      },
    },
    _sum: { amount: true },
  });
  return money(r._sum.amount?.toString() ?? "0").toFixed(2);
}

describe("remittance reports equal the payslip lines (acceptance)", () => {
  const filter = { year: 2026, month: 8 };
  const start = "2026-08-01";
  const end = "2026-08-31";

  it("SSS: EE total = Σ SSS_EE lines; ER = Σ period employer shares", async () => {
    const r = await reports.buildReport(officer, companyId, "sss", filter);
    expect(r.key).toBe("sss");
    if (r.key !== "sss") return;
    expect(r.data.totals.ee).toBe(await rawSum("SSS_EE", start, end));
    expect(money(r.data.totals.ee).gt(0)).toBe(true);
    // second-cutoff timing: the monthly employer share appears once for the month
    const garcia = r.data.rows.find((x) => x.name.startsWith("Garcia"))!;
    expect(garcia.ee).toBe("1750.00");
    expect(garcia.er).toBe("3500.00");
    expect(garcia.ec).toBe("30.00");
    expect(r.data.totals.total).toBe(
      money(r.data.totals.ee).plus(r.data.totals.er).plus(r.data.totals.ec).toFixed(2),
    );
  });

  it("PhilHealth: EE total = Σ PHIC_EE lines", async () => {
    const r = await reports.buildReport(officer, companyId, "philhealth", filter);
    if (r.key !== "philhealth") throw new Error("wrong key");
    expect(r.data.totals.ee).toBe(await rawSum("PHIC_EE", start, end));
    const garcia = r.data.rows.find((x) => x.name.startsWith("Garcia"))!;
    expect(garcia.ee).toBe("875.00");
    expect(garcia.er).toBe("875.00");
    expect(garcia.monthlyBasic).toBe("35000.00");
  });

  it("Pag-IBIG: EE total = Σ HDMF_EE lines", async () => {
    const r = await reports.buildReport(officer, companyId, "pagibig", filter);
    if (r.key !== "pagibig") throw new Error("wrong key");
    expect(r.data.totals.ee).toBe(await rawSum("HDMF_EE", start, end));
    expect(r.data.rows.every((x) => x.ee === "200.00")).toBe(true);
  });

  it("1601-C: withheld = Σ WTAX lines; gross = Σ gross pay", async () => {
    const r = await reports.buildReport(officer, companyId, "1601c", filter);
    if (r.key !== "1601c") throw new Error("wrong key");
    expect(r.data.totals.withheld).toBe(await rawSum("WTAX", start, end));
    const gross = await prisma.payslip.aggregate({
      where: { companyId, payPeriod: { coverageEnd: { gte: d(start), lte: d(end) } } },
      _sum: { grossPay: true },
    });
    expect(r.data.totals.gross).toBe(money(gross._sum.grossPay?.toString() ?? "0").toFixed(2));
    expect(r.data.totals.employees).toBe(2);
  });

  it("whole-year filter sums every approved period and excludes unapproved ones", async () => {
    // an unapproved September period must be listed as excluded, not summed
    const sep = await payroll.createPeriod(officer, companyId, {
      month: "2026-09",
      half: "1",
      payDate: null,
    });
    await fillYear(monthlyId, "2026-09-01", "2026-09-15");
    await payroll.computePeriod(officer, companyId, sep.id);
    const r = await reports.buildReport(officer, companyId, "sss", { year: 2026 });
    if (r.key !== "sss") throw new Error("wrong key");
    expect(r.excluded.map((p) => p.id)).toContain(sep.id);
    expect(r.included).toHaveLength(16);
    expect(r.data.totals.ee).toBe(await rawSum("SSS_EE", "2026-01-01", "2026-12-31"));
    await payroll.deletePeriod(officer, companyId, sep.id).catch(() => undefined);
  });

  it("CSV carries the same totals and is scoped", async () => {
    const { csv, fileName } = await reports.reportCsv(officer, companyId, "sss", filter);
    expect(fileName).toBe(`${TAG}-sss-2026-08.csv`);
    const totalLine = csv.trim().split("\r\n").at(-1)!;
    expect(totalLine).toContain("TOTAL");
    expect(totalLine).toContain(await rawSum("SSS_EE", start, end));
    const elsewhere: Scope = { ...officer, companyIds: ["01a09ebb-0000-7000-8000-000000000000"] };
    await expect(reports.reportCsv(elsewhere, companyId, "sss", filter)).rejects.toThrow();
  });
});

describe("13th month", () => {
  let thirteenthId = "";

  it("creates one period per year and computes Σ basic ÷ 12 from the approved lines", async () => {
    const p = await payroll.createThirteenthMonthPeriod(officer, companyId, {
      year: 2026,
      payDate: null,
    });
    thirteenthId = p.id;
    expect(p.type).toBe("THIRTEENTH_MONTH");
    expect(p.payDate.toISOString().slice(0, 10)).toBe("2026-12-15");
    await expect(
      payroll.createThirteenthMonthPeriod(officer, companyId, { year: 2026, payDate: null }),
    ).rejects.toThrow(/already exists/);

    const r = await payroll.computePeriod(officer, companyId, thirteenthId);
    expect(r.computed).toBe(2);
    const slips = await payroll.listPayslips(officer, companyId, thirteenthId);
    const garcia = slips.find((s) => s.employeeId === monthlyId)!;
    // 16 approved periods × 17,500 = 280,000 ÷ 12 = 23,333.33
    const basicSum = await prisma.payslipLine.aggregate({
      where: {
        companyId,
        componentCode: "BASIC",
        payslip: { employeeId: monthlyId, payPeriodId: { in: periodIds } },
      },
      _sum: { amount: true },
    });
    expect(money(basicSum._sum.amount!.toString()).toFixed(2)).toBe("280000.00");
    expect(Number(garcia.grossPay)).toBeCloseTo(23333.33, 2);
    expect(Number(garcia.totalDeductions)).toBe(0);
    const full = await payroll.getPayslip(officer, companyId, garcia.id);
    expect(full!.lines.map((l) => l.componentCode)).toEqual(["THIRTEENTH_MONTH"]);
    expect(full!.computation.thirteenthMonth?.periods).toHaveLength(16);
  });

  it("goes through the same approval and PDF path", async () => {
    await payroll.approvePeriod(officer, companyId, thirteenthId);
    const period = await payroll.getPeriod(officer, companyId, thirteenthId);
    expect(period!.status).toBe("APPROVED");
    const slips = await payroll.listPayslips(officer, companyId, thirteenthId);
    expect(slips.every((s) => s.slipCode)).toBe(true);
    const html = await documents.renderPeriodHtml(officer, companyId, thirteenthId);
    expect(html).toContain("13th month pay");
    expect(html).toContain("1-Jan-26");
    expect(html).toContain("31-Dec-26");
  });

  it("does not advance the regular cutoff sequence", async () => {
    const next = await payroll.nextPeriodCutoff(officer, companyId);
    expect(next.start).toBe("2026-09-01");
  });

  it("appears in the annual report as 13th month, within the tax-free ceiling", async () => {
    const r = await reports.buildReport(officer, companyId, "annual", { year: 2026 });
    if (r.key !== "annual") throw new Error("wrong key");
    const garcia = r.data.rows.find((x) => x.employeeNo === `${TAG}-0001`)!;
    expect(garcia.thirteenthMonth).toBe("23333.33");
    expect(garcia.thirteenthNonTaxable).toBe("23333.33");
    expect(garcia.basic).toBe("280000.00");
    expect(r.hasTaxTable).toBe(true);
    expect(garcia.taxDue).not.toBeNull();
  });
});

describe("year-end annualization", () => {
  let lastId = "";

  it("computes due vs withheld and needs an unapproved last period to apply", async () => {
    let a = await yearend.annualize(officer, companyId, 2026);
    const garcia = a.rows.find((r) => r.employeeId === monthlyId)!;
    expect(money(garcia.withheld).gt(0)).toBe(true);
    expect(garcia.periods).toBe(17); // 16 regular + 13th month
    expect(a.lastPeriod?.frozen).toBe(true);
    await expect(yearend.applyAnnualization(officer, companyId, 2026)).rejects.toThrow(
      /already approved/,
    );

    // a computed September period becomes the year's last period
    const sep = await payroll.createPeriod(officer, companyId, {
      month: "2026-09",
      half: "1",
      payDate: null,
    });
    lastId = sep.id;
    await payroll.computePeriod(officer, companyId, sep.id);
    a = await yearend.annualize(officer, companyId, 2026);
    expect(a.lastPeriod?.id).toBe(sep.id);
    expect(a.lastPeriod?.frozen).toBe(false);
  });

  it("applies a refund or additional-tax line and recomputes; re-applying is idempotent", async () => {
    const before = await yearend.annualize(officer, companyId, 2026);
    const garciaBefore = before.rows.find((r) => r.employeeId === monthlyId)!;
    const diff = money(garciaBefore.difference);
    expect(diff.abs().gte("0.01")).toBe(true); // 8½ months withheld at semi-monthly rates ≠ annual due on 8½ months

    const r = await yearend.applyAnnualization(officer, companyId, 2026);
    expect(r.periodId).toBe(lastId);
    expect(r.applied).toBeGreaterThanOrEqual(1);

    const slips = await payroll.listPayslips(officer, companyId, lastId);
    const slip = await payroll.getPayslip(
      officer,
      companyId,
      slips.find((s) => s.employeeId === monthlyId)!.id,
    );
    const line = slip!.lines.find(
      (l) => l.componentCode === (diff.lt(0) ? "TAX_REFUND" : "WTAX_ADJ"),
    )!;
    expect(money(line.amount.toString()).toFixed(2)).toBe(diff.abs().toFixed(2));
    expect(line.isManual).toBe(true);

    const after = await yearend.annualize(officer, companyId, 2026);
    const garciaAfter = after.rows.find((r) => r.employeeId === monthlyId)!;
    expect(garciaAfter.withheld).toBe(garciaBefore.withheld); // annualization lines are not "withheld"
    expect(garciaAfter.applied).toBe(diff.toFixed(2));
    const again = await yearend.applyAnnualization(officer, companyId, 2026);
    expect(again.applied).toBe(0);
    const count = await prisma.payrollAdjustment.count({
      where: {
        companyId,
        payPeriodId: lastId,
        employeeId: monthlyId,
        componentCode: { in: ["TAX_REFUND", "WTAX_ADJ"] },
      },
    });
    expect(count).toBe(1);
  });

  it("only payroll roles in the company may annualize", async () => {
    const elsewhere: Scope = { ...officer, companyIds: ["01a09ebb-0000-7000-8000-000000000000"] };
    await expect(yearend.annualize(elsewhere, companyId, 2026)).rejects.toThrow();
  });
});

describe("email outbox (JSON transport)", () => {
  const periodId = () => periodIds[periodIds.length - 1]!; // 16–31 Aug, approved

  it("refuses until the final PDFs exist, then queues one message per payslip", async () => {
    await expect(email.enqueuePayslipEmails(officer, companyId, periodId())).rejects.toThrow(
      /final PDFs/,
    );
    await documents.generatePeriodPdfs(admin, companyId, periodId());
    const r = await email.enqueuePayslipEmails(officer, companyId, periodId());
    expect(r.queued).toBe(1); // Garcia has an email
    expect(r.skipped).toBe(1); // Santos has none
    expect(r.job?.status).toBe("QUEUED");
    const results = await runDueJobs(10);
    expect(results.find((x) => x.id === r.job!.id)?.status).toBe("DONE");
    const outbox = await email.periodOutbox(officer, companyId, periodId());
    expect(outbox.counts).toEqual({ queued: 0, sent: 1, failed: 0, skipped: 1 });
    const sent = outbox.messages.find((m) => m.status === "SENT")!;
    expect(sent.toAddress).toBe("jose@example.com");
    expect(sent.subject).toContain("Payslip");
    expect(sent.providerId).toBeTruthy();
  }, 60_000);

  it("a second run reaches only the unsent", async () => {
    const r = await email.enqueuePayslipEmails(officer, companyId, periodId());
    expect(r.queued).toBe(0);
    expect(r.alreadySent).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("is refused when the company has it off", async () => {
    await prisma.company.update({
      where: { id: companyId },
      data: { emailPayslipsEnabled: false },
    });
    await expect(email.enqueuePayslipEmails(officer, companyId, periodId())).rejects.toThrow(
      /turned off/,
    );
  });
});
