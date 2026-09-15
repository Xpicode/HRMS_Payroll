import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Scope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { healthReport } from "@/lib/health";
import { filterOptions, listAudit, parseFilter } from "@/modules/audit/service";

/**
 * Phase 8: the audit viewer filters (user, company, entity, action, entity id, Manila dates,
 * paging) against real rows, ADMIN-only access, and the health report against the live database
 * and DATA_DIR.
 */
const TAG = `AUD${Date.now().toString(36).toUpperCase().slice(-5)}`;
let companyId = "";
let adminId = "";
let officerId = "";
let admin: Scope;
let officer: Scope;

beforeAll(async () => {
  const [a, o] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-a@example.com`,
        name: "A",
        passwordHash: "x",
        role: "ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-o@example.com`,
        name: "O",
        passwordHash: "x",
        role: "PAYROLL_OFFICER",
      },
    }),
  ]);
  adminId = a.id;
  officerId = o.id;
  admin = { userId: adminId, role: "ADMIN", companyIds: null, ip: "10.0.0.1" };
  officer = { userId: officerId, role: "PAYROLL_OFFICER", companyIds: [], ip: null };
  const company = await prisma.company.create({
    data: {
      code: TAG,
      legalName: `${TAG} Audit Co.`,
      address: "x",
      payFrequency: "SEMI_MONTHLY",
      signatoryName: "S",
      signatoryTitle: "T",
      slipCodePrefix: TAG,
      employeeNoPrefix: TAG,
    },
  });
  companyId = company.id;

  // Rows at controlled instants: two on 10 Sep (Manila), one on 11 Sep, by two actors.
  await audit(
    `${TAG}Thing`,
    "t-1",
    "CREATE",
    null,
    { password: "secret", name: "one" },
    { scope: admin, companyId },
  );
  await audit(
    `${TAG}Thing`,
    "t-1",
    "UPDATE",
    { name: "one" },
    { name: "two" },
    { scope: admin, companyId },
  );
  await audit(`${TAG}Other`, "o-1", "DELETE", { x: 1 }, null, { scope: officer, companyId });
  const ids = await prisma.auditLog.findMany({
    where: { entity: { startsWith: TAG } },
    orderBy: { id: "asc" },
    select: { id: true, action: true },
  });
  const at = (action: string, iso: string) =>
    prisma.auditLog.update({
      where: { id: ids.find((r) => r.action === action)!.id },
      data: { at: new Date(iso) },
    });
  await at("CREATE", "2026-09-10T01:00:00+08:00");
  await at("UPDATE", "2026-09-10T23:30:00+08:00");
  await at("DELETE", "2026-09-11T00:30:00+08:00");
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: { startsWith: TAG } } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.$disconnect();
});

describe("audit viewer", () => {
  it("is ADMIN only", async () => {
    await expect(listAudit(officer, parseFilter({}))).rejects.toThrow(/permission/);
    await expect(filterOptions(officer)).rejects.toThrow(/permission/);
  });

  it("filters by company, entity, action, user and entity id", async () => {
    const byCompany = await listAudit(admin, parseFilter({ companyId }));
    expect(byCompany.total).toBe(3);
    expect(byCompany.rows.map((r) => r.action)).toEqual(["DELETE", "UPDATE", "CREATE"]); // newest first

    const byEntity = await listAudit(admin, parseFilter({ companyId, entity: `${TAG}Thing` }));
    expect(byEntity.total).toBe(2);

    const byAction = await listAudit(admin, parseFilter({ companyId, action: "DELETE" }));
    expect(byAction.rows.map((r) => r.entityId)).toEqual(["o-1"]);
    expect(byAction.rows[0]!.user?.id).toBe(officerId);

    const byUser = await listAudit(admin, parseFilter({ companyId, userId: adminId }));
    expect(byUser.total).toBe(2);
    expect(byUser.rows.every((r) => r.ip === "10.0.0.1")).toBe(true);

    const byId = await listAudit(admin, parseFilter({ companyId, entityId: "T-1" }));
    expect(byId.total).toBe(2); // case-insensitive contains
  });

  it("date filters are inclusive Manila calendar days", async () => {
    const sep10 = await listAudit(
      admin,
      parseFilter({ companyId, from: "2026-09-10", to: "2026-09-10" }),
    );
    expect(sep10.rows.map((r) => r.action)).toEqual(["UPDATE", "CREATE"]);
    const from11 = await listAudit(admin, parseFilter({ companyId, from: "2026-09-11" }));
    expect(from11.rows.map((r) => r.action)).toEqual(["DELETE"]);
    const inverted = await listAudit(
      admin,
      parseFilter({ companyId, from: "2026-09-12", to: "2026-09-10" }),
    );
    expect(inverted.total).toBe(3); // invalid range dropped, not an error
  });

  it("redacts secrets and pages", async () => {
    const page = await listAudit(admin, parseFilter({ companyId, action: "CREATE" }));
    expect((page.rows[0]!.after as { password: string }).password).toBe("[redacted]");
    const far = await listAudit(admin, parseFilter({ companyId, page: "5" }));
    expect(far.rows).toEqual([]);
    expect(far.hasMore).toBe(false);
    expect(far.total).toBe(3);
  });

  it("offers filter options that include the new entity and both users", async () => {
    const o = await filterOptions(admin);
    expect(o.entities).toContain(`${TAG}Thing`);
    expect(o.actions).toEqual(expect.arrayContaining(["CREATE", "UPDATE", "DELETE"]));
    expect(o.users.map((u) => u.id)).toEqual(expect.arrayContaining([adminId, officerId]));
    expect(o.companies.map((c) => c.id)).toContain(companyId);
  });
});

describe("health report", () => {
  it("passes against the live database and a writable DATA_DIR", async () => {
    const r = await healthReport();
    expect(r.status).toBe("ok");
    expect(r.checks.db.ok).toBe(true);
    expect(r.checks.storage.ok).toBe(true);
    expect(r.checks.db.ms).toBeGreaterThanOrEqual(0);
    expect(typeof r.version).toBe("string");
    // no configuration leaks
    expect(JSON.stringify(r)).not.toMatch(/postgres|DATABASE_URL|\/data|C:\\\\/i);
  });
});
