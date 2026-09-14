import { describe, expect, it } from "vitest";
import { companySchema, holidaySchema, policySchema } from "@/modules/companies/schema";
import { createUserSchema, loginSchema } from "@/modules/auth/schema";
import { fieldErrorsFromZod } from "@/lib/action-result";

describe("companySchema", () => {
  const valid = {
    code: "ups",
    legalName: "Upright Systems Inc.",
    tradeName: "",
    address: "2111 Elias St., Sta. Cruz, Manila",
    tin: "",
    sssEmployerNo: "",
    philhealthEmployerNo: "",
    pagibigEmployerNo: "",
    payFrequency: "SEMI_MONTHLY",
    signatoryName: "Neriza Talahiban",
    signatoryTitle: "Payroll Officer",
    slipCodePrefix: "oms",
    slipCodeNext: "15",
    slipCodePad: "3",
  };
  it("normalises code/prefix to uppercase and blanks to null", () => {
    const r = companySchema.parse(valid);
    expect(r.code).toBe("UPS");
    expect(r.slipCodePrefix).toBe("OMS");
    expect(r.tradeName).toBeNull();
    expect(r.slipCodeNext).toBe(15);
  });
  it("rejects bad codes and reports field errors", () => {
    const r = companySchema.safeParse({ ...valid, code: "a b", tin: "12x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fe = fieldErrorsFromZod(r.error);
      expect(fe.code).toBeDefined();
      expect(fe.tin).toBeDefined();
    }
  });
});

describe("policySchema", () => {
  it("keeps decimals as strings", () => {
    const r = policySchema.parse({
      effectiveFrom: "2026-01-01",
      workingDaysPerYear: "313",
      hoursPerDay: "8",
      otRegular: "1.25",
      otRestDay: "1.30",
      otRestDayExcess: "1.69",
      otRegularHoliday: "2.00",
      otRegularHolidayExcess: "2.60",
      nightDiffRate: "0.10",
      statutoryTiming: "SPLIT",
      lateGraceMinutes: "5",
    });
    expect(r.otRegular).toBe("1.25");
    expect(typeof r.otRegular).toBe("string");
    expect(r.lateGraceMinutes).toBe(5);
  });
  it("rejects invalid dates and out-of-range multipliers", () => {
    expect(policySchema.safeParse({ effectiveFrom: "2026-02-30" }).success).toBe(false);
    const r = policySchema.safeParse({
      effectiveFrom: "2026-01-01",
      workingDaysPerYear: 313,
      hoursPerDay: "8",
      otRegular: "9.99",
      otRestDay: "1.3",
      otRestDayExcess: "1.69",
      otRegularHoliday: "2",
      otRegularHolidayExcess: "2.6",
      nightDiffRate: "0.1",
      statutoryTiming: "SPLIT",
      lateGraceMinutes: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("holidaySchema", () => {
  it("defaults level to COMPANY", () => {
    expect(
      holidaySchema.parse({
        date: "2026-12-24",
        name: "Christmas Eve",
        type: "SPECIAL_NON_WORKING",
      }).level,
    ).toBe("COMPANY");
  });
});

describe("auth schemas", () => {
  it("lowercases emails", () => {
    expect(loginSchema.parse({ email: "Admin@Example.COM", password: "x" }).email).toBe(
      "admin@example.com",
    );
  });
  it("applies the password policy and normalises company ids", () => {
    const base = { email: "a@b.co", name: "Ana", role: "ENCODER", companyIds: undefined };
    expect(createUserSchema.safeParse({ ...base, password: "tooshort1" }).success).toBe(false);
    const ok = createUserSchema.safeParse({ ...base, password: "Long-Enough-Pass-1" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.companyIds).toEqual([]);
    const one = createUserSchema.parse({
      ...base,
      password: "Long-Enough-Pass-1",
      companyIds: "0199a1b2-0000-7000-8000-00000000000a",
    });
    expect(one.companyIds).toHaveLength(1);
  });
});
