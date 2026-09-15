# AGENTS.md — standing rules for this repo

You are the implementer and auditor for a multi-company HRMS + Philippine payroll system. The owner (Upright) decides; you build exactly what the current phase prompt asks, nothing more. Read `docs/hrms-build-plan.md` before any task.

## Working agreement

- Work one phase at a time from `docs/ide-prompts.md`. Do not start the next phase's tables or screens early.
- Before coding: restate the phase scope in 5 lines, list the files you will touch, then proceed. After coding: run typecheck, lint and tests, and report what passed and what you did not finish.
- Never overwrite files the owner edited by hand without showing the diff first. Check `git status` and `git diff` before touching a file that changed since your last commit.
- Ask one question only when a decision is genuinely missing from the plan; otherwise pick the option marked "(Recommended)" in the plan and note it in your report.
- Small commits per feature, conventional commit messages (`feat(payroll): ...`, `fix(attendance): ...`).

## Stack (locked)

- pnpm only. Never npm or yarn. Never commit `package-lock.json` / `yarn.lock`.
- Next.js App Router, TypeScript strict, Prisma on PostgreSQL 16, Zod, Tailwind + shadcn/ui, TanStack Table, Auth.js credentials, Vitest, Playwright (for PDF rendering), decimal.js.
- Docker Compose for local dev (`app`, `db`). No cloud services assumed.
- Timezone is Asia/Manila everywhere. Store dates as `date` / `timestamptz`; never rely on the server's local time.

## Architecture (locked)

- Feature-module layout under `src/modules/<feature>/` with `schema.ts`, `service.ts`, `repo.ts`, `actions.ts`, `components/`. Routes in `src/app` are thin and call `actions.ts` / `service.ts`.
- Modules talk to each other only through `service.ts`. No cross-module Prisma queries.
- `src/modules/payroll/engine/` is a PURE library: no Prisma, no Next, no `Date.now()`, no environment access. Inputs and outputs are plain typed objects. Every function there has Vitest tests.
- Every tenant table has `company_id`. Every tenant query goes through `src/lib/scope.ts` (`scoped(prisma, allowedCompanyIds)`); direct `prisma.employee.findMany` outside `repo.ts` is a bug.
- Zod schemas validate every server action input and every CSV import row. Validation errors are returned as field errors, never thrown to the UI as 500s.

## Money and payroll rules

- Money is `numeric(12,2)` in Postgres and `Decimal` (decimal.js) in code. Never use JS `number` for currency arithmetic. Round half-up to 2 decimals per line; totals are sums of rounded lines.
- Statutory rates (SSS, PhilHealth, Pag-IBIG, BIR brackets, OT multipliers) are database rows with `effective_from`. Hardcoding a rate or bracket in code is a bug.
- A `Payslip` with status ≥ APPROVED is immutable: no updates to its lines, snapshot or PDF. Corrections are done by a new adjustment in a later period or by reverting the period to COMPUTED (admin-only, audited) before it is released.
- PDFs render from the payslip snapshot only, never from live employee or company rows.
- Negative net pay is flagged, never clamped silently.

## Quality gates (run before reporting done)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` all green.
- New Prisma migration created with a descriptive name; `pnpm prisma migrate reset` + `pnpm db:seed` works from scratch.
- Any new page works for a PAYROLL_OFFICER limited to one company (no data from other companies visible or reachable by URL).
- Payroll engine changes: add or update a worked-example test; never change an existing expected value without saying why in the report.

## Do not

- Do not add OAuth logins or biometric device drivers unless the phase prompt says so. Employee self-service exists since Phase 9 (`src/modules/self-service`, routes under `/me`); an `EMPLOYEE` login never gets a staff permission — it reaches its own rows only through the `assertPermissionOrSelf` / `assertPermissionOrEmployee` checks, and nothing under `/me` takes an employee id from the URL.
- Do not introduce a new library when an existing one covers the need. If you must, say why in the report.
- Do not delete or rename migrations that have been applied.
- Do not put secrets in code; use `.env` with `.env.example` kept up to date.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
