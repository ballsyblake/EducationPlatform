import "server-only";

import { prisma } from "@/lib/db";
import { courseResult, type CourseResult } from "@/lib/support-rubric";

/** Where a coach stands on every course they're enrolled in. */
export async function courseResultsFor(userId: string): Promise<CourseResult[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, course: { published: true } },
    select: {
      courseId: true,
      rating: true,
      outcome: true,
      course: { select: { title: true, ratingThreshold: true } },
    },
    orderBy: { course: { title: "asc" } },
  });

  return enrollments.map(courseResult);
}

/* ------------------------------- Cases ------------------------------------ */

const CASE_INCLUDE = {
  user: true,
  course: true,
  educator: true,
  referredBy: true,
  attempts: {
    orderBy: { attemptNo: "asc" },
    include: { ratings: true, files: true, reviewedBy: true },
  },
} as const;

export type SupportCaseDetail = Awaited<ReturnType<typeof getSupportCase>>;

export async function getSupportCase(id: string) {
  return prisma.supportCase.findUnique({ where: { id }, include: CASE_INCLUDE });
}

export async function getSupportCasesForCoach(userId: string) {
  return prisma.supportCase.findMany({
    where: { userId },
    include: CASE_INCLUDE,
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
  });
}

/* -------------------------- The educator's queue -------------------------- */

/**
 * Attempts sitting with an educator: film that has come in, and observations
 * whose date has passed and still have no write-up.
 */
export async function getSupportQueue(now = new Date(), scope: string[] | null = null) {
  return prisma.supportAttempt.findMany({
    where: {
      case: { status: "IN_PROGRESS", ...(scope === null ? {} : { courseId: { in: scope } }) },
      OR: [
        { status: "SUBMITTED" },
        { status: "SCHEDULED", dueAt: { lte: now } },
      ],
    },
    include: {
      files: true,
      case: { include: { user: true, course: true, educator: true } },
    },
    orderBy: [{ dueAt: "asc" }, { submittedAt: "asc" }],
  });
}

export async function getSupportQueueCount(now = new Date(), scope: string[] | null = null) {
  return prisma.supportAttempt.count({
    where: {
      case: { status: "IN_PROGRESS", ...(scope === null ? {} : { courseId: { in: scope } }) },
      OR: [{ status: "SUBMITTED" }, { status: "SCHEDULED", dueAt: { lte: now } }],
    },
  });
}

/** Coaches who have been asked for film and haven't sent it by the date set. */
export async function getOverdueVideos(now = new Date(), scope: string[] | null = null) {
  return prisma.supportAttempt.findMany({
    where: {
      case: { status: "IN_PROGRESS", ...(scope === null ? {} : { courseId: { in: scope } }) },
      status: "AWAITING_VIDEO",
      dueAt: { lt: now },
    },
    include: { case: { include: { user: true, course: true, educator: true } } },
    orderBy: { dueAt: "asc" },
  });
}

/* --------------------------- Who needs referring -------------------------- */

export type ReferralCandidate = {
  user: { id: string; name: string | null; email: string; title: string | null };
  result: CourseResult;
};

/**
 * Coaches rated below their course's threshold with no support case open yet.
 *
 * Nobody is referred automatically. A coach two points short after a
 * bereavement and a coach who never engaged both land in this list, and the
 * educator decides which conversation each of them needs — but neither of them
 * gets quietly lost, which is what happens when "who didn't pass?" is a
 * question you have to go and assemble by hand.
 */
export async function getReferralCandidates(
  scope: string[] | null = null,
): Promise<ReferralCandidate[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      ...(scope === null ? {} : { courseId: { in: scope } }),
      course: { published: true, ratingThreshold: { not: null } },
      user: { role: "COACH", active: true },
      // The register can say so outright; otherwise the rating decides, and an
      // unrated coach is nobody's shortfall yet.
      OR: [{ outcome: "POST_COURSE_SUPPORT" }, { rating: { not: null } }],
    },
    select: {
      courseId: true,
      rating: true,
      outcome: true,
      course: { select: { title: true, ratingThreshold: true } },
      user: { select: { id: true, name: true, email: true, title: true } },
    },
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
  });

  const withCase = new Set(
    (await prisma.supportCase.findMany({ select: { userId: true, courseId: true } })).map(
      (c) => `${c.userId}:${c.courseId}`,
    ),
  );

  return enrollments
    .filter((e) => !withCase.has(`${e.user.id}:${e.courseId}`))
    .map((e) => ({ user: e.user, result: courseResult(e) }))
    .filter((c) => c.result.verdict === "needs_support");
}
