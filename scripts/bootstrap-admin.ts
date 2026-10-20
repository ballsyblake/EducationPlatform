/**
 * First-run bootstrap for a deployed instance.
 *
 * Creates an ADMIN account for every address in ADMIN_EMAILS that doesn't
 * already have one. Unlike `db:seed` this adds no sample courses or coaches, so
 * it's safe to run on every boot — existing accounts are left untouched and
 * nothing is ever deleted.
 *
 *   ADMIN_EMAILS="head.coach@yourprogram.com" npm run bootstrap:admin
 *
 * Locked out? Set ADMIN_LINK=1 in the environment and redeploy. That issues a
 * fresh sign-in link whatever the session state says, and emails it — see the
 * note on `liveSession` below for why the default is silence, and on
 * `PRINT_TOKEN` for why the link is no longer written to the log.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { isDevMailMode, sendMail } from "../src/lib/mailer.ts";

const INVITE_TTL_DAYS = Number(process.env.INVITE_LINK_TTL_DAYS ?? 7);

/**
 * Print a sign-in link even for an admin the database thinks is signed in.
 *
 * The way back in on a host with no shell. A session row lives for sixty idle
 * days, so an admin who cleared their cookies, lost the laptop or signed in
 * from a browser they no longer have stays locked out for two months while
 * every redeploy cheerfully reports "has an active session; no link needed."
 * The check answers "does a session row exist" when the question that matters
 * is "can this person get in", and only they know the answer.
 *
 * `ADMIN_LINK=reset` also ends those sessions. Reach for it when the device is
 * gone rather than merely forgotten — a session nobody can reach is not a
 * session worth keeping alive.
 */
const LINK_ASKED = (process.env.ADMIN_LINK ?? "").trim().toLowerCase();
const FORCE_LINK = LINK_ASKED === "1" || LINK_ASKED === "yes" || LINK_ASKED === "true" ||
  LINK_ASKED === "reset" || LINK_ASKED === "print";
const RESET_SESSIONS = LINK_ASKED === "reset";

/**
 * `ADMIN_LINK=print` is the only thing that puts a token in the deploy log.
 *
 * A sign-in link is a credential that needs no password, and a deploy log is
 * read by anyone with the host's dashboard and copied into chats and tickets
 * when something breaks — which is exactly what happened to one of these. So
 * the link is emailed and only the fact of it is logged; printing the token is
 * something you now ask for by name, and a token printed that way should be
 * treated as spent the moment the build finishes.
 */
const PRINT_TOKEN = LINK_ASKED === "print";

/**
 * Mints a sign-in link the same way the app does. Duplicated rather than
 * imported because src/lib/auth.ts is "server-only" and can't load here.
 */
async function issueSignInLink(prisma: PrismaClient, userId: string) {
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
  // Mirrors appUrl() in src/lib/auth.ts — Render injects RENDER_EXTERNAL_URL,
  // so the very first deploy prints a link that actually works.
  const base = (
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}/auth/verify?token=${token}`;
}

/**
 * Gets a freshly minted link to the one person allowed to use it.
 *
 * `intro` is the line that explains why they are being sent one; it is logged,
 * the link is not. Failure here is reported and never fatal — a bootstrap that
 * aborts because SMTP is down takes the whole deploy with it, and the admin
 * account itself is already in place by this point.
 */
async function deliverLink(email: string, link: string, intro: string) {
  console.log(`[bootstrap] ${intro}`);

  if (PRINT_TOKEN) {
    console.log("[bootstrap] ---------------------------------------------");
    console.log(`[bootstrap]  ${link}`);
    console.log(`[bootstrap]  Works once, valid for ${INVITE_TTL_DAYS} days.`);
    console.log("[bootstrap]  ADMIN_LINK=print — that token is now in this log.");
    console.log("[bootstrap]  Sign in, then remove ADMIN_LINK from the environment.");
    console.log("[bootstrap] ---------------------------------------------");
    return;
  }

  if (isDevMailMode()) {
    // No SMTP server configured, and nobody asked for the token in the log, so
    // there is no channel for it that isn't the log. It stays undelivered
    // rather than leaked by default; the link is in the database, and the next
    // one issued retires it.
    console.log(`[bootstrap] No SMTP server is configured, so the link was not sent.`);
    console.log("[bootstrap] Set SMTP_HOST (with SMTP_USER and SMTP_PASSWORD) to have it emailed,");
    console.log("[bootstrap] or ADMIN_LINK=print to accept printing the token to this log.");
    return;
  }

  try {
    await sendMail({
      to: email,
      subject: "Your Coach Education sign-in link",
      text: [
        "Open this link to sign in:",
        "",
        link,
        "",
        `It works once and is valid for ${INVITE_TTL_DAYS} days. It replaces any`,
        "earlier link for this account.",
        "",
        "If you didn't ask for this, somebody redeployed the service with",
        "ADMIN_LINK set. Nothing has changed about your account.",
      ].join("\n"),
    });
    console.log(`[bootstrap] Link emailed to ${email}; works once, valid for ${INVITE_TTL_DAYS} days.`);
  } catch (error) {
    console.log(
      `[bootstrap] Emailing the link to ${email} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log("[bootstrap] Fix SMTP, or set ADMIN_LINK=print to have the token printed here instead.");
  }
}

/**
 * Exported so the boot sequence can call it with the client it already has,
 * rather than starting another Node process to open a second connection.
 */
export async function bootstrapAdmins(prisma: PrismaClient) {
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
      // Also in the Club Development Unit. Unit membership is its own grant
      // now, and a fresh deploy has to have somebody who can reach the portal:
      // club and assessor accounts are created from /cda/cdu, which only the
      // Unit can open, so an instance whose first admin is outside it has no
      // way into that product at all.
      const user = await prisma.user.create({
        data: { email, role: "ADMIN", cdu: true, title: "Program Admin" },
      });
      const link = await issueSignInLink(prisma, user.id);
      console.log(`[bootstrap] Created admin ${email}`);
      await deliverLink(email, link, "A sign-in link for the first admin was issued.");
      continue;
    }

    // Re-enable and re-promote, so ADMIN_EMAILS is always a way back in — to
    // both products, for the same reason as above. This is the documented way
    // out of a locked-out instance and it has to reopen every door.
    if (existing.role !== "ADMIN" || !existing.cdu || !existing.active) {
      await prisma.user.update({
        where: { email },
        data: { role: "ADMIN", cdu: true, active: true },
      });
      console.log(`[bootstrap] Restored admin access for ${email}`);
    } else {
      console.log(`[bootstrap] Admin ${email} already present`);
    }

    // Without a mail server, an admin who isn't signed in has no way to ask for
    // a link — so print one on every deploy until they are.
    //
    // Deliberately keyed on the session alone. An earlier check also skipped
    // when an unused token existed, which backfired: the token had been printed
    // to a previous deploy's log, so the one person who needed it couldn't see
    // it, and redeploying stayed silent. Issuing a new link retires the old one,
    // which is exactly right — the newest log always holds the link that works.
    if (RESET_SESSIONS) {
      const ended = await prisma.session.deleteMany({ where: { userId: existing.id } });
      if (ended.count > 0) {
        console.log(`[bootstrap] ADMIN_LINK=reset — ended ${ended.count} session(s) for ${email}.`);
      }
    }

    const liveSession = await prisma.session.findFirst({
      where: { userId: existing.id, expiresAt: { gt: new Date() } },
    });

    // Silence is the default on purpose: minting a link on every boot for an
    // admin who is already signed in retires the one they might still be
    // holding, for no reason. ADMIN_LINK is the way to ask for one when it is
    // actually needed.
    if (liveSession && !FORCE_LINK) {
      console.log(`[bootstrap] ${email} has an active session; no link needed.`);
      console.log("[bootstrap] Set ADMIN_LINK=1 and redeploy if you can't actually get in.");
      continue;
    }

    const link = await issueSignInLink(prisma, existing.id);
    await deliverLink(
      email,
      link,
      liveSession
        ? `ADMIN_LINK is set — issued a fresh link for ${email}.`
        : `${email} is not signed in — issued a sign-in link.`,
    );
    if (FORCE_LINK && !PRINT_TOKEN) {
      console.log("[bootstrap] Remove ADMIN_LINK from the environment once you're in.");
    }
  }
}

// Only when run directly; scripts/boot.ts owns the client and the error path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient({ adapter: createAdapter() });
  bootstrapAdmins(prisma)
    .catch((error) => {
      console.error("[bootstrap] Failed:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
