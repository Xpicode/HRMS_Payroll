import { describe, expect, it } from "vitest";
import { dailyFromMonthly, formatMoney, hourlyFromDaily, isMoneyString, round2 } from "@/lib/money";
import { csvSafeCell, parseCsv, toCsv } from "@/lib/csv";

describe("money", () => {
  it("rounds half-up to 2 decimals", () => {
    expect(round2("1.005").toString()).toBe("1.01");
    expect(round2("1.004").toFixed(2)).toBe("1.00");
    expect(round2("2.5").toFixed(2)).toBe("2.50");
  });
  it("formats with thousands separators and a blank marker", () => {
    expect(formatMoney("1234.5")).toBe("1,234.50");
    expect(formatMoney(null)).toBe("-");
    expect(formatMoney(undefined, "")).toBe("");
  });
  it("derives daily and hourly rates like the payroll sheet", () => {
    // 20,000 x 12 / 313 = 766.77
    expect(dailyFromMonthly("20000", 313).toFixed(2)).toBe("766.77");
    // 645 / 8 = 80.63 (80.625 rounds half-up)
    expect(hourlyFromDaily("645", "8").toFixed(2)).toBe("80.63");
    expect(() => dailyFromMonthly("1", 0)).toThrow();
  });
  it("validates money strings", () => {
    expect(isMoneyString("645")).toBe(true);
    expect(isMoneyString("645.5")).toBe(true);
    expect(isMoneyString("1,000")).toBe(false);
    expect(isMoneyString("-5")).toBe(false);
    expect(isMoneyString("1.234")).toBe(false);
  });
});

describe("csv", () => {
  it("parses quoted fields, CRLF and BOM, normalising headers", () => {
    const r = parseCsv(
      '﻿Last Name,first_name,Note\r\n"Dela Cruz, Jr.",Dorothy,"He said ""hi"""\r\nSantos,Juan,\r\n',
    );
    expect(r.headers).toEqual(["last_name", "first_name", "note"]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({
      last_name: "Dela Cruz, Jr.",
      first_name: "Dorothy",
      note: 'He said "hi"',
    });
    expect(r.rows[1]!.note).toBe("");
  });
  it("skips blank lines and enforces limits", () => {
    expect(parseCsv("a,b\n\n1,2\n\n").rows).toHaveLength(1);
    expect(() => parseCsv("a,b\n1,2\n3,4\n", { maxRows: 1 })).toThrow(/Too many rows/);
    expect(() => parseCsv("")).toThrow(/empty/);
    expect(() => parseCsv('a\n"unterminated')).toThrow(/Unterminated/);
    expect(() => parseCsv("a,a\n1,2")).toThrow(/Duplicate/);
  });
  it("neutralises formula injection on export", () => {
    expect(csvSafeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvSafeCell("+1")).toBe("'+1");
    expect(csvSafeCell("Dorothy")).toBe("Dorothy");
    const out = toCsv(["name", "formula"], [["Dela Cruz, Dorothy", "=cmd"]]);
    expect(out).toBe('name,formula\r\n"Dela Cruz, Dorothy",\'=cmd\r\n');
  });
});
