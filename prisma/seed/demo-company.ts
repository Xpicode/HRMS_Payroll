/**
 * Demo company with five employees covering the cases the payroll engine tests will need:
 * a monthly employee (the payslip template's Dela Cruz, Dorothy), a minimum-wage daily
 * employee, a daily employee, a mid-salary monthly employee and one above the SSS /
 * PhilHealth ceilings. Rates are illustrative; edit them in the UI.
 *
 * Also creates one employee self-service login (Phase 9) for DEMO-0001 so the portal can be
 * tried at once: dorothy@example.com / Dorothy-Demo-2026 (must be changed at first sign-in).
 *
 * Skipped when SEED_DEMO_COMPANY=false (set that in production).
 */
import bcrypt from "bcryptjs";
import type { PrismaClient } from "../../src/generated/prisma/client";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function seedDemoCompany(prisma: PrismaClient) {
  if (process.env.SEED_DEMO_COMPANY === "false") {
    console.log("SEED_DEMO_COMPANY=false — skipping demo company.");
    return;
  }
  const existing = await prisma.company.findUnique({ where: { code: "DEMO" } });
  if (existing) {
    console.log("Demo company already exists — skipping.");
    const first = await prisma.employee.findFirst({
      where: { companyId: existing.id, employeeNo: "DEMO-0001" },
      select: { id: true },
    });
    if (first) await seedDemoLogin(prisma, existing.id, first.id);
    return;
  }

  const company = await prisma.company.create({
    data: {
      code: "DEMO",
      legalName: "Demo Company Inc.",
      tradeName: "Demo Co.",
      address: "2111 Elias St., Sta. Cruz, Manila",
      tin: "123456789000",
      payFrequency: "SEMI_MONTHLY",
      signatoryName: "Neriza Talahiban",
      signatoryTitle: "Payroll Officer",
      slipCodePrefix: "OMS",
      slipCodeNext: 15,
      employeeNoPrefix: "DEMO",
      employeeNoNext: 6,
      policies: { create: { effectiveFrom: d("2026-01-01") } },
      leaveTypes: {
        create: [
          {
            code: "VL",
            name: "Vacation leave",
            withPayDefault: true,
            annualCredits: "5",
            maxCarryover: "0",
          },
          {
            code: "SL",
            name: "Sick leave",
            withPayDefault: true,
            annualCredits: "5",
            maxCarryover: "0",
          },
          { code: "LWOP", name: "Leave without pay", withPayDefault: false, annualCredits: "0" },
        ],
      },
    },
  });

  const employees = [
    {
      employeeNo: "DEMO-0001",
      lastName: "Dela Cruz",
      firstName: "Dorothy",
      birthDate: d("1992-05-14"),
      hireDate: d("2023-02-01"),
      position: "Admin Assistant",
      department: "Administration",
      sssNo: "3412345678",
      philhealthNo: "123456789012",
      pagibigMid: "121234567890",
      tin: "123456789000",
      pay: {
        payType: "MONTHLY" as const,
        monthlyRate: "20000.00",
        dailyRate: null,
        isMinimumWageEarner: false,
      },
    },
    {
      employeeNo: "DEMO-0002",
      lastName: "Santos",
      firstName: "Juan",
      middleName: "Reyes",
      birthDate: d("1998-11-02"),
      hireDate: d("2024-06-16"),
      position: "Utility",
      department: "Operations",
      sssNo: "3498765432",
      philhealthNo: "234567890123",
      pagibigMid: "121234567891",
      tin: "234567890000",
      pay: {
        payType: "DAILY" as const,
        monthlyRate: null,
        dailyRate: "645.00",
        isMinimumWageEarner: true,
      },
    },
    {
      employeeNo: "DEMO-0003",
      lastName: "Reyes",
      firstName: "Maria",
      birthDate: d("1995-03-21"),
      hireDate: d("2022-09-01"),
      position: "Cashier",
      department: "Operations",
      sssNo: "3411122233",
      philhealthNo: "345678901234",
      pagibigMid: "121234567892",
      tin: "345678901000",
      pay: {
        payType: "DAILY" as const,
        monthlyRate: null,
        dailyRate: "700.00",
        isMinimumWageEarner: false,
      },
    },
    {
      employeeNo: "DEMO-0004",
      lastName: "Garcia",
      firstName: "Jose",
      middleName: "Luis",
      birthDate: d("1988-07-07"),
      hireDate: d("2020-01-15"),
      position: "Supervisor",
      department: "Operations",
      sssNo: "3455566677",
      philhealthNo: "456789012345",
      pagibigMid: "121234567893",
      tin: "456789012000",
      pay: {
        payType: "MONTHLY" as const,
        monthlyRate: "35000.00",
        dailyRate: null,
        isMinimumWageEarner: false,
      },
    },
    {
      employeeNo: "DEMO-0005",
      lastName: "Lim",
      firstName: "Ana",
      birthDate: d("1985-12-30"),
      hireDate: d("2019-04-01"),
      position: "General Manager",
      department: "Management",
      sssNo: "3499988877",
      philhealthNo: "567890123456",
      pagibigMid: "121234567894",
      tin: "567890123000",
      pay: {
        payType: "MONTHLY" as const,
        monthlyRate: "120000.00",
        dailyRate: null,
        isMinimumWageEarner: false,
      },
    },
  ];

  let firstEmployeeId: string | null = null;
  for (const e of employees) {
    const { pay, ...person } = e;
    const created = await prisma.employee.create({
      data: {
        companyId: company.id,
        ...person,
        status: "ACTIVE",
        taxStatus: "S",
        paySettings: {
          create: {
            companyId: company.id,
            effectiveFrom: d("2026-01-01"),
            payType: pay.payType,
            monthlyRate: pay.monthlyRate,
            dailyRate: pay.dailyRate,
            payFrequency: "SEMI_MONTHLY",
            isMinimumWageEarner: pay.isMinimumWageEarner,
            taxWithheld: !pay.isMinimumWageEarner,
          },
        },
      },
    });
    firstEmployeeId ??= created.id;
  }
  if (firstEmployeeId) await seedDemoLogin(prisma, company.id, firstEmployeeId);
  await prisma.auditLog.create({
    data: {
      entity: "Company",
      entityId: company.id,
      action: "CREATE",
      companyId: company.id,
      after: { code: "DEMO", seeded: true, employees: employees.length },
    },
  });
  console.log(`Created demo company DEMO with ${employees.length} employees.`);
}

/** The portal login for DEMO-0001 (Phase 9); idempotent, and skipped if the employee already has one. */
async function seedDemoLogin(prisma: PrismaClient, companyId: string, employeeId: string) {
  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: "dorothy@example.com" }, { employeeId }] },
    select: { id: true },
  });
  if (taken) return;
  const login = await prisma.user.create({
    data: {
      email: "dorothy@example.com",
      name: "Dorothy Dela Cruz",
      role: "EMPLOYEE",
      passwordHash: await bcrypt.hash("Dorothy-Demo-2026", 12),
      mustChangePassword: true,
      employeeId,
      companies: { create: { companyId } },
    },
  });
  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: login.id,
      action: "CREATE",
      companyId,
      after: { email: login.email, role: "EMPLOYEE", employeeNo: "DEMO-0001", seeded: true },
    },
  });
  console.log(
    "Created demo employee login dorothy@example.com (must change password at first sign-in).",
  );
}
