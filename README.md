# HRMS Payroll

Multi-company HRMS and Philippine payroll for Upright. Internal users only; employees do not log in.
Plan: [docs/hrms-build-plan.md](docs/hrms-build-plan.md). Rules: [AGENTS.md](AGENTS.md).

Status: **Phase 1** (Phase 0 foundation + employees: 201 records, effective-dated pay settings, recurring items, CSV import).

## Run locally from a fresh clone

Prerequisites: Docker Desktop (with Compose v2). Nothing else is needed for the Docker route.

```bash
git clone <repo> "HRMS Payroll" && cd "HRMS Payroll"
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up
```

First start takes a few minutes (base image, dependency install). Then:

1. Open http://localhost:8080 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. You are asked to set a new password (the seeded one is temporary).
3. Administration → Companies → New company. Create your companies, upload logos, review the payroll policy.
4. Administration → Users → New user. Assign companies to payroll officers and encoders.

The database volume (`hrms_pgdata`) and uploads (`hrms_data`) persist across restarts. `docker compose down -v` wipes them.

### Host development (optional, faster reloads)

Requires Node 22+ and pnpm 11 (`npm i -g pnpm@11`).

```bash
docker compose up db -d          # Postgres only, bound to 127.0.0.1:5433 (POSTGRES_HOST_PORT)
pnpm install
pnpm db:migrate                  # applies migrations (creates one if the schema changed)
pnpm db:seed
pnpm dev                         # http://localhost:8080
```

## Scripts

| Script                                   | What it does                                              |
| ---------------------------------------- | --------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev server / production build / production server |
| `pnpm typecheck`                         | Prisma generate + Next typegen + `tsc --noEmit`           |
| `pnpm lint` / `pnpm format`              | ESLint / Prettier                                         |
| `pnpm test`                              | Vitest unit tests                                         |
| `pnpm db:migrate`                        | `prisma migrate dev` (creates + applies a migration)      |
| `pnpm db:migrate:deploy`                 | Apply existing migrations (used by Docker)                |
| `pnpm db:seed`                           | Idempotent seed: first admin + 2026 national holidays     |
| `pnpm db:reset`                          | Drop, re-migrate and re-seed the database                 |
| `pnpm audit`                             | Dependency vulnerability audit                            |

## Layout

```
src/app/                 routes (thin; call module actions/services)
  (auth)/login
  app/                   everything behind login
    (global)/companies, users, account   admin + account screens
    [companyId]/         dashboard, employees (list, 201 form, pay settings, recurring items, CSV import), holidays, settings
  api/auth, api/files    Auth.js handlers, scoped file serving
src/modules/<feature>/   schema.ts (Zod) · service.ts (rules) · repo.ts (scoped Prisma) · actions.ts · components/
src/lib/                 db, scope, session, audit, env, dates, money, csv, password, rate-limit, storage
prisma/                  schema, migrations, seed/
tests/                   Vitest
docker/                  dev image + entrypoint
```

## Security model (Phase 0)

- **Authentication**: Auth.js credentials + bcrypt (cost 12). JWT session, 8 h absolute, secure/httpOnly cookie.
  Login is rate-limited per IP, accounts lock after 10 failures for 15 min, and every attempt is audited.
  Password policy: 12+ chars, letter + digit, not containing the email name. New/reset passwords must be changed at first login.
  A password change revokes every existing session for that user.
- **Authorization**: roles `ADMIN`, `PAYROLL_OFFICER`, `ENCODER` (`src/lib/permissions.ts`). Company membership via `user_companies`.
  Every tenant query goes through `scoped()` (`src/lib/scope.ts`), which injects `company_id IN (…)` and refuses unscoped
  unique lookups. Pages return **404** for companies the user is not assigned to, so ids are not enumerable.
- **Uploads**: logos are validated by content (sharp), re-encoded to PNG, stored under `DATA_DIR`, and served only through
  `/api/files/logos/:companyId` after a scope check. Nothing under `DATA_DIR` is public.
- **Headers**: CSP, HSTS (prod), `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies (`next.config.ts`).
- **Audit**: append-only `audit_logs` with actor, ip, before/after (secrets redacted). No update/delete path exists in the app.
- **Secrets**: only in `.env` (git-ignored). `.env.example` documents every variable.

## Employees (Phase 1)

- **Employee numbers** come from a per-company series (prefix + counter + digits, editable in Company settings). Leave the
  number blank to auto-assign; a typed number is used as-is and must be unique in the company.
- **Government IDs** are stored as digits only. SSS (10), PhilHealth (12), Pag-IBIG MID (12) and TIN (9–12) lengths are
  checked as warnings: the form asks for confirmation instead of blocking, because real records carry odd numbers.
- **Pay settings** are effective-dated history; rows are never edited. The row in force on a date is the latest one on or
  before it. Daily/hourly rates for monthly employees are derived from the company policy (working days per year, hours per day).
- **Recurring items** are fixed allowances/deductions with an effective range; codes match the Phase 3 pay components.
- **CSV import**: Employees → Import CSV → download the template → upload → review the preview (errors block, warnings do
  not) → import. All-or-nothing; each employee is created with an initial pay setting and audited.

## Conventions worth knowing

- Money and rates are `Decimal` in the database and strings/`decimal.js` in code — never JS numbers.
- Calendar dates are `date` columns; use `toDateOnly` / `toIsoDate` from `src/lib/dates.ts`. Timezone is Asia/Manila.
- Statutory tables and multipliers are data with effective dates, never constants in code.
- Approved payslips (Phase 4+) are immutable snapshots.
