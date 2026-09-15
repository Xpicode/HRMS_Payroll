# HRMS Payroll

Multi-company HRMS and Philippine payroll for Upright. Internal users only; employees do not log in.
Plan: [docs/hrms-build-plan.md](docs/hrms-build-plan.md). Rules: [AGENTS.md](AGENTS.md).

Status: **Phase 5** (foundation, employees, attendance incl. DTR card scanning, payroll engine, pay-period lifecycle with immutable approved payslips, loans, payslip PDFs and printing).

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
| `pnpm test:integration`                  | Lifecycle tests against the Postgres in `DATABASE_URL`    |
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
    [companyId]/         dashboard, employees, attendance (cutoff overview, per-employee DTR grid, biometrics import), holidays, settings
  api/auth, api/files    Auth.js handlers, scoped file serving
src/modules/<feature>/   schema.ts (Zod) · service.ts (rules) · repo.ts (scoped Prisma) · actions.ts · components/
src/modules/documents/  payslip template, PDF renderer (Playwright), jobs queue + worker
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

## Attendance (Phase 2)

- **Cutoffs** follow the company pay frequency: semi-monthly 1–15 and 16–end, or monthly. `cutoffFor` in
  `src/lib/dates.ts` is the single source of those boundaries; pages refuse arbitrary date ranges.
- **Day type** defaults per employee per day: holiday calendar (company row beats national; regular beats special) >
  the employee's rest day (from the pay setting in force) > REGULAR. It can be overridden per day in the grid.
- **Per-day arithmetic** (`src/modules/attendance/compute.ts`, pure): time in/out derive hours, late (after the policy
  grace), undertime and suggested OT/night differential using the employee's shift and unpaid break; direct hours are
  used when there are no punches; nothing typed on a scheduled day is an absence. Typed OT / night-diff override the suggestion.
- **Cutoff summary** (`summary.ts`, pure; type in `types.ts`) is what the payroll engine reads: days worked, hours and
  OT by day type (REGULAR, REST_DAY, SPECIAL, REGULAR_HOLIDAY), absences (unrecorded scheduled days count), lates,
  undertime, night diff, and regular holidays worked / not worked.
- **Biometrics import**: CSV with employee_no, date, time_in, time_out (several date and time formats accepted; multiple
  punches on a day are merged). Preview shows the computed figures and errors; imported days replace manual ones.
- **DTR card scan** (Attendance → Scan DTR cards): photograph or scan a paper bundy card (e.g. Ideaworks Model 9000:
  day rows, Morning / Afternoon / Overtime In-Out). OCR runs inside the app (`tesseract.js` WASM + the pinned
  `@tesseract.js-data/eng` model — no cloud, no CDN, works offline). The browser downsizes the photo, the server
  validates it with sharp, reads it in memory and discards it; nothing is stored. `card-layout.ts` (pure, tested)
  finds the printed day numbers, fits the row pitch, assigns each printed time to its day and resolves AM/PM
  chronologically (758 → 1203 → 1258 → 502 = 07:58 → 17:02). The result prefills the normal DTR grid with the
  card image and detected boxes beside it; amber rows need a look (odd punch count, low confidence, off-row).
  Saving stores the rows with source `SCAN`, audited like a manual save. Limits: one side of the card per photo
  (1–15 or 16–31), photo flat and straight, no night shifts crossing midnight; you pick the employee (names are
  not read).

## Payroll engine and calculator (Phase 3)

- **Statutory tables are rows, not code**: `sss_tables` (61 brackets, MSC ₱5,000–₱35,000, WISP split out above
  ₱20,000, EC ₱10/₱30), `philhealth_rules` (5%, ₱10,000–₱100,000), `pagibig_rules` (2%/2% on up to ₱10,000; 1% EE at
  ≤ ₱1,500) and `tax_brackets` (BIR table effective 2023, semi-monthly and monthly), each with `effective_from`.
  Figures and their sources are in `prisma/seed/statutory-2026.ts`; a correction is a new row with a later date.
  `pay_components` is the payslip line catalogue in display order.
- **Engine** (`src/modules/payroll/engine/`, pure, decimal.js): `deriveRates` (monthly → daily via the policy divisor,
  daily → monthly basic the same way, hourly = daily / hours per day), `computeBasic`, `computeHolidayPay`,
  `computeOvertime` (policy multipliers + night differential), `computeLateUndertime`, `computeSss`,
  `computePhilhealth`, `computePagibig`, `periodShare` (statutory timing: 1st / 2nd / split),
  `computeWithholdingTax`, `applyLoans`, and `computePayslip`, which runs them in the plan's order: earnings →
  contributions on the monthly basic → taxable income (taxable earnings − lates/undertime − employee contributions) →
  tax → loans and other deductions → totals. Every line is rounded half-up to 2 decimals; totals are sums of rounded
  lines; a negative net is flagged, never clamped.
- **Rules the engine assumes** (owner to confirm against the Excel): daily employees are paid regular days worked plus
  100% for unworked regular holidays, 200% × hours for worked regular holidays and 130% × hours for rest-day /
  special-day work; monthly employees get half the monthly rate less absences at the derived daily rate, nothing extra
  for unworked holidays (already in the monthly pay), the premium only (100% / 30%) for holiday / special-day work and
  130% for rest-day work; loans amortize half the monthly amount per semi-monthly cutoff, capped at the balance.
- **Worked examples** in `tests/payroll-engine/` (daily-rate, monthly, minimum-wage, SSS loan, SSS ceiling, negative
  net) keep the expected figures in a table at the top of each file and run against the seeded tables.
- **Payroll calculator** (Payroll → Calculator, ADMIN and PAYROLL_OFFICER): employee + cutoff → the Phase 2 attendance
  summary, the pay setting and policy in force on the cutoff end, overlapping recurring items and the statutory
  tables → lines and totals in payslip order, plus basis, attendance and employer-share panels. Nothing is saved.

## Pay periods, payslips and loans (Phase 4)

- **Lifecycle** (Payroll → period): `DRAFT` → **Compute** → `COMPUTED` → **Approve** → `APPROVED` → **Release**
  (on/after the pay date) → `RELEASED` → **Lock** → `LOCKED`. Every transition is audited. Periods are generated per
  company cutoff (next one, or a chosen month/half) with an editable pay date.
- **Compute** runs the engine for every employee hired by the coverage end who is ACTIVE (or separated inside the
  period): attendance summary + pay setting and policy in force on the coverage end + recurring items + active loans
  - manual adjustments → `payslips` + `payslip_lines`. Allowed any number of times while below APPROVED; employees who
    drop out lose their payslip, manual adjustments are re-merged.
- **Adjustments** (payslip page): a manual earning or deduction with a reason; saved in `payroll_adjustments` and that
  employee alone is recomputed. Manual lines are marked on the payslip.
- **Approve** assigns slip codes from the company counter (`prefix-NNN`, ordered by employee name, only to payslips
  without one), freezes a `snapshot` on each payslip (employee, IDs, company header and signatory, pay setting, policy
  version, statutory table versions, the full engine input and output, loan payments) and posts `loan_payments`,
  decrementing balances. `PAYROLL_OFFICER` may approve unless the policy flag _Payroll officers may approve_ is off;
  `ADMIN` always may.
- **Immutability**: once a period is APPROVED, RELEASED or LOCKED the repo layer refuses every payslip/line write
  (`ImmutablePayslipError`) and database triggers (`payslip_immutable`, `payslip_line_immutable`,
  `pay_period_no_delete_when_frozen`) refuse them for any client. The only allowed write on a frozen payslip is its PDF
  path (Phase 5). Changing an employee's rate afterwards changes nothing on the approved payslip.
- **Revert** (ADMIN only, reason required, audited): APPROVED/RELEASED → COMPUTED, loan payments deleted and balances
  restored, snapshots cleared; slip codes stay with their payslips and are reused on re-approval. LOCKED cannot be
  reverted.
- **Loans** (Employee → Loans): SSS loan, Pag-IBIG loan, cash advance or other, with principal, amortization **per pay
  period**, start date and balance. Deducted from the first period whose coverage ends on/after the start date; never
  more than the balance; a loan turns `PAID` at zero and can be `CANCELLED`. Balances move only on approve/revert.
- **Tests**: `pnpm test` covers the engine and schemas; `pnpm test:integration` runs the whole lifecycle (compute →
  adjust → recompute → approve → edits refused by service and trigger → rate change → revert → re-approve → release →
  lock) against the real database with a throw-away company.

## Payslip PDFs and printing (Phase 5)

- **Template** (`src/modules/documents/templates/PayslipPage.tsx`): static HTML reproducing the Excel form — two
  identical copies per page (EMPLOYEE COPY / ADMIN COPY), logo + address, PAYSLIP / Confidential box, name + slip
  code, ID rows, pay date / pay type, coverage, daily rate / days / OT, earnings, the fixed deduction rows, the DOLE
  footnote, net salary, Prepared by / Received by. Data comes from `payslip-data.ts`, a pure mapping of the frozen
  **snapshot + lines**; unapproved payslips render from the working copy with a DRAFT watermark. Withholding tax gets
  its own row only when non-zero (it is not on the Excel form); cash advances and manual deductions roll into "Others".
- **Paper**: Letter or A4, landscape or portrait, per company (Company settings → Payslip paper). The print CSS sets
  `@page` and breaks after each employee.
- **Rendering** (`pdf.ts`): Playwright Chromium, one browser per process, renders serialised; `renderHtmlToPdf` and
  `renderBatch` (all employees, one page each). The Docker image already ships Chromium; on a host run Playwright's
  browsers must be installed (`pnpm exec playwright install chromium`) or point `PLAYWRIGHT_CHROMIUM_PATH` at one.
- **Jobs**: the `jobs` table (type, payload, status, attempts, progress, error) and `POST /api/jobs/run` guarded by
  `JOBS_TOKEN` (constant-time compare). The compose `jobs` sidecar calls it every minute; the app also runs due jobs
  right after queuing one, so PDFs usually exist within seconds of approval. Failed jobs retry up to 3 times.
- **`GENERATE_PAYSLIP_PDFS(periodId)`** writes `DATA_DIR/payslips/{companyId}/{periodId}/{slipCode}.pdf` and
  `_batch.pdf`, records `pdf_path` on each payslip (the one write allowed on a frozen payslip) and shows progress on the
  period page. Queued automatically on Approve. Below APPROVED, _Generate draft PDFs_ / _Regenerate drafts_ rewrite
  the files (named by employee number, watermarked); once approved the final files are written once and never
  regenerated — reprint always serves the stored file.
- **Buttons** (period page): Preview (live HTML, identical markup to the PDF, any status), Print all (a bare page that
  embeds `_batch.pdf` and opens the print dialog), Download all, per-row PDF.
- **Access**: PDFs and previews are served only by `/api/files/payslips/{companyId}/{periodId}/…` after the session,
  `payroll.view` and company-scope checks; file names are validated against a strict pattern; nothing under `DATA_DIR`
  is public. A user scoped to company A gets 404 for company B's files.

## Conventions worth knowing

- Money and rates are `Decimal` in the database and strings/`decimal.js` in code — never JS numbers.
- Calendar dates are `date` columns; use `toDateOnly` / `toIsoDate` from `src/lib/dates.ts`. Timezone is Asia/Manila.
- Statutory tables and multipliers are data with effective dates, never constants in code.
- Approved payslips are immutable snapshots (repo guard + database triggers).
