# Deployment guide

How to run HRMS Payroll in production on either target from the build plan: a **Synology NAS with
Container Manager** or a **Linux VPS**. Part 1 is common to both; pick Part 2A or 2B for the host; Part 3
covers day-to-day operation (updates, backups, restore, monitoring).

The stack is three containers from `docker-compose.prod.yml`:

| Service | Image                                           | Role                                                                      |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `app`   | `hrms-payroll` (built from `docker/Dockerfile`) | Next.js server + Chromium for PDFs; runs migrations and the seed at start |
| `db`    | `postgres:16-alpine`                            | database; never published on a port                                       |
| `jobs`  | `curlimages/curl`                               | calls `POST /api/jobs/run` every minute (PDFs, emails, leave roll-over)   |

State lives in two volumes: `/data` in `app` (logos, 201 attachments, payslip PDFs) and the Postgres data
directory. Everything else is disposable and rebuilt from the image.

The app listens on plain HTTP on `127.0.0.1:8080` (change with `APP_BIND` / `APP_PORT`) and **must** sit behind a
reverse proxy that terminates HTTPS. Cookies are `Secure`, HSTS is sent, and the CSP upgrades insecure requests
once `AUTH_URL` starts with `https://`.

---

## Part 1 — Common preparation

### 1.1 Requirements

- Docker Engine 24+ with Compose v2 (`docker compose version`). Synology: Container Manager package (DSM 7.2+).
- 2 vCPU, 4 GB RAM (the app container is capped at 2 GB by default: `APP_MEM_LIMIT`), 20 GB disk plus room
  for backups. Chromium needs `/dev/shm`; the compose file gives it 512 MB.
- A DNS name pointing at the host, e.g. `payroll.example.com`, and TCP 443 reachable from the users' network
  (LAN-only is fine; a public DNS name still works for the certificate if you use DNS validation).
- Outbound SMTP access from the host if payslip email will be used.

### 1.2 Get the code and configure `.env`

```bash
git clone <repo> hrms && cd hrms
cp .env.example .env
```

Edit `.env`. Production values that matter:

| Variable                                          | Value                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                               | long random string (`openssl rand -base64 24`). Used by both `db` and `app`.                                                             |
| `AUTH_SECRET`                                     | `openssl rand -base64 32`. Changing it signs everyone out.                                                                               |
| `AUTH_URL`                                        | the public URL, e.g. `https://payroll.example.com` — **https**, no trailing slash. Required.                                             |
| `JOBS_TOKEN`                                      | `openssl rand -hex 24`. Shared with the `jobs` sidecar only.                                                                             |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`                  | the first administrator (seeded once; must change password at first login). Remove `ADMIN_PASSWORD` from `.env` after the first sign-in. |
| `SEED_DEMO_COMPANY`                               | `false`                                                                                                                                  |
| `SESSION_MAX_AGE_SECONDS`, `SESSION_IDLE_SECONDS` | absolute (default 8 h) and idle (default 2 h) session limits                                                                             |
| `SMTP_*`                                          | fill in to enable payslip email; leave `SMTP_HOST` empty to keep it off                                                                  |
| `APP_BIND`, `APP_PORT`                            | where the proxy reaches the app; keep `127.0.0.1` unless the proxy runs elsewhere                                                        |
| `HRMS_DATA_PATH`, `HRMS_PGDATA_PATH`              | optional host folders for bind mounts instead of named volumes (Synology: set both)                                                      |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS`                  | where `scripts/backup.sh` writes and how long it keeps files                                                                             |

`DATABASE_URL`, `DATA_DIR` and `NODE_ENV` in `.env` are for host development; the compose file overrides them
inside the containers.

### 1.3 Build the image

```bash
docker compose -f docker-compose.prod.yml build --build-arg APP_VERSION=$(git rev-parse --short HEAD)
```

The first build downloads the Playwright base image (~2 GB) and takes several minutes; later builds reuse the
layers. To build elsewhere and ship the image, `docker save hrms-payroll:latest | gzip > hrms.tar.gz`, copy, then
`docker load` on the host and set `APP_IMAGE` in `.env` if you tag it differently.

### 1.4 First start and seed

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f app
```

The entrypoint fixes `/data` ownership, runs `prisma migrate deploy`, runs the idempotent seed (first admin,
2026 national holidays, statutory tables, pay components) and starts the server. You should see
`Starting HRMS Payroll <version> on :8080 as pwuser`, then `curl -fs http://127.0.0.1:8080/api/health`
returns `{"status":"ok", ...}`.

Sign in at the public URL with `ADMIN_EMAIL` / `ADMIN_PASSWORD`; you are forced to set a new password. Then
create companies and users. Afterwards blank out `ADMIN_PASSWORD` in `.env` (the seed never touches an
existing admin, so it is no longer needed).

Tip: to keep the same compose file for every command, `export COMPOSE_FILE=docker-compose.prod.yml` in the
shell (or put `COMPOSE_FILE=docker-compose.prod.yml` in `.env`); the backup and restore scripts read it too.

---

## Part 2A — Synology NAS (Container Manager)

Tested layout: `/volume1/docker/hrms` holds the repository, `.env`, `data/`, `pgdata/` and `backups/`.

1. **Folders.** In File Station create `docker/hrms`. Copy the repository there (git clone over SSH, or upload a
   zip). Create sub-folders `data`, `pgdata`, `backups`.
2. **`.env`.** As in 1.2, plus:

   ```
   HRMS_DATA_PATH=/volume1/docker/hrms/data
   HRMS_PGDATA_PATH=/volume1/docker/hrms/pgdata
   BACKUP_DIR=/volume1/docker/hrms/backups
   APP_BIND=127.0.0.1
   APP_PORT=8080
   ```

3. **Build the image over SSH** (Container Manager's UI cannot run a multi-stage build with a large context reliably):
   enable SSH in Control Panel → Terminal, then

   ```bash
   ssh admin@nas
   cd /volume1/docker/hrms
   sudo docker compose -f docker-compose.prod.yml build
   ```

4. **Create the project.** Container Manager → Project → Create. Project name `hrms`, path
   `/volume1/docker/hrms`, source "Use existing docker-compose.yml" and select `docker-compose.prod.yml`. Do not
   let it start yet if it offers a web portal wizard — skip that; the reverse proxy is set up in the next step.
   Start the project. Check the `app` container log for `Starting HRMS Payroll`.

   Alternatively run everything from SSH exactly as in Part 1 (`sudo docker compose -f docker-compose.prod.yml up -d`);
   Container Manager shows the containers either way.

5. **HTTPS certificate.** Control Panel → Security → Certificate → Add → Let's Encrypt, domain
   `payroll.example.com` (needs port 80 reachable from the internet during issuance, or use a wildcard via DNS
   with your registrar's DDNS/DNS integration). A certificate from your own CA works too.
6. **Reverse proxy.** Control Panel → Login Portal → Advanced → Reverse Proxy → Create:
   - Source: `HTTPS`, hostname `payroll.example.com`, port `443`, enable HSTS.
   - Destination: `HTTP`, hostname `localhost`, port `8080`.
   - Custom Header → Create → Custom Header: `X-Forwarded-For` = `$proxy_add_x_forwarded_for` and
     `X-Real-IP` = `$remote_addr`, so the audit log records client addresses. (WebSocket headers are not needed.)
   - Certificate: Control Panel → Security → Certificate → Settings → map `payroll.example.com` to the new cert.
7. **Firewall.** Control Panel → Security → Firewall: allow 443 from the office network only (and 22 for
   admin). Port 8080 is bound to 127.0.0.1, so it is not reachable from the LAN anyway.
8. **Backups on a schedule.** Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script,
   user `root`, daily at 02:00:

   ```bash
   cd /volume1/docker/hrms && COMPOSE_FILE=docker-compose.prod.yml bash scripts/backup.sh >> backups/backup.log 2>&1
   ```

   Then use Hyper Backup to copy `/volume1/docker/hrms/backups` off the NAS (another NAS, USB, or C2/S3).

9. **DSM updates** restart Docker; `restart: unless-stopped` brings the stack back. After a DSM major upgrade
   confirm `docker compose version` still reports v2.

---

## Part 2B — Linux VPS (Ubuntu 22.04 / 24.04)

1. **Server prep.**

   ```bash
   sudo apt update && sudo apt install -y ca-certificates curl git ufw
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
   ```

   Create a non-root deploy user, disable SSH password login, keep the OS on unattended-upgrades.

2. **Code and `.env`** as in 1.2, in `/opt/hrms` for example. Named volumes are fine here (leave
   `HRMS_DATA_PATH` / `HRMS_PGDATA_PATH` unset); `BACKUP_DIR=/opt/hrms/backups`.

3. **Reverse proxy with automatic HTTPS (Caddy).** `docker/Caddyfile` is ready; run Caddy as a fourth
   container with the overlay file:

   ```bash
   export COMPOSE_FILE=docker-compose.prod.yml:docker-compose.caddy.yml
   export SITE_ADDRESS=payroll.example.com      # or put SITE_ADDRESS in .env
   docker compose build --build-arg APP_VERSION=$(git rev-parse --short HEAD)
   docker compose up -d
   ```

   Caddy obtains and renews a Let's Encrypt certificate for `SITE_ADDRESS` (ports 80/443 must reach the VPS),
   forwards to `app:8080` with `X-Forwarded-For` set, and adds nothing else — the security headers come from the
   app. To restrict access to an office IP range add a `@office remote_ip 203.0.113.0/24` matcher in the
   Caddyfile.

   Using nginx or an existing proxy instead: proxy `https://payroll.example.com` → `http://127.0.0.1:8080`,
   pass `Host`, `X-Forwarded-For` and `X-Forwarded-Proto https`, allow request bodies up to 12 MB
   (`client_max_body_size 12m`, for 201 attachments) and a 300 s read timeout for long job runs.

4. **Backups on a schedule.** `sudo crontab -e`:

   ```
   0 2 * * * cd /opt/hrms && COMPOSE_FILE=docker-compose.prod.yml bash scripts/backup.sh >> /opt/hrms/backups/backup.log 2>&1
   ```

   Copy `/opt/hrms/backups` off the machine (rclone to object storage, or the provider's snapshot feature —
   snapshots alone are not a backup of a running database; the dump is).

---

## Part 3 — Operating

### 3.1 Updating to a new version

```bash
cd <install dir>
git pull
docker compose -f docker-compose.prod.yml build --build-arg APP_VERSION=$(git rev-parse --short HEAD)
bash scripts/backup.sh                       # always before a migration
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f app   # watch "Applying database migrations"
```

Migrations are forward-only. If an upgrade fails, restore the backup taken above (3.3) and re-deploy the
previous image (`git checkout <previous tag>` and rebuild, or `docker tag` the old image back to `hrms-payroll:latest`).

### 3.2 Backup

`bash scripts/backup.sh` (or `pnpm backup` on a dev machine) writes two files into `BACKUP_DIR`:

- `hrms-db-<stamp>.sql.gz` — `pg_dump` of the database through the `db` container;
- `hrms-data-<stamp>.tgz` — everything under `/data` from the `app` container.

Files older than `BACKUP_KEEP_DAYS` are deleted. The two files of one stamp belong together: payslip rows
reference the PDF files by path. Keep a copy off the host.

### 3.3 Restore

```bash
cd <install dir>
COMPOSE_FILE=docker-compose.prod.yml bash scripts/restore.sh backups/hrms-db-<stamp>.sql.gz backups/hrms-data-<stamp>.tgz
```

The script stops `app` and `jobs`, terminates other sessions, **drops and re-creates** the database, loads
the dump, **replaces** `/data` from the tarball, and starts the services again. It asks you to type the
database name (set `RESTORE_CONFIRM=yes` for scripted use). On a new machine: complete Part 1 up to and
including the first `up -d` (the entrypoint creates the schema), then run the restore — the stored payslip
PDFs come back byte-for-byte, because approved PDFs are files, never re-rendered.

Verified procedure (Phase 8 acceptance): a backup of the development stack restored into a fresh production
stack (empty volumes) produced identical SHA-256 hashes for every stored payslip PDF, and the restored app
served the same bytes.

### 3.4 Monitoring

- `GET /api/health` (no auth) → `200 {"status":"ok","checks":{"db":{...},"storage":{...}},"version":...}` or
  `503` with `"status":"degraded"`. Docker's `HEALTHCHECK` uses it; point an uptime monitor at it as well.
- `docker compose ps` shows `healthy`; `docker compose logs app` for application errors (Prisma logs only
  errors in production).
- Failed logins, lockouts and every data change are in Administration → Audit log.

### 3.5 Security checklist

- `AUTH_URL` is https; the certificate is valid; port 8080 and 5432 are not reachable from the network.
- `.env` is `chmod 600`, owned by the deploy user; not in git.
- `ADMIN_PASSWORD` removed from `.env` after first sign-in; every account has changed its temporary password.
- Backups run daily and are copied off-host; a restore has been rehearsed (3.3).
- Host OS and Docker updated; DSM/VPS firewall limits 443 to the office network where possible.
- `SMTP_PASS` is an app-specific password with send-only rights.

### 3.6 Sizing

Measured on the development PC (Windows, Node 24, Postgres in Docker): a 200-employee period computes in
about 2 s, approves in about 1 s, and renders 200 payslip PDFs plus the batch file in about 60 s. Rendering
is serialised through one Chromium; a 2-vCPU container should expect roughly the same or somewhat slower.
