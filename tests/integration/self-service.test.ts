import { rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resolveDataPath } from "@/lib/storage";
import type { Scope } from "@/lib/scope";
import * as auth from "@/modules/auth/service";
import * as documents from "@/modules/documents/service";
import { closeBrowser } from "@/modules/documents/pdf";
import * as employees from "@/modules/employees/service";
import * as leave from "@/modules/leave/service";
import * as payroll from "@/modules/payroll/service";
import * as me from "@/modules/self-service/service";
import { seedStatutory } from "../../prisma/seed/statutory-2026";

/**
 * Phase 9 acceptance: an employee login sees only its own data.
 *  - an officer creates the login from the employee record (EMPLOYEE role, one company);
 *  - the employee reads their own record, DTR, balances and requests, and files/withdraws leave;
 *  - every read or write aimed at a colleague is refused, and staff screens are closed to them;
 *  - payslips show up only once the period is RELEASED; the colleague's never do;
 *  - separation disables the login inside the same transaction.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TAG = `SSTEST${Date.now().toString(36).toUpperCase().slice(-6)}`;
const FORBIDDEN = /permission|access/i;

let companyId = "";
let otherCompanyId = "";
let officerId = "";
let aliceId = "";
let bobId = "";
let vlId = "";
let officer: Scope;
let alice: Scope;
let staffOnly: Scope;

async function fillAttendance(employeeId: string) {
  const rows = [];
  // 1–15 Aug 2026: 1 Aug is Saturday; Sundays 2 and 9 → 13 scheduled days (no holidays)
  for (let day = 1; day <= 15; day++) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    const sunday = day === 2 || day === 9;
    rows.push({
      companyId,
      employeeId,
      date: d(date),
      dayType: sunday ? ("REST_DAY" as const) : ("REGULAR" as const),
      timeIn: sunday ? null : "08:00",
      timeOut: sunday ? null : "17:00",
      hoursWorked: sunday ? 0 : 8,
      lateMinutes: day === 3 ? 15 : 0,
      isAbsent: false,
      source: "MANUAL" as const,
    });
  }
  await prisma.dailyTimeRecord.createMany({ data: rows });
}

beforeAll(async () => {
  await seedStatutory(prisma);
  const o = await prisma.user.create({
    data: {
      email: `${TAG.toLowerCase()}-officer@example.com`,
      name: "O",
      passwordHash: "x",
      role: "PAYROLL_OFFICER",
    },
  });
  officerId = o.id;
  const mk = (code: string) =>
    prisma.company.create({
      data: {
        code,
        legalName: `${code} Co.`,
        address: "Test St.",
        payFrequency: "SEMI_MONTHLY",
        signatoryName: "Sig",
        signatoryTitle: "Payroll",
        slipCodePrefix: code,
        employeeNoPrefix: code,
        policies: { create: { effectiveFrom: d("2026-01-01"), officerCanApprove: true } },
        users: { create: { userId: o.id } },
        leaveTypes: {
          create: [
            { code: "VL", name: "Vacation leave", withPayDefault: true, annualCredits: "5" },
          ],
        },
      },
      include: { leaveTypes: true },
    });
  const company = await mk(TAG);
  const other = await mk(`${TAG}B`);
  companyId = company.id;
  otherCompanyId = other.id;
  vlId = company.leaveTypes[0]!.id;
  officer = {
    userId: officerId,
    role: "PAYROLL_OFFICER",
    companyIds: [companyId, otherCompanyId],
    ip: null,
  };

  const emp = (employeeNo: string, lastName: string, firstName: string) =>
    prisma.employee.create({
      data: {
        companyId,
        employeeNo,
        lastName,
        firstName,
        email: `${employeeNo.toLowerCase()}@example.com`,
        hireDate: d("2024-01-15"),
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
  const a = await emp(`${TAG}-0001`, "Alonzo", "Alice");
  const b = await emp(`${TAG}-0002`, "Bautista", "Bob");
  aliceId = a.id;
  bobId = b.id;
  await fillAttendance(aliceId);
  await fillAttendance(bobId);
});

afterAll(async () => {
  await closeBrowser();
  for (const id of [companyId, otherCompanyId]) {
    if (!id) continue;
    await rm(resolveDataPath("payslips", id), { recursive: true, force: true });
    await prisma.$executeRaw`UPDATE pay_periods SET status = 'COMPUTED' WHERE company_id = ${id}::uuid`;
    await prisma.company.delete({ where: { id } });
  }
  await prisma.user.deleteMany({ where: { email: { contains: TAG.toLowerCase() } } });
  await prisma.$disconnect();
});

describe("portal access is created from the employee record", () => {
  it("an officer of the company creates the login; it is an EMPLOYEE of that company only", async () => {
    expect(await auth.getEmployeeLogin(officer, companyId, aliceId)).toBeNull();
    const login = await auth.createEmployeeLogin(officer, companyId, aliceId, {
      email: `${TAG.toLowerCase()}-alice@example.com`,
      password: "Alice-Portal-2026",
    });
    expect(login.mustChangePassword).toBe(true);
    expect(login.isActive).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: login.email },
      include: { companies: true },
    });
    expect(user.role).toBe("EMPLOYEE");
    expect(user.employeeId).toBe(aliceId);
    expect(user.companies.map((c) => c.companyId)).toEqual([companyId]);
    alice = {
      userId: user.id,
      role: "EMPLOYEE",
      companyIds: [companyId],
      ip: null,
      employeeId: aliceId,
    };
    // a broken EMPLOYEE scope with no linked record can do nothing
    staffOnly = {
      userId: user.id,
      role: "EMPLOYEE",
      companyIds: [companyId],
      ip: null,
      employeeId: null,
    };
  });

  it("one login per employee, unique email, and never for a company the officer cannot reach", async () => {
    await expect(
      auth.createEmployeeLogin(officer, companyId, aliceId, {
        email: `${TAG.toLowerCase()}-alice2@example.com`,
        password: "Alice-Portal-2026",
      }),
    ).rejects.toThrow(/already has a login/);
    await expect(
      auth.createEmployeeLogin(officer, companyId, bobId, {
        email: `${TAG.toLowerCase()}-alice@example.com`,
        password: "Bob-Portal-2026x",
      }),
    ).rejects.toThrow(/already in use/);
    const stranger: Scope = {
      userId: officerId,
      role: "PAYROLL_OFFICER",
      companyIds: [otherCompanyId],
      ip: null,
    };
    await expect(
      auth.createEmployeeLogin(stranger, companyId, bobId, {
        email: `${TAG.toLowerCase()}-bob@example.com`,
        password: "Bob-Portal-2026x",
      }),
    ).rejects.toThrow(FORBIDDEN);
    // an encoder may not manage portal access
    const encoder: Scope = {
      userId: officerId,
      role: "ENCODER",
      companyIds: [companyId],
      ip: null,
    };
    await expect(auth.getEmployeeLogin(encoder, companyId, aliceId)).rejects.toThrow(FORBIDDEN);
  });

  it("the Users screen cannot edit an employee login as staff", async () => {
    const admin: Scope = { userId: officerId, role: "ADMIN", companyIds: null, ip: null };
    await expect(
      auth.updateUser(admin, alice.userId, {
        name: "X",
        role: "ADMIN",
        isActive: true,
        companyIds: [],
      }),
    ).rejects.toThrow(/managed from the employee/);
  });
});

describe("the employee sees only their own data", () => {
  it("own record, DTR and balances", async () => {
    const ctx = await me.portalContext(alice);
    expect(ctx.employee.id).toBe(aliceId);
    expect(ctx.company.id).toBe(companyId);
    const dtr = await me.myDtr(alice, {
      start: "2026-08-01",
      end: "2026-08-15",
      sequenceInMonth: 1,
    });
    expect(dtr.summary.daysWorked).toBe(13);
    expect(dtr.summary.lateMinutes).toBe(15);
    const { balances, requests } = await me.myLeave(alice, 2026);
    expect(balances.map((b) => b.leaveType.code)).toEqual(["VL"]);
    expect(requests).toEqual([]);
  });

  it("nothing of a colleague, and no staff screens", async () => {
    await expect(employees.getEmployee(alice, companyId, bobId)).rejects.toThrow(FORBIDDEN);
    await expect(employees.listEmployees(alice, companyId)).rejects.toThrow(FORBIDDEN);
    await expect(leave.listRequests(alice, companyId, {})).rejects.toThrow(FORBIDDEN);
    await expect(leave.listRequests(alice, companyId, { employeeId: bobId })).rejects.toThrow(
      FORBIDDEN,
    );
    await expect(leave.employeeBalances(alice, companyId, bobId, 2026)).rejects.toThrow(FORBIDDEN);
    await expect(payroll.listPeriods(alice, companyId)).rejects.toThrow(FORBIDDEN);
    await expect(payroll.listReleasedPayslipsOf(alice, companyId, bobId)).rejects.toThrow(
      FORBIDDEN,
    );
    await expect(
      leave.createRequest(alice, companyId, {
        employeeId: bobId,
        leaveTypeId: vlId,
        startDate: "2026-10-05",
        endDate: "2026-10-05",
        withPay: true,
        reason: null,
      }),
    ).rejects.toThrow(FORBIDDEN);
    // an EMPLOYEE scope without a linked record is refused everywhere
    await expect(me.portalContext(staffOnly)).rejects.toThrow(/employee logins/i);
    await expect(employees.getEmployee(staffOnly, companyId, aliceId)).rejects.toThrow(FORBIDDEN);
  });

  it("files leave for themselves, cannot approve it, and can withdraw it while pending", async () => {
    const r = await me.fileLeave(alice, {
      leaveTypeId: vlId,
      startDate: "2026-10-05",
      endDate: "2026-10-06",
      withPay: true,
      reason: "Family",
    });
    expect(r.employeeId).toBe(aliceId);
    expect(r.status).toBe("PENDING");
    expect(r.encodedById).toBe(alice.userId);
    await expect(leave.approveRequest(alice, companyId, r.id, null)).rejects.toThrow(FORBIDDEN);
    const mine = await me.myLeave(alice, 2026);
    expect(mine.requests.map((x) => x.id)).toEqual([r.id]);

    // Bob's request (filed by the officer) is not Alice's to withdraw
    const bobs = await leave.createRequest(officer, companyId, {
      employeeId: bobId,
      leaveTypeId: vlId,
      startDate: "2026-10-07",
      endDate: "2026-10-07",
      withPay: true,
      reason: null,
    });
    await expect(me.withdrawLeave(alice, bobs.id)).rejects.toThrow(FORBIDDEN);

    const after = await me.withdrawLeave(alice, r.id);
    expect(after.status).toBe("CANCELLED");
    // once approved, withdrawing needs leave.approve (staff) — an employee is refused
    await leave.approveRequest(officer, companyId, bobs.id, null);
    await expect(me.withdrawLeave(alice, bobs.id)).rejects.toThrow(FORBIDDEN);
  });

  it("payslips appear only once the period is released, and only their own", async () => {
    // a pay date in the past, so the period can be released today
    const period = await payroll.createPeriod(officer, companyId, {
      month: "2026-08",
      half: "1",
      payDate: "2026-08-20",
    });
    await payroll.computePeriod(officer, companyId, period.id);
    expect(await me.myPayslips(alice)).toEqual([]);
    await payroll.approvePeriod(officer, companyId, period.id);
    expect(await me.myPayslips(alice)).toEqual([]);
    await payroll.releasePeriod(officer, companyId, period.id);
    const slips = await me.myPayslips(alice);
    expect(slips).toHaveLength(1);
    expect(slips[0]!.payPeriod.id).toBe(period.id);
    const full = await me.myPayslip(alice, slips[0]!.id);
    expect(full?.employee.id).toBe(aliceId);
    expect(full?.lines.length).toBeGreaterThan(0);
    // Bob's payslip in the same released period is invisible (null, not forbidden — not enumerable)
    const bobSlip = await prisma.payslip.findFirstOrThrow({
      where: { payPeriodId: period.id, employeeId: bobId },
    });
    expect(await me.myPayslip(alice, bobSlip.id)).toBeNull();
    expect(await me.myPayslipPdf(alice, bobSlip.id)).toBeNull();
    // no PDF generated yet → null, not an error
    expect(await me.myPayslipPdf(alice, slips[0]!.id)).toBeNull();
    // once payroll renders the period, the employee gets their own file and only that one
    await documents.generatePeriodPdfs(officer, companyId, period.id);
    const pdf = await me.myPayslipPdf(alice, slips[0]!.id);
    expect(pdf?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf?.file).toBe(`${slips[0]!.slipCode}.pdf`);
    expect(await me.myPayslipPdf(alice, bobSlip.id)).toBeNull();
  });
});

describe("creating an employee with portal access in one step", () => {
  const base = {
    employeeNo: null,
    lastName: "Cruz",
    firstName: "Carla",
    middleName: null,
    suffix: null,
    birthDate: null,
    hireDate: "2026-09-01",
    separationDate: null,
    status: "ACTIVE" as const,
    position: null,
    department: null,
    mobile: null,
    address: null,
    sssNo: null,
    philhealthNo: null,
    pagibigMid: null,
    tin: null,
    taxStatus: "S" as const,
  };

  it("writes the employee and the login together; the email falls back to the employee's", async () => {
    const row = await employees.createEmployee(
      officer,
      companyId,
      { ...base, employeeNo: `${TAG}-0003`, email: `${TAG.toLowerCase()}-carla@example.com` },
      { confirmWarnings: true },
      { email: null, password: "Carla-Portal-2026" },
    );
    const login = await auth.getEmployeeLogin(officer, companyId, row.id);
    expect(login?.email).toBe(`${TAG.toLowerCase()}-carla@example.com`);
    expect(login?.mustChangePassword).toBe(true);
  });

  it("a taken email rolls the employee back too, and an encoder cannot add a login", async () => {
    const before = await prisma.employee.count({ where: { companyId } });
    await expect(
      employees.createEmployee(
        officer,
        companyId,
        { ...base, employeeNo: `${TAG}-0004`, firstName: "Dup", email: null },
        { confirmWarnings: true },
        { email: `${TAG.toLowerCase()}-carla@example.com`, password: "Dup-Portal-2026x" },
      ),
    ).rejects.toMatchObject({ fieldErrors: { portalEmail: ["Already in use"] } });
    await expect(
      employees.createEmployee(
        officer,
        companyId,
        { ...base, employeeNo: `${TAG}-0005`, firstName: "NoMail", email: null },
        { confirmWarnings: true },
        { email: null, password: "NoMail-Portal-2026" },
      ),
    ).rejects.toThrow(/sign-in email/);
    const encoder: Scope = {
      userId: officerId,
      role: "ENCODER",
      companyIds: [companyId],
      ip: null,
    };
    await expect(
      employees.createEmployee(
        encoder,
        companyId,
        {
          ...base,
          employeeNo: `${TAG}-0006`,
          firstName: "Enc",
          email: `${TAG.toLowerCase()}-enc@example.com`,
        },
        { confirmWarnings: true },
        { email: null, password: "Enc-Portal-2026xx" },
      ),
    ).rejects.toThrow(FORBIDDEN);
    expect(await prisma.employee.count({ where: { companyId } })).toBe(before);
  });
});

describe("lifecycle of the login", () => {
  it("reset and disable/enable are audited and take effect", async () => {
    const reset = await auth.resetEmployeeLogin(officer, companyId, aliceId, {
      password: "Alice-Portal-2027",
    });
    expect(reset.mustChangePassword).toBe(true);
    const off = await auth.setEmployeeLoginActive(officer, companyId, aliceId, false);
    expect(off.isActive).toBe(false);
    const on = await auth.setEmployeeLoginActive(officer, companyId, aliceId, true);
    expect(on.isActive).toBe(true);
    const audits = await prisma.auditLog.findMany({
      where: { entity: "User", entityId: alice.userId },
      orderBy: { at: "asc" },
    });
    expect(audits.map((a) => a.action)).toEqual(["CREATE", "PASSWORD_RESET", "UPDATE", "UPDATE"]);
  });

  it("separating the employee disables the login in the same transaction", async () => {
    await employees.separateEmployee(officer, companyId, aliceId, {
      separationDate: "2026-09-30",
      reason: "Resigned",
    });
    const login = await auth.getEmployeeLogin(officer, companyId, aliceId);
    expect(login?.isActive).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: alice.userId } });
    expect(user.isActive).toBe(false);
    const last = await prisma.auditLog.findFirst({
      where: { entity: "User", entityId: alice.userId },
      orderBy: { at: "desc" },
    });
    expect(last?.after).toMatchObject({ isActive: false, reason: "separated" });
    // and a separated employee cannot be given a (new) login
    await expect(
      auth.createEmployeeLogin(officer, companyId, aliceId, {
        email: `${TAG.toLowerCase()}-alice3@example.com`,
        password: "Alice-Portal-2028",
      }),
    ).rejects.toThrow(/separated employee/);
  });
});
