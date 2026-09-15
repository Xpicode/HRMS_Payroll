import { describe, expect, it } from "vitest";
import {
  applyScope,
  canAccessCompany,
  ScopeRuleError,
  TENANT_MODELS,
  type Scope,
} from "@/lib/scope-rules";

const A = "0199a1b2-0000-7000-8000-00000000000a";
const B = "0199a1b2-0000-7000-8000-00000000000b";

const officer: Scope = { userId: "u1", role: "PAYROLL_OFFICER", companyIds: [A] };
const admin: Scope = { userId: "u0", role: "ADMIN", companyIds: null };

describe("canAccessCompany", () => {
  it("admin can access anything", () => {
    expect(canAccessCompany(admin, B)).toBe(true);
  });
  it("officer only their companies", () => {
    expect(canAccessCompany(officer, A)).toBe(true);
    expect(canAccessCompany(officer, B)).toBe(false);
  });
});

describe("applyScope reads", () => {
  it("passes non-tenant models through untouched", () => {
    const args = { where: { email: "x" } };
    expect(applyScope("User", "findMany", args, officer)).toBe(args);
  });

  it("adds companyId IN filter for strict models", () => {
    const out = applyScope(
      "CompanyPayrollPolicy",
      "findMany",
      { where: { companyId: B } },
      officer,
    ) as {
      where: { AND: unknown[] };
    };
    expect(out.where.AND).toEqual([{ companyId: { in: [A] } }]);
  });

  it("keeps existing AND clauses", () => {
    const out = applyScope(
      "CompanyPayrollPolicy",
      "findFirst",
      { where: { AND: [{ id: "x" }] } },
      officer,
    ) as {
      where: { AND: unknown[] };
    };
    expect(out.where.AND).toHaveLength(2);
  });

  it("admits national (null) rows for sharedNull models", () => {
    const out = applyScope("Holiday", "findMany", {}, officer) as { where: { AND: unknown[] } };
    expect(out.where.AND).toEqual([{ OR: [{ companyId: null }, { companyId: { in: [A] } }] }]);
  });

  it("filters the Company table on id", () => {
    const out = applyScope("Company", "findMany", undefined, officer) as {
      where: { AND: unknown[] };
    };
    expect(out.where.AND).toEqual([{ id: { in: [A] } }]);
  });

  it("admin reads are unfiltered", () => {
    const args = { where: { id: B } };
    expect(applyScope("Company", "findFirst", args, admin)).toEqual(args);
  });
});

describe("applyScope writes", () => {
  it("scopes updates so other companies' rows are not found", () => {
    const out = applyScope(
      "Holiday",
      "update",
      { where: { id: "h1" }, data: { name: "x" } },
      officer,
    ) as {
      where: { id: string; AND: unknown[] };
    };
    expect(out.where.id).toBe("h1");
    expect(out.where.AND).toEqual([{ companyId: { in: [A] } }]);
  });

  it("does not let officers write national holiday rows (no null in write filter)", () => {
    const out = applyScope("Holiday", "delete", { where: { id: "h1" } }, officer) as {
      where: { AND: unknown[] };
    };
    expect(JSON.stringify(out.where.AND)).not.toContain("null");
  });
});

describe("applyScope creates", () => {
  it("allows creating inside scope", () => {
    expect(() =>
      applyScope("Holiday", "create", { data: { companyId: A, name: "x" } }, officer),
    ).not.toThrow();
  });
  it("rejects creating for another company", () => {
    expect(() => applyScope("Holiday", "create", { data: { companyId: B } }, officer)).toThrow(
      ScopeRuleError,
    );
  });
  it("rejects nested connect to another company", () => {
    expect(() =>
      applyScope(
        "CompanyPayrollPolicy",
        "create",
        { data: { company: { connect: { id: B } } } },
        officer,
      ),
    ).toThrow(ScopeRuleError);
  });
  it("rejects national rows for non-admins", () => {
    expect(() => applyScope("Holiday", "create", { data: { companyId: null } }, officer)).toThrow(
      ScopeRuleError,
    );
  });
  it("rejects createMany with any bad row", () => {
    expect(() =>
      applyScope("Holiday", "createMany", { data: [{ companyId: A }, { companyId: B }] }, officer),
    ).toThrow(ScopeRuleError);
  });
  it("only admins create companies", () => {
    expect(() => applyScope("Company", "create", { data: { code: "X" } }, officer)).toThrow(
      ScopeRuleError,
    );
    expect(() => applyScope("Company", "create", { data: { code: "X" } }, admin)).not.toThrow();
  });
});

describe("refused operations", () => {
  for (const op of ["findUnique", "findUniqueOrThrow", "upsert"]) {
    it(`${op} is refused on tenant models for everyone`, () => {
      expect(() => applyScope("Holiday", op, { where: { id: "x" } }, admin)).toThrow(
        ScopeRuleError,
      );
      expect(() => applyScope("Holiday", op, { where: { id: "x" } }, officer)).toThrow(
        ScopeRuleError,
      );
    });
  }
  it("unknown operations on tenant models are refused for scoped users", () => {
    expect(() => applyScope("Holiday", "somethingNew", {}, officer)).toThrow(ScopeRuleError);
  });
});

describe("TENANT_MODELS", () => {
  it("lists every model with a company_id", () => {
    expect(Object.keys(TENANT_MODELS).sort()).toEqual([
      "Company",
      "CompanyPayrollPolicy",
      "DailyTimeRecord",
      "Employee",
      "EmployeeDocument",
      "EmployeePaySetting",
      "EmployeeRecurringItem",
      "Holiday",
      "Job",
      "LeaveBalance",
      "LeaveRequest",
      "LeaveType",
      "Loan",
      "LoanPayment",
      "PayPeriod",
      "PayrollAdjustment",
      "Payslip",
      "PayslipLine",
      "UserCompany",
    ]);
  });
});
