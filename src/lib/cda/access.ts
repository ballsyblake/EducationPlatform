import "server-only";

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { User } from "@prisma-client";

/**
 * Who can see what, in one place.
 *
 * The rule that matters: a club must never learn that another club exists in
 * the system, and an assessor must never see a club they weren't assigned. Both
 * are enforced with notFound() rather than a 403, because "you may not see this
 * assessment" and "there is no such assessment" have to be indistinguishable —
 * a 403 on a guessed id would confirm the club is being assessed, and in a
 * competitive club landscape that is itself worth something.
 */

export type CdaRole = "CLUB" | "ASSESSOR" | "ADMIN";

export function cdaRole(user: Pick<User, "role">): CdaRole | null {
  if (user.role === "ADMIN") return "ADMIN";
  if (user.role === "CLUB") return "CLUB";
  if (user.role === "ASSESSOR") return "ASSESSOR";
  return null;
}

/** Any account that belongs in the CDA portal at all. */
export async function requireCdaUser(): Promise<User & { cda: CdaRole }> {
  const user = await requireUser();
  const role = cdaRole(user);
  // A COACH has a perfectly valid account — just not for this product. Send
  // them to the part of the app that is theirs rather than to a dead end.
  if (!role) redirect("/dashboard");
  return Object.assign(user, { cda: role });
}

export async function requireCdu(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/cda");
  return user;
}

export async function requireClubUser(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "CLUB") redirect("/cda");
  return user;
}

export async function requireAssessor(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ASSESSOR") redirect("/cda");
  return user;
}

/** The clubs a CLUB user administers. Usually exactly one. */
export async function clubsFor(userId: string) {
  const memberships = await prisma.clubMembership.findMany({
    where: { userId },
    include: { club: true },
    orderBy: { club: { name: "asc" } },
  });
  return memberships.map((m) => m.club);
}

/**
 * The single club a CLUB user is signed in for.
 *
 * An account with no membership is a real state — an admin created it and
 * hasn't linked it yet — so it gets an explanatory page rather than a crash.
 */
export async function currentClub(userId: string) {
  const clubs = await clubsFor(userId);
  return clubs[0] ?? null;
}

/**
 * Loads an assessment the user is allowed to read, or 404s.
 *
 * `include` is passed straight through so callers get exactly the shape they
 * need from one authorized query, rather than authorizing and then re-fetching.
 */
export async function requireAssessmentAccess(user: User, assessmentId: string) {
  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      club: true,
      cycle: true,
      assessors: { select: { assessorId: true, submittedAt: true } },
    },
  });
  if (!assessment) notFound();

  if (user.role === "ADMIN") return assessment;

  if (user.role === "ASSESSOR") {
    const assigned = assessment.assessors.some((a) => a.assessorId === user.id);
    if (!assigned) notFound();
    return assessment;
  }

  if (user.role === "CLUB") {
    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: user.id, clubId: assessment.clubId } },
    });
    if (!membership) notFound();
    return assessment;
  }

  notFound();
}

/**
 * Assessors may only write while the assessment is actually open to them.
 *
 * Once the CDU starts reconciling, the independent scores are the record of
 * what each assessor saw — letting one edit after the comparison has been drawn
 * up would quietly rewrite the evidence the reconciliation was based on.
 */
export function assessorCanScore(status: string) {
  return status === "SUBMITTED" || status === "IN_ASSESSMENT";
}

/** Clubs may only edit their own data before they submit it. */
export function clubCanEdit(status: string) {
  return status === "NOT_STARTED" || status === "IN_PROGRESS";
}

/** True once the club is allowed to see its own rating. */
export function ratingVisibleToClub(status: string) {
  return status === "PUBLISHED";
}
