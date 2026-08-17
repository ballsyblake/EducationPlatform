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

/**
 * Whether this account can hold line items.
 *
 * An assessor by role, or a Club Development Unit account marked as also
 * assessing. The Unit is small enough that the people who run a cycle are among
 * the people who score it; the alternative was a second account under a second
 * address, which splits one person's work across two identities and makes the
 * record harder to read rather than easier.
 *
 * This grants nothing an ADMIN did not already have — they can read every
 * assessment regardless — it only makes them allocatable. Where it does create
 * an overlap, the assessment's audit trail names it.
 */
export function mayAssess(user: Pick<User, "role" | "assesses">): boolean {
  return user.role === "ASSESSOR" || (user.role === "ADMIN" && user.assesses);
}

/** The `where` that selects everyone eligible to hold a line item. */
export const ASSESSOR_POOL_WHERE = {
  OR: [{ role: "ASSESSOR" as const }, { role: "ADMIN" as const, assesses: true }],
};

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
  if (!mayAssess(user)) redirect("/cda");
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

  // Assessors only. A Club Development Unit account that also assesses returned
  // above: the Unit reads every assessment by definition, so the portfolio
  // bounds who an assessor is, not what the Unit may see.
  if (user.role === "ASSESSOR") {
    // A club not yet placed in a pool has no assessors by definition.
    if (!assessment.poolId) notFound();

    // Two conditions, not one. Holding a line item across a pool says what this
    // assessor scores; their ambassador portfolio says which clubs are theirs
    // at all. A CDA who looks after six clubs has no business reading the
    // other thirty in the pool, and until now holding a single item opened
    // every one of them.
    const [holds, ambassador] = await Promise.all([
      prisma.criterionAssignment.findFirst({
        where: { poolId: assessment.poolId, assessorId: user.id },
        select: { id: true },
      }),
      prisma.clubAmbassador.findUnique({
        where: { clubId_userId: { clubId: assessment.clubId, userId: user.id } },
        select: { id: true },
      }),
    ]);
    if (!holds || !ambassador) notFound();
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
 * The clubs a CDA looks after — their standing portfolio.
 *
 * Separate from the assessment allocation on purpose: the portfolio is a
 * year-round support relationship and survives a cycle ending, while the
 * allocation says what they score this season. Visibility is the overlap.
 */
export async function ambassadorClubIds(userId: string) {
  const rows = await prisma.clubAmbassador.findMany({
    where: { userId },
    select: { clubId: true },
  });
  return new Set(rows.map((r) => r.clubId));
}

/**
 * The portfolio to filter an assessor's screens by, or null for no limit.
 *
 * Null for a Club Development Unit account that also assesses: the Unit reads
 * every assessment anyway, and filtering its own scoring screens to a portfolio
 * it was never given would show it nothing. The boundary describes what an
 * assessor is, not what the Unit may see.
 */
export async function portfolioFilter(
  user: Pick<User, "id" | "role">,
): Promise<Set<string> | null> {
  if (user.role === "ADMIN") return null;
  return ambassadorClubIds(user.id);
}

/**
 * Which parts of a club's submission a set of line items actually justifies
 * reading.
 *
 * The assessor's evidence page used to show everything a club submitted to
 * anyone holding any item in its pool: the full staff register with names,
 * Blue Card status and downloadable certificates, the participation figures,
 * and all nine Non-Negotiable declarations with the club's own notes and
 * uploaded files. Scoring one Planning item does not require any of that.
 *
 * Mapped at the domain rather than per criterion because domain is an enum and
 * the areas are free text the Unit rewords. If FQ wants this finer, this
 * constant is the one place to change.
 */
export const EVIDENCE_FOR_DOMAIN = {
  // Planning and Delivery items turn on who is in post and who delivers —
  // Coach Education and Support, Coach Reviews & Mentoring, the observation
  // areas — so the staff register is the evidence behind them.
  PLANNING: ["STAFF"],
  DELIVERY: ["STAFF"],
  // Outcomes items are player development, retention and satisfaction, read
  // against the club's own registration numbers.
  OUTCOMES: ["PARTICIPATION"],
} as const satisfies Record<string, readonly ("STAFF" | "PARTICIPATION")[]>;

export type EvidenceSection = "STAFF" | "PARTICIPATION";

/**
 * What this assessor may read of a club's submission, from the line items they
 * hold in that club's pool.
 *
 * Non-Negotiables are on nobody's list. An assessor never scores one — they are
 * the Unit's to verify — so the declarations, the club's notes on them and the
 * files attached to them are not an assessor's to read at all.
 */
export async function visibleEvidenceFor(
  assessorId: string,
  poolId: string | null,
): Promise<Set<EvidenceSection>> {
  const sections = new Set<EvidenceSection>();
  if (!poolId) return sections;

  const held = await prisma.criterionAssignment.findMany({
    where: { poolId, assessorId },
    select: { criterion: { select: { domain: true } } },
  });

  for (const h of held) {
    const domain = h.criterion.domain as keyof typeof EVIDENCE_FOR_DOMAIN;
    for (const s of EVIDENCE_FOR_DOMAIN[domain] ?? []) sections.add(s);
  }
  return sections;
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

/**
 * True once the club is allowed to see its own rating.
 *
 * Every status from release onwards, because FQ's process is built on the club
 * *reading* the preliminary rating and challenging it. Seeing it and being
 * allowed to publish it are different questions — `shieldPublishable` answers
 * the second, and only a Confirmed rating passes that one.
 */
export function ratingVisibleToClub(status: string) {
  return (
    status === "PUBLISHED" ||
    status === "IN_REVIEW" ||
    status === "UNDER_APPEAL" ||
    status === "CONFIRMED"
  );
}

/** Statuses in which a club has been given a result of any kind. */
export const RELEASED_STATUSES = [
  "PUBLISHED",
  "IN_REVIEW",
  "UNDER_APPEAL",
  "CONFIRMED",
] as const;
