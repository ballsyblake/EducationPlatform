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
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";

const prisma = new PrismaClient({ adapter: createAdapter() });

const INVITE_TTL_DAYS = Number(process.env.INVITE_LINK_TTL_DAYS ?? 7);

/**
 * Mints a sign-in link the same way the app does. Duplicated rather than
 * imported because src/lib/auth.ts is "server-only" and can't load here.
 */
async function issueSignInLink(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.loginToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.loginToken.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    },
  });
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/auth/verify?token=${token}`;
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
      // A brand-new instance has no mail server yet, so the only way in is a
      // link printed here for whoever is watching the deploy.
      const user = await prisma.user.create({
        data: { email, role: "ADMIN", title: "Program Admin" },
      });
      const link = await issueSignInLink(user.id);
      console.log(`[bootstrap] Created admin ${email}`);
      console.log("[bootstrap] ---------------------------------------------");
      console.log("[bootstrap]  Open this link to sign in as the first admin:");
      console.log(`[bootstrap]  ${link}`);
      console.log(`[bootstrap]  Works once, valid for ${INVITE_TTL_DAYS} days.`);
      console.log("[bootstrap] ---------------------------------------------");
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

    // Without a mail server, an admin who never got in — or whose link expired
    // before they used it — has no way to ask for another. Print one whenever
    // they have no live session, so a redeploy is always a route back in.
    const [liveSession, liveToken] = await Promise.all([
      prisma.session.findFirst({ where: { userId: existing.id, expiresAt: { gt: new Date() } } }),
      prisma.loginToken.findFirst({
        where: { userId: existing.id, usedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

    if (!liveSession && !liveToken) {
      const link = await issueSignInLink(existing.id);
      console.log("[bootstrap] ---------------------------------------------");
      console.log(`[bootstrap]  ${email} has no active session. Sign in with:`);
      console.log(`[bootstrap]  ${link}`);
      console.log(`[bootstrap]  Works once, valid for ${INVITE_TTL_DAYS} days.`);
      console.log("[bootstrap] ---------------------------------------------");
    }
  }
}

main()
  .catch((error) => {
    console.error("[bootstrap] Failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
