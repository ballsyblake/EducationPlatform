/**
 * First-run bootstrap for a deployed instance.
 *
 * Creates an ADMIN account for every address in ADMIN_EMAILS that doesn't
 * already have one. Unlike `db:seed` this adds no sample courses or coaches, so
 * it's safe to run on every boot — existing accounts are left untouched and
 * nothing is ever deleted.
 *
 *   ADMIN_EMAILS="head.coach@yourprogram.com" npm run bootstrap:admin
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.ts";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

async function main() {
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length) {
    console.log("[bootstrap] ADMIN_EMAILS is not set — no admin account created.");
    console.log("[bootstrap] Set it and redeploy, or nobody will be able to sign in.");
    return;
  }

  for (const email of emails) {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (!existing) {
      await prisma.user.create({ data: { email, role: "ADMIN", title: "Program Admin" } });
      console.log(`[bootstrap] Created admin ${email}`);
      continue;
    }

    // Re-enable and re-promote, so ADMIN_EMAILS is always a way back in.
    if (existing.role !== "ADMIN" || !existing.active) {
      await prisma.user.update({
        where: { email },
        data: { role: "ADMIN", active: true },
      });
      console.log(`[bootstrap] Restored admin access for ${email}`);
    } else {
      console.log(`[bootstrap] Admin ${email} already present`);
    }
  }
}

main()
  .catch((error) => {
    console.error("[bootstrap] Failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
