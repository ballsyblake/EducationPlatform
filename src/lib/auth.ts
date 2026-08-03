import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { sendMail, isDevMailMode } from "@/lib/mailer";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { Role, User } from "@prisma-client";

const SESSION_COOKIE = "coach_lms_session";
const SESSION_TTL_DAYS = 30;
const LOGIN_TOKEN_TTL_MINUTES = 20;

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
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
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

  // Retire any outstanding links so only the newest one works.
  await prisma.loginToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = newToken();
  await prisma.loginToken.create({
    data: {
      tokenHash: hash(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60_000),
    },
  });

  const link = `${appUrl()}/auth/verify?token=${token}`;
  const greeting = user.name ? `Coach ${user.name}` : "Coach";

  await sendMail({
    to: email,
    subject: "Your Coach LMS sign-in link",
    text: [
      `${greeting},`,
      "",
      "Use the link below to sign in. It works once and expires in " +
        `${LOGIN_TOKEN_TTL_MINUTES} minutes.`,
      "",
      link,
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
    html: `<p>${greeting},</p><p>Use the link below to sign in. It works once and expires in ${LOGIN_TOKEN_TTL_MINUTES} minutes.</p><p><a href="${link}">Sign in to Coach LMS</a></p><p>If you didn't request this, you can ignore this email.</p>`,
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

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;

export type PasswordSignInResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: string };

/**
 * Signs in with an admin-issued password.
 *
 * Every failure returns the same message, so the form can't be used to work out
 * which addresses are on staff or which of those have a password set. Repeated
 * failures lock the account for a while to make guessing impractical.
 */
export async function signInWithPassword(
  rawEmail: string,
  password: string,
): Promise<PasswordSignInResult> {
  const generic = { ok: false as const, error: "That email and password don't match." };

  const email = normalizeEmail(rawEmail);
  if (!email || !password) return generic;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash) {
    // Spend roughly the same time as a real verification would.
    await verifyPassword(password, null);
    return generic;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    return {
      ok: false,
      error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask your coordinator to reset it.`,
    };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failedLogins = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins,
        lockedUntil:
          failedLogins >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
            : null,
      },
    });
    return generic;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  await startSession(user.id);
  return { ok: true, mustChangePassword: user.mustChangePassword };
}

/**
 * Sets a password. `temporary` marks it as needing a change on first use, which
 * is what an admin handing one to a coach wants.
 */
export async function setUserPassword(
  userId: string,
  password: string,
  opts: { temporary?: boolean } = {},
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: opts.temporary ?? false,
      failedLogins: 0,
      lockedUntil: null,
    },
  });
}

/** Ends every other session, e.g. after a coach changes their own password. */
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

export async function startSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: { tokenHash: hash(token), userId, expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
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

  // Refresh at most once an hour to avoid a write on every page view.
  if (Date.now() - session.lastSeenAt.getTime() > 3_600_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
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
