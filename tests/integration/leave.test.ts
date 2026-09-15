import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Scope } from "@/lib/scope";
import * as payroll from "@/modules/payroll/service";
import * as leave from "@/modules/leave/service";
import * as employees from "@/modules/employees/service";
import * as attachments from "@/modules/attachments/service";
import { cutoffSummaryFor } from "@/modules/attendance/service";
import { runDueJobs } from "@/modules/documents/jobs/service";
import { seedStatutory } from "../../prisma/seed/statutory-2026";

/**
 * Phase 6 acceptance: a leave-without-pay request approved for the next period reduces the
 * employee's days worked (and a monthly employee's basic) when that period is computed.
 * Also: credits for leave with pay, refusal on insufficient credits, cancel restores
 * attendance and credits, rollover job allocates next year's credits with carry-over,
 * separation marks the final payslip and excludes the employee afterwards, and 201 files are
 * scoped.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TAG = `LTEST${Date.now().toString(36).toUpperCase().slice(-6)}`;

let companyId = "";
let adminId = "";
let officerId = "";
let monthlyId = "";
let dailyId = "";
let vlId = "";
let lwopId = "";
let admin: Scope;
let officer: Scope;
let officerElsewhere: Scope;

/** 1–15 Sep 2026: 1 Sep is Tuesday; Sundays 6 and 13 → 13 scheduled days (no holidays). */
const CUTOFF = { start: "2026-09-01", end: "2026-09-15" };

/** Attendance for 1–15 Sep; `skip` = days the leave requests below will cover (nothing encoded). */
async function fillAttendance(employeeId: string, skip: number[]) {
  const rows = [];
  for (let day = 1; day <= 15; day++) {
    if (skip.includes(day)) continue;
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    const sunday = day === 6 || day === 13;
    rows.push({
      companyId,
      employeeId,
      date: d(date),
      dayType: sunday ? ("REST_DAY" as const) : ("REGULAR" as const),
      timeIn: sunday ? null : "08:00",
      timeOut: sunday ? null : "17:00",
      hoursWorked: sunday ? 0 : 8,
      isAbsent: false,
      source: "MANUAL" as const,
    });
  }
  await prisma.dailyTimeRecord.createMany({ data: rows });
}

beforeAll(async () => {
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
  adminId = a.id;
  officerId = o.id;
  const company = await prisma.company.create({
    data: {
      code: TAG,
      legalName: `${TAG} Leave Co.`,
      address: "Test St.",
      payFrequency: "SEMI_MONTHLY",
      signatoryName: "Sig",
      signatoryTitle: "Payroll",
      slipCodePrefix: TAG,
      employeeNoPrefix: TAG,
      policies: { create: { effectiveFrom: d("2026-01-01"), officerCanApprove: true } },
      users: { create: { userId: o.id } },
      leaveTypes: {
        create: [
          {
            code: "VL",
            name: "Vacation leave",
            withPayDefault: true,
            annualCredits: "5",
            maxCarryover: "2",
          },
          { code: "LWOP", name: "Leave without pay", withPayDefault: false, annualCredits: "0" },
        ],
      },
    },
    include: { leaveTypes: true },
  });
  companyId = company.id;
  vlId = company.leaveTypes.find((t) => t.code === "VL")!.id;
  lwopId = company.leaveTypes.find((t) => t.code === "LWOP")!.id;
  admin = { userId: adminId, role: "ADMIN", companyIds: null, ip: null };
  officer = { userId: officerId, role: "PAYROLL_OFFICER", companyIds: [companyId], ip: null };
  officerElsewhere = {
    userId: officerId,
    role: "PAYROLL_OFFICER",
    companyIds: ["01a09ebb-0000-7000-8000-000000000000"],
    ip: null,
  };
  const monthly = await prisma.employee.create({
    data: {
      companyId,
      employeeNo: `${TAG}-0001`,
      lastName: "Garcia",
      firstName: "Jose",
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
  await fillAttendance(monthlyId, [5, 7]);
  await fillAttendance(dailyId, [8, 14]);
});

afterAll(async () => {
  if (companyId) {
    await prisma.$executeRaw`UPDATE pay_periods SET status = 'COMPUTED' WHERE company_id = ${companyId}::uuid`;
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.$disconnect();
});

describe("leave without pay → next payroll run", () => {
  let periodId = "";
  let requestId = "";

  it("baseline: 13 scheduled days, 11 worked, 2 not yet encoded", async () => {
    const s = await cutoffSummaryFor(officer, companyId, monthlyId, {
      ...CUTOFF,
      sequenceInMonth: 1,
    });
    expect(s.scheduledDays).toBe(13);
    expect(s.daysWorked).toBe(11);
    expect(s.unrecordedDays).toBe(2);
    expect(s.leaveWithoutPayDays).toBe(0);
  });

  it("filing a request counts only scheduled days and refuses overlaps", async () => {
    // 5–7 Sep: Sat 5 is a regular day here (rest day is Sunday), Sun 6 rest, Mon 7 regular → 2 days
    const r = await leave.createRequest(officer, companyId, {
      employeeId: monthlyId,
      leaveTypeId: lwopId,
      startDate: "2026-09-05",
      endDate: "2026-09-07",
      withPay: false,
      reason: "Family matter",
    });
    requestId = r.id;
    expect(r.status).toBe("PENDING");
    expect(Number(r.days)).toBe(2);
    await expect(
      leave.createRequest(officer, companyId, {
        employeeId: monthlyId,
        leaveTypeId: lwopId,
        startDate: "2026-09-07",
        endDate: "2026-09-08",
        withPay: false,
        reason: null,
      }),
    ).rejects.toThrow(/already has a leave request/);
  });

  it("an officer outside the company cannot see or approve it", async () => {
    await expect(
      leave.approveRequest(officerElsewhere, companyId, requestId, null),
    ).rejects.toThrow();
    expect(await leave.listRequests(officer, companyId, { status: "PENDING" })).toHaveLength(1);
  });

  it("approving writes LEAVE_WITHOUT_PAY rows (source LEAVE) for the working days", async () => {
    const r = await leave.approveRequest(officer, companyId, requestId, "ok");
    expect(r.status).toBe("APPROVED");
    const rows = await prisma.dailyTimeRecord.findMany({
      where: { employeeId: monthlyId, date: { gte: d("2026-09-05"), lte: d("2026-09-07") } },
      orderBy: { date: "asc" },
    });
    expect(rows.map((x) => x.dayType)).toEqual([
      "LEAVE_WITHOUT_PAY",
      "REST_DAY",
      "LEAVE_WITHOUT_PAY",
    ]);
    expect(rows.filter((x) => x.source === "LEAVE")).toHaveLength(2);
    expect(rows[0]!.remarks).toContain("Leave without pay");
    const s = await cutoffSummaryFor(officer, companyId, monthlyId, {
      ...CUTOFF,
      sequenceInMonth: 1,
    });
    expect(s.daysWorked).toBe(11);
    expect(s.leaveWithoutPayDays).toBe(2);
    expect(s.absentDays).toBe(2);
    expect(s.unrecordedDays).toBe(0);
  });

  it("the next payroll run pays 2 days less (acceptance)", async () => {
    const period = await payroll.createPeriod(officer, companyId, {
      month: "2026-09",
      half: "1",
      payDate: "2026-09-20",
    });
    periodId = period.id;
    await payroll.computePeriod(officer, companyId, periodId);
    const slips = await payroll.listPayslips(officer, companyId, periodId);
    const slip = slips.find((p) => p.employeeId === monthlyId)!;
    expect(Number(slip.daysWorked)).toBe(11);
    const full = await payroll.getPayslip(officer, companyId, slip.id);
    const basic = full!.lines.find((l) => l.componentCode === "BASIC")!;
    // ½ × 35,000 − 2 × 1,341.85
    expect(Number(basic.amount)).toBeCloseTo(17500 - 2 * 1341.85, 2);
    expect(basic.note).toContain("incl. 2 leave w/o pay");
    expect(full!.flags.map((f) => f.code)).not.toContain("UNRECORDED_DAYS");
  });

  it("leave with pay takes credits, keeps the monthly basic whole, and refuses when short", async () => {
    // daily employee: VL 5 credits allocated on first use
    const r = await leave.createRequest(officer, companyId, {
      employeeId: dailyId,
      leaveTypeId: vlId,
      startDate: "2026-09-08",
      endDate: "2026-09-08",
      withPay: true,
      reason: null,
    });
    await leave.approveRequest(officer, companyId, r.id, null);
    const balances = await leave.employeeBalances(officer, companyId, dailyId, 2026);
    const vl = balances.find((b) => b.leaveType.code === "VL")!;
    expect(vl).toMatchObject({ credits: "5", used: "1", remaining: "4" });

    await payroll.computePeriod(officer, companyId, periodId, dailyId);
    const slips = await payroll.listPayslips(officer, companyId, periodId);
    const slip = slips.find((p) => p.employeeId === dailyId)!;
    expect(Number(slip.daysWorked)).toBe(12); // 11 worked + 1 leave with pay (14 Sep not encoded)
    expect(Number(slip.grossPay)).toBeCloseTo(12 * 700, 2);

    // more than the remaining 4 credits → refused at approval
    const big = await leave.createRequest(officer, companyId, {
      employeeId: dailyId,
      leaveTypeId: vlId,
      startDate: "2026-09-21",
      endDate: "2026-09-26",
      withPay: true,
      reason: null,
    });
    expect(Number(big.days)).toBe(6);
    await expect(leave.approveRequest(officer, companyId, big.id, null)).rejects.toThrow(
      /Not enough VL credits/,
    );
    await leave.cancelRequest(officer, companyId, big.id);
  });

  it("cancelling an approved leave removes its rows and returns the credits", async () => {
    const approved = (
      await leave.listRequests(officer, companyId, { employeeId: dailyId, status: "APPROVED" })
    )[0]!;
    await leave.cancelRequest(officer, companyId, approved.id);
    const row = await prisma.dailyTimeRecord.findFirst({
      where: { employeeId: dailyId, date: d("2026-09-08") },
    });
    expect(row).toBeNull();
    const vl = (await leave.employeeBalances(officer, companyId, dailyId, 2026)).find(
      (b) => b.leaveType.code === "VL",
    )!;
    expect(vl.used).toBe("0");
  });

  it("dates inside an approved period cannot be taken or undone", async () => {
    await payroll.approvePeriod(officer, companyId, periodId);
    const r = await leave.createRequest(officer, companyId, {
      employeeId: dailyId,
      leaveTypeId: lwopId,
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      withPay: false,
      reason: null,
    });
    await expect(leave.approveRequest(officer, companyId, r.id, null)).rejects.toThrow(
      /approved pay period/,
    );
    await expect(leave.cancelRequest(officer, companyId, requestId)).rejects.toThrow(
      /approved pay period/,
    );
  });

  it("manual credit adjustment is audited with its reason", async () => {
    await leave.adjustCredits(officer, companyId, dailyId, {
      leaveTypeId: vlId,
      year: 2026,
      delta: "-3",
      reason: "Used before go-live",
    });
    const vl = (await leave.employeeBalances(officer, companyId, dailyId, 2026)).find(
      (b) => b.leaveType.code === "VL",
    )!;
    expect(vl.credits).toBe("2");
    const log = await prisma.auditLog.findFirst({
      where: { entity: "LeaveBalance", entityId: vl.balanceId!, action: "UPDATE" },
      orderBy: { at: "desc" },
    });
    expect(JSON.stringify(log?.after)).toContain("Used before go-live");
    await expect(
      leave.adjustCredits(officerElsewhere, companyId, dailyId, {
        leaveTypeId: vlId,
        year: 2026,
        delta: "1",
        reason: "nope",
      }),
    ).rejects.toThrow();
  });

  it("the rollover job allocates 2027 credits with carry-over, and is idempotent", async () => {
    const job = await leave.enqueueRollover(officer, companyId, 2027);
    expect(job.status).toBe("QUEUED");
    const results = await runDueJobs(10);
    expect(results.find((r) => r.id === job.id)?.status).toBe("DONE");
    // daily: VL credits 2, used 0 → carry min(2, cap 2) = 2 → 5 + 2 = 7
    const daily2027 = (await leave.employeeBalances(officer, companyId, dailyId, 2027)).find(
      (b) => b.leaveType.code === "VL",
    )!;
    expect(daily2027.credits).toBe("7");
    // monthly: no 2026 VL balance → 5
    const monthly2027 = (await leave.employeeBalances(officer, companyId, monthlyId, 2027)).find(
      (b) => b.leaveType.code === "VL",
    )!;
    expect(monthly2027.credits).toBe("5");
    // second run creates nothing new
    const again = await leave.enqueueRollover(officer, companyId, 2027);
    await runDueJobs(10);
    expect(again.id).not.toBe(job.id);
    const count = await prisma.leaveBalance.count({ where: { companyId, year: 2027 } });
    expect(count).toBe(4);
  });
});

describe("separation", () => {
  it("marks the payslip of the period containing the date as final pay and excludes later periods", async () => {
    await employees.separateEmployee(officer, companyId, dailyId, {
      separationDate: "2026-09-25",
      reason: "Resigned",
    });
    const period = await payroll.createPeriod(officer, companyId, {
      month: "2026-09",
      half: "2",
      payDate: "2026-10-05",
    });
    await payroll.computePeriod(officer, companyId, period.id);
    const slips = await payroll.listPayslips(officer, companyId, period.id);
    const slip = slips.find((p) => p.employeeId === dailyId)!;
    expect(slip.finalPay).toBe(true);
    expect(slips.find((p) => p.employeeId === monthlyId)!.finalPay).toBe(false);
    // days after 25 Sep are not scheduled for them: 16–25 Sep has Sundays 20 → 9 scheduled days
    const s = await cutoffSummaryFor(officer, companyId, dailyId, {
      start: "2026-09-16",
      end: "2026-09-30",
      sequenceInMonth: 2,
    });
    expect(s.scheduledDays).toBe(13); // 16–30 Sep less Sundays 20, 27
    expect(s.unrecordedDays).toBe(9); // no attendance encoded for 16–25
    expect(s.absentDays).toBe(13); // 9 unrecorded + 4 days after separation

    const next = await payroll.createPeriod(officer, companyId, {
      month: "2026-10",
      half: "1",
      payDate: "2026-10-20",
    });
    await payroll.computePeriod(officer, companyId, next.id);
    const nextSlips = await payroll.listPayslips(officer, companyId, next.id);
    expect(nextSlips.some((p) => p.employeeId === dailyId)).toBe(false);
    await expect(
      leave.createRequest(officer, companyId, {
        employeeId: dailyId,
        leaveTypeId: lwopId,
        startDate: "2026-10-05",
        endDate: "2026-10-05",
        withPay: false,
        reason: null,
      }),
    ).rejects.toThrow(/separated/);
  });

  it("only an admin can reinstate", async () => {
    await expect(
      employees.reinstateEmployee(officer, companyId, dailyId, "oops"),
    ).rejects.toThrow();
    const e = await employees.reinstateEmployee(admin, companyId, dailyId, "Wrong employee");
    expect(e.status).toBe("ACTIVE");
    expect(e.separationDate).toBeNull();
  });
});

describe("201 attachments", () => {
  const pdf = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  let documentId = "";

  it("stores a PDF under /data/employees/{id}/ and lists it", async () => {
    const file = new File([pdf], "../contract.pdf", { type: "text/plain" });
    const doc = await attachments.uploadDocument(officer, companyId, monthlyId, file, "Contract");
    documentId = doc.id;
    expect(doc.mimeType).toBe("application/pdf");
    expect(doc.fileName).toBe("contract.pdf");
    expect(doc.storagePath).toBe(`employees/${monthlyId}/${doc.id}.pdf`);
    const list = await attachments.listDocuments(officer, companyId, monthlyId);
    expect(list.map((x) => x.id)).toContain(doc.id);
  });

  it("rejects files that are not PDF/JPEG/PNG/WebP whatever their name", async () => {
    const file = new File([Buffer.from("MZ  not really")], "photo.png", { type: "image/png" });
    await expect(
      attachments.uploadDocument(officer, companyId, monthlyId, file, null),
    ).rejects.toThrow(/Only PDF/);
  });

  it("is readable only inside the company scope", async () => {
    const mine = await attachments.readDocument(officer, companyId, monthlyId, documentId);
    expect(mine?.bytes.equals(pdf)).toBe(true);
    await expect(
      attachments.readDocument(officerElsewhere, companyId, monthlyId, documentId),
    ).rejects.toThrow();
  });

  it("delete removes the row and the file", async () => {
    await attachments.deleteDocument(officer, companyId, monthlyId, documentId);
    expect(await attachments.readDocument(officer, companyId, monthlyId, documentId)).toBeNull();
  });
});
