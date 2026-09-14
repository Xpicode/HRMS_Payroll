import { describe, expect, it } from "vitest";
import {
  csvRowToInputs,
  employeeSchema,
  formatGovId,
  governmentIdWarnings,
  paySettingSchema,
  recurringItemSchema,
} from "@/modules/employees/schema";

const base = {
  employeeNo: "",
  lastName: "Dela Cruz",
  firstName: "Dorothy",
  hireDate: "2026-01-16",
  status: "ACTIVE",
  sssNo: "34-1234567-8",
  philhealthNo: "12-345678901-2",
  pagibigMid: "1212-3456-7890",
  tin: "123-456-789-000",
  taxStatus: "S",
};

describe("employeeSchema", () => {
  it("normalises IDs to digits and blank employee no to null", () => {
    const r = employeeSchema.parse(base);
    expect(r.employeeNo).toBeNull();
    expect(r.sssNo).toBe("3412345678");
    expect(r.philhealthNo).toBe("123456789012");
    expect(r.pagibigMid).toBe("121234567890");
    expect(r.tin).toBe("123456789000");
  });
  it("requires a separation date when separated and orders dates", () => {
    expect(employeeSchema.safeParse({ ...base, status: "SEPARATED" }).success).toBe(false);
    expect(
      employeeSchema.safeParse({ ...base, status: "SEPARATED", separationDate: "2025-12-31" })
        .success,
    ).toBe(false);
    expect(
      employeeSchema.safeParse({ ...base, status: "SEPARATED", separationDate: "2026-06-30" })
        .success,
    ).toBe(true);
    expect(employeeSchema.safeParse({ ...base, birthDate: "2026-02-01" }).success).toBe(false);
  });
  it("warns on unusual ID lengths instead of blocking", () => {
    const r = employeeSchema.parse({ ...base, sssNo: "123", tin: "1234567890123" });
    const w = governmentIdWarnings(r);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/SSS number .* 3 digits; expected 10 digits/);
    expect(governmentIdWarnings(employeeSchema.parse(base))).toEqual([]);
  });
  it("formats IDs for display", () => {
    expect(formatGovId("sssNo", "3412345678")).toBe("34-1234567-8");
    expect(formatGovId("philhealthNo", "123456789012")).toBe("12-345678901-2");
    expect(formatGovId("pagibigMid", "121234567890")).toBe("1212-3456-7890");
    expect(formatGovId("tin", "123456789000")).toBe("123-456-789-000");
    expect(formatGovId("tin", "123456789")).toBe("123-456-789");
    expect(formatGovId("sssNo", "123")).toBe("123");
  });
});

describe("paySettingSchema", () => {
  const pay = {
    effectiveFrom: "2026-01-16",
    payType: "MONTHLY",
    monthlyRate: "20000.00",
    dailyRate: "",
    payFrequency: "SEMI_MONTHLY",
    sssCovered: "on",
    philhealthCovered: "on",
    pagibigCovered: "on",
    taxWithheld: "on",
  };
  it("requires the rate matching the pay type", () => {
    expect(paySettingSchema.safeParse(pay).success).toBe(true);
    expect(paySettingSchema.safeParse({ ...pay, monthlyRate: "" }).success).toBe(false);
    expect(paySettingSchema.safeParse({ ...pay, payType: "DAILY" }).success).toBe(false);
    expect(paySettingSchema.safeParse({ ...pay, payType: "DAILY", dailyRate: "645" }).success).toBe(
      true,
    );
    expect(
      paySettingSchema.safeParse({ ...pay, payType: "COMMISSION", monthlyRate: "" }).success,
    ).toBe(true);
  });
  it("keeps rates as strings and reads checkboxes", () => {
    const r = paySettingSchema.parse(pay);
    expect(r.monthlyRate).toBe("20000.00");
    expect(r.isMinimumWageEarner).toBe(false);
    expect(r.sssCovered).toBe(true);
  });
});

describe("recurringItemSchema", () => {
  it("validates code, amount and date order", () => {
    expect(
      recurringItemSchema.safeParse({
        componentCode: "ALLOWANCE",
        amount: "500",
        effectiveFrom: "2026-01-01",
      }).success,
    ).toBe(true);
    expect(
      recurringItemSchema.safeParse({
        componentCode: "BONUS",
        amount: "500",
        effectiveFrom: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      recurringItemSchema.safeParse({
        componentCode: "ALLOWANCE",
        amount: "0",
        effectiveFrom: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      recurringItemSchema.safeParse({
        componentCode: "ALLOWANCE",
        amount: "5",
        effectiveFrom: "2026-02-01",
        effectiveTo: "2026-01-01",
      }).success,
    ).toBe(false);
  });
});

describe("csvRowToInputs", () => {
  it("maps snake_case cells, defaults and Y/N booleans", () => {
    const r = csvRowToInputs(
      {
        last_name: "Santos",
        first_name: "Juan",
        hire_date: "2026-01-01",
        pay_type: "daily",
        daily_rate: "645",
        is_minimum_wage_earner: "Y",
        sss_covered: "",
      },
      { payFrequency: "SEMI_MONTHLY" },
    );
    expect(r.errors).toEqual([]);
    expect(r.employee.status).toBe("ACTIVE");
    expect(r.pay.payType).toBe("DAILY");
    expect(r.pay.effectiveFrom).toBe("2026-01-01");
    expect(r.pay.isMinimumWageEarner).toBe("true");
    expect(r.pay.sssCovered).toBe("true");
    expect(r.pay.payFrequency).toBe("SEMI_MONTHLY");
    expect(paySettingSchema.safeParse(r.pay).success).toBe(true);
    expect(employeeSchema.safeParse(r.employee).success).toBe(true);
  });
  it("reports bad boolean cells", () => {
    const r = csvRowToInputs(
      {
        last_name: "A",
        first_name: "B",
        hire_date: "2026-01-01",
        pay_type: "DAILY",
        daily_rate: "1",
        tax_withheld: "maybe",
      },
      { payFrequency: "MONTHLY" },
    );
    expect(r.errors).toEqual(["tax_withheld: use Y or N"]);
  });
});
