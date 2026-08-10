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
 * An assessor's reach is no longer "this club". They hold particular line items
 * across a pool, so they reach a club when they hold at least one line item in
 * that club's pool — and even then they may only score the items they hold.
 * Use `assignedCriterionIds` for the second half of that.
 */
export async function requireAssessmentAccess(user: User, assessmentId: string) {
  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    include: { club: true, cycle: true, pool: true },
  });
  if (!assessment) notFound();

  if (user.role === "ADMIN") return assessment;

  if (user.role === "ASSESSOR") {
    // A club not yet placed in a pool has no assessors by definition.
    if (!assessment.poolId) notFound();
    const holds = await prisma.criterionAssignment.findFirst({
      where: { poolId: assessment.poolId, assessorId: user.id },
      select: { id: true },
    });
    if (!holds) notFound();
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
 * The line items an assessor may score on a given club.
 *
 * Everything an assessor writes is checked against this. Holding one item in a
 * pool gets you through the door; it must not get you the other thirty-nine.
 */
export async function assignedCriterionIds(assessorId: string, poolId: string | null) {
  if (!poolId) return new Set<string>();
  const held = await prisma.criterionAssignment.findMany({
    where: { poolId, assessorId },
    select: { criterionId: true },
  });
  return new Set(held.map((h) => h.criterionId));
}

/**
 * Loads one of this assessor's line-item assignments — the unit their scoring
 * screen is built around — or 404s.
 */
export async function requireAssignment(assessorId: string, assignmentId: string) {
  const assignment = await prisma.criterionAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      criterion: { include: { subCriteria: { orderBy: { position: "asc" } } } },
      pool: { include: { cycle: true } },
    },
  });
  if (!assignment || assignment.assessorId !== assessorId) notFound();
  return assignment;
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
