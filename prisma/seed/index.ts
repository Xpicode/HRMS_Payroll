/**
 * Idempotent seed: first ADMIN (from .env) + 2026 national holidays.
 * Run with `pnpm db:seed`. Safe to re-run; it never overwrites an existing admin's password.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { HOLIDAYS_2026 } from "./holidays-2026";
import { seedDemoCompany } from "./demo-company";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "System Administrator";
  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists — leaving password untouched.`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role: "ADMIN", isActive: true, mustChangePassword: true },
  });
  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: user.id,
      action: "CREATE",
      after: { email, role: "ADMIN", seeded: true },
    },
  });
  console.log(`Created ADMIN ${email} (must change password at first login).`);
}

async function seedHolidays() {
  let created = 0;
  for (const h of HOLIDAYS_2026) {
    const date = dateOnly(h.date);
    const exists = await prisma.holiday.findFirst({ where: { companyId: null, date } });
    if (exists) continue;
    await prisma.holiday.create({ data: { companyId: null, date, name: h.name, type: h.type } });
    created++;
  }
  console.log(
    `National holidays 2026: ${created} created, ${HOLIDAYS_2026.length - created} already present.`,
  );
}

async function main() {
  await seedAdmin();
  await seedHolidays();
  await seedDemoCompany(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
