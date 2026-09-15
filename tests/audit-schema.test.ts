import { describe, expect, it } from "vitest";
import { auditFilterSchema, manilaDayStart, parseFilter } from "@/modules/audit/schema";

describe("audit filter", () => {
  it("treats blanks as no filter and defaults the page", () => {
    const f = auditFilterSchema.parse({ userId: "", entity: "", from: "", page: "" });
    expect(f).toEqual({ page: 1 });
  });
  it("accepts a full filter", () => {
    const f = auditFilterSchema.parse({
      userId: "01a09ebb-8f8a-7769-8d9f-1533a24933a9",
      companyId: "01a09ebb-8f97-74d0-a9dd-4b64fc361071",
      entity: "Payslip",
      action: "UPDATE",
      entityId: "abc",
      from: "2026-09-01",
      to: "2026-09-30",
      page: "3",
    });
    expect(f.page).toBe(3);
    expect(f.from).toBe("2026-09-01");
  });
  it("rejects an inverted date range and a bad uuid", () => {
    expect(auditFilterSchema.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success).toBe(
      false,
    );
    expect(auditFilterSchema.safeParse({ userId: "not-a-uuid" }).success).toBe(false);
  });
  it("parseFilter drops only the invalid fields from a hand-edited URL", () => {
    const f = parseFilter({ userId: "junk", entity: "User", page: "2", from: ["2026-01-01"] });
    expect(f).toEqual({ entity: "User", page: 2, from: "2026-01-01" });
    expect(parseFilter({ page: "0", to: "yesterday" })).toEqual({ page: 1 });
  });
  it("Manila day start is 16:00 UTC the day before", () => {
    expect(manilaDayStart("2026-09-15").toISOString()).toBe("2026-09-14T16:00:00.000Z");
  });
});
