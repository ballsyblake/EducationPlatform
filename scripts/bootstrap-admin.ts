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
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.ts";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

const scrypt = promisify(scryptCallback) as (p: string, s: Buffer, k: number) => Promise<Buffer>;

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return ["scrypt", salt.toString("hex"), derived.toString("hex")].join(":");
}

const WORDS = ["blitz", "wedge", "audible", "gauntlet", "sideline", "playbook", "huddle", "counter"];

function generateTempPassword() {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${pick()}-${digits}`;
}

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
      // A brand-new instance has no email configured yet, so print a starting
      // password to the deploy logs — it's the only way into a fresh install.
      const password = generateTempPassword();
      await prisma.user.create({
        data: {
          email,
          role: "ADMIN",
          title: "Program Admin",
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
        },
      });
      console.log(`[bootstrap] Created admin ${email}`);
      console.log(`[bootstrap] ---------------------------------------------`);
      console.log(`[bootstrap]  Sign in with:  ${email}`);
      console.log(`[bootstrap]  Password:      ${password}`);
      console.log(`[bootstrap]  You'll be asked to change it immediately.`);
      console.log(`[bootstrap] ---------------------------------------------`);
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
