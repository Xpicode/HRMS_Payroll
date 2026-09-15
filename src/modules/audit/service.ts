import "server-only";
import type { Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import * as repo from "./repo";
import { AUDIT_PAGE_SIZE, type AuditFilter } from "./schema";

export { AUDIT_PAGE_SIZE, auditFilterSchema, parseFilter, type AuditFilter } from "./schema";
export type { AuditRow } from "./repo";

export type AuditPage = {
  rows: repo.AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function listAudit(scope: Scope, filter: AuditFilter): Promise<AuditPage> {
  assertPermission(scope, "audit.view");
  const [{ rows, hasMore }, total] = await Promise.all([repo.listPage(filter), repo.count(filter)]);
  return { rows, total, page: filter.page, pageSize: AUDIT_PAGE_SIZE, hasMore };
}

export async function filterOptions(scope: Scope) {
  assertPermission(scope, "audit.view");
  const [entities, actions, users, companies] = await Promise.all([
    repo.distinctEntities(),
    repo.distinctActions(),
    repo.listUsersForFilter(),
    repo.listCompaniesForFilter(),
  ]);
  return { entities, actions, users, companies };
}
