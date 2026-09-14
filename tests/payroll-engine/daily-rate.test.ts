import { describe, expect, it } from "vitest";
import { computePayslip } from "@/modules/payroll/engine";
import { amountOf, COMPONENTS, paySetting, PERIOD_2ND, POLICY, summary, TABLES } from "./fixtures";

/**
 * Daily-rate employee (Dela Cruz payslip template), 16–31 Aug 2026, 2nd cutoff.
 * Daily rate ₱700.00 → hourly 87.50; monthly basic for contributions 700 × 313 / 12 = 18,258.33.
 * Attendance: 10 regular days worked, 1 absence, 31 Aug (RH) not worked, Sun 23 Aug worked 8 h + 2 h OT,
 *             2 h regular-day OT, 25 min late, 30 min undertime.
 *
 * | Line                          | Basis                                   |    Amount |
 * |-------------------------------|-----------------------------------------|----------:|
 * | Basic pay                     | 700.00 × 10 days                        |  7,000.00 |
 * | Regular holiday (not worked)  | 1 × 700.00                              |    700.00 |
 * | Rest day worked               | 8 h × 87.50 × 1.30                      |    910.00 |
 * | Overtime (regular day)        | 2 h × 87.50 × 1.25                      |    218.75 |
 * | Overtime (rest day)           | 2 h × 87.50 × 1.69                      |    295.75 |
 * | GROSS                         |                                         |  9,124.50 |
 * | Lates / undertime             | 55 min × 87.50 / 60                     |     80.21 |
 * | SSS                           | MSC 18,500 × 5% (2nd cutoff)            |    925.00 |
 * | Pag-IBIG                      | 10,000 × 2%                             |    200.00 |
 * | PhilHealth                    | 18,258.33 × 5% = 912.92 ÷ 2             |    456.46 |
 * | Withholding tax               | taxable 7,462.83 < 10,417               |      0.00 |
 * | TOTAL DEDUCTIONS              |                                         |  1,661.67 |
 * | NET PAY                       |                                         |  7,462.83 |
 */
describe("worked example: daily-rate employee", () => {
  const input = {
    paySetting: paySetting({ payType: "DAILY", dailyRate: "700.00" }),
    policy: POLICY,
    summary: summary({
      daysWorked: 11,
      daysWorkedByType: { REGULAR: 10, REST_DAY: 1, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      hoursWorkedByType: { REGULAR: 80, REST_DAY: 8, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      absentDays: 1,
      lateMinutes: 25,
      undertimeMinutes: 30,
      otHoursByType: { REGULAR: 2, REST_DAY: 2, SPECIAL: 0, REGULAR_HOLIDAY: 0 },
      otHours: 4,
      regularHolidaysNotWorked: 1,
    }),
    period: PERIOD_2ND,
    tables: TABLES,
    components: COMPONENTS,
    recurring: [],
    loans: [],
  };
  const r = computePayslip(input);

  it("derives the rates", () => {
    expect(r.rates).toEqual({ monthlyBasic: "18258.33", dailyRate: "700.00", hourlyRate: "87.50" });
  });

  it("earnings", () => {
    expect(amountOf(r, "BASIC")).toBe("7000.00");
    expect(r.lines.find((l) => l.label === "Regular holiday (not worked)")?.amount).toBe("700.00");
    expect(r.lines.find((l) => l.label === "Rest day worked")?.amount).toBe("910.00");
    expect(r.lines.find((l) => l.label === "Overtime (regular day)")?.amount).toBe("218.75");
    expect(r.lines.find((l) => l.label === "Overtime (rest day)")?.amount).toBe("295.75");
    expect(r.gross).toBe("9124.50");
  });

  it("deductions", () => {
    expect(amountOf(r, "LATE_UT")).toBe("80.21");
    expect(amountOf(r, "SSS_EE")).toBe("925.00");
    expect(amountOf(r, "HDMF_EE")).toBe("200.00");
    expect(amountOf(r, "PHIC_EE")).toBe("456.46");
    expect(amountOf(r, "WTAX")).toBe("0.00");
    expect(r.taxableIncome).toBe("7462.83");
    expect(r.totalDeductions).toBe("1661.67");
  });

  it("net and flags", () => {
    expect(r.net).toBe("7462.83");
    expect(r.flags).toEqual([]);
  });

  it("orders lines as on the payslip", () => {
    expect(r.lines.map((l) => l.componentCode)).toEqual([
      "BASIC",
      "HOLIDAY_PAY",
      "HOLIDAY_PAY",
      "OT",
      "OT",
      "LATE_UT",
      "SSS_EE",
      "HDMF_EE",
      "PHIC_EE",
    ]);
  });

  it("takes no statutory deductions in the 1st cutoff under SECOND_CUTOFF timing", () => {
    const first = computePayslip({
      ...input,
      period: { ...PERIOD_2ND, start: "2026-08-01", end: "2026-08-15", sequenceInMonth: 1 },
    });
    expect(amountOf(first, "SSS_EE")).toBe("0.00");
    expect(amountOf(first, "PHIC_EE")).toBe("0.00");
    expect(amountOf(first, "HDMF_EE")).toBe("0.00");
    expect(first.net).toBe("9044.29"); // 9,124.50 − 80.21
  });
});
