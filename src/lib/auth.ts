import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { sendMail, isDevMailMode } from "@/lib/mailer";
import type { Role, User } from "@prisma-client";

const SESSION_COOKIE = "coach_lms_session";

/**
 * Sessions slide: every visit pushes the expiry back out, so a coach who keeps
 * using the app never has to sign in again. Only a genuinely dormant account
 * lapses and needs a fresh link — which matters a lot when links are handed out
 * by an admin rather than self-served over email.
 */
const SESSION_IDLE_DAYS = Number(process.env.SESSION_IDLE_DAYS ?? 60);

/** Emailed links are short-lived; the inbox is the weak point. */
const EMAIL_LINK_TTL_MINUTES = Number(process.env.EMAIL_LINK_TTL_MINUTES ?? 20);

/** Links an admin hands over in person need to survive until the coach uses one. */
const INVITE_LINK_TTL_DAYS = Number(process.env.INVITE_LINK_TTL_DAYS ?? 7);

/** Stops a repeated request from flooding a coach's inbox. */
const RESEND_COOLDOWN_SECONDS = 60;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function appUrl() {
  // RENDER_EXTERNAL_URL is injected by Render with the service's real public
  // URL. Falling back to it means a first deploy produces working sign-in links
  // before you know what your hostname will be. APP_URL still wins when set,
  // which is what a custom domain needs.
  // `||`, not `??`: a variable left blank in a host's dashboard arrives as an
  // empty string, and an empty base would turn every sign-in link into a
  // relative path that's useless once it leaves the browser.
  const base =
    process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

/* -------------------------------------------------------------------------- */
/* Magic links                                                                */
/* -------------------------------------------------------------------------- */

export type LoginRequestResult =
  | { ok: true; delivered: boolean; devLink?: string }
  | { ok: false; error: string };

/**
 * Issues a single-use magic link for an existing, active user.
 *
 * Accounts are created by an admin, never by signing in, so an unknown address
 * gets the same "check your email" response as a known one — that keeps the
 * login form from confirming who is on staff.
 */
export async function requestLoginLink(rawEmail: string): Promise<LoginRequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { ok: true, delivered: false };
  }

  // Repeated submits shouldn't bury a coach in mail. The most recent live link
  // still works, so silently succeeding here costs them nothing.
  const recent = await prisma.loginToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) },
    },
  });
  if (recent) return { ok: true, delivered: !isDevMailMode() };

  const { token, minutes } = await issueToken(user.id, EMAIL_LINK_TTL_MINUTES);
  const link = signInUrl(token);
  const greeting = user.name ? `Coach ${user.name}` : "Coach";

  await sendMail({
    to: email,
    subject: "Your Coach LMS sign-in link",
    text: [
      `${greeting},`,
      "",
      `Use the link below to sign in. It works once and expires in ${minutes} minutes.`,
      "",
      link,
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
    html: `<p>${greeting},</p><p>Use the link below to sign in. It works once and expires in ${minutes} minutes.</p><p><a href="${link}">Sign in to Coach LMS</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });

  return {
    ok: true,
    delivered: !isDevMailMode(),
    // Never hand the link back to the browser in production. Without SMTP the
    // app still falls back to logging it, but showing it on the login page
    // would let anyone sign in as any coach just by typing their address.
    devLink: canRevealMagicLink() ? link : undefined,
  };
}

/** Mints a token, retiring any older ones so only the newest link works. */
async function issueToken(userId: string, ttlMinutes: number) {
  await prisma.loginToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = newToken();
  await prisma.loginToken.create({
    data: {
      tokenHash: hash(token),
      userId,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });

  return { token, minutes: ttlMinutes };
}

export function signInUrl(token: string) {
  return `${appUrl()}/auth/verify?token=${token}`;
}

/**
 * A sign-in link for an admin to deliver by hand — text, printout, or a QR code
 * held up in a staff meeting. Longer-lived than an emailed one because it has
 * to survive the trip from the coordinator's screen to the coach's phone, and
 * it never travels through an inbox.
 *
 * Callers must already have established that the requester is an admin.
 */
export async function createInviteLink(userId: string, ttlDays = INVITE_LINK_TTL_DAYS) {
  const { token } = await issueToken(userId, ttlDays * 24 * 60);
  return {
    url: signInUrl(token),
    expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
    ttlDays,
  };
}

/** Magic links may only be shown on screen outside production. */
export function canRevealMagicLink() {
  return isDevMailMode() && process.env.NODE_ENV !== "production";
}

/** Whether the login page should offer the magic-link route at all. */
export function magicLinkAvailable() {
  return !isDevMailMode() || canRevealMagicLink();
}

/** Consumes a magic-link token and starts a session. Returns null if invalid. */
export async function consumeLoginToken(token: string): Promise<User | null> {
  const record = await prisma.loginToken.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.active) {
    return null;
  }

  await prisma.loginToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  await startSession(record.userId);
  return record.user;
}

/** Ends every session but the current one — used from the account page. */
export async function revokeOtherSessions(userId: string) {
  const jar = await cookies();
  const current = jar.get(SESSION_COOKIE)?.value;
  await prisma.session.deleteMany({
    where: { userId, ...(current ? { NOT: { tokenHash: hash(current) } } : {}) },
  });
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

function idleExpiry() {
  return new Date(Date.now() + SESSION_IDLE_DAYS * 86_400_000);
}

export async function startSession(userId: string) {
  const token = newToken();

  await prisma.session.create({
    data: { tokenHash: hash(token), userId, expiresAt: idleExpiry() },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // The cookie deliberately outlives the session row. Expiry is enforced in
    // the database, which is the only place that can be slid forward — a
    // Server Component may read cookies but never write them.
    maxAge: 400 * 86_400, // browsers cap persistent cookies at 400 days
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hash(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.active) {
    return null;
  }

  // Slide the expiry forward on use, at most once an hour so an active coach
  // costs one write per hour rather than one per page view. This is what keeps
  // regular users from ever needing another sign-in link.
  if (Date.now() - session.lastSeenAt.getTime() > 3_600_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: idleExpiry() },
    });
  }

  return session.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== ("ADMIN" satisfies Role)) redirect("/dashboard");
  return user;
}

export function isAdmin(user: Pick<User, "role"> | null | undefined) {
  return user?.role === "ADMIN";
}

/** Constant-time compare, for anywhere a secret is checked outside the DB. */
export function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
