import "server-only";

import { getTasksForCoach } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { rollUpCourse, type CourseResult } from "@/lib/support-rubric";

/** Every course a coach is enrolled in, rolled up to a result. */
export async function courseResultsFor(userId: string): Promise<CourseResult[]> {
  const [tasks, enrollments] = await Promise.all([
    getTasksForCoach(userId),
    prisma.enrollment.findMany({
      where: { userId, course: { published: true } },
      select: { course: { select: { id: true, title: true, passMark: true } } },
      orderBy: { course: { title: "asc" } },
    }),
  ]);

  return enrollments.map(({ course }) => rollUpCourse(course, tasks));
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
export async function getSupportQueue(now = new Date()) {
  return prisma.supportAttempt.findMany({
    where: {
      case: { status: "IN_PROGRESS" },
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

export async function getSupportQueueCount(now = new Date()) {
  return prisma.supportAttempt.count({
    where: {
      case: { status: "IN_PROGRESS" },
      OR: [{ status: "SUBMITTED" }, { status: "SCHEDULED", dueAt: { lte: now } }],
    },
  });
}

/** Coaches who have been asked for film and haven't sent it by the date set. */
export async function getOverdueVideos(now = new Date()) {
  return prisma.supportAttempt.findMany({
    where: {
      case: { status: "IN_PROGRESS" },
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
 * Coaches who finished a ranked course below its pass mark and have no support
 * case on it yet.
 *
 * Nobody is referred automatically. A coach who came up two points short after
 * a bereavement and a coach who never engaged both land in this list, and the
 * educator decides which conversation each of them needs — but neither of them
 * gets quietly lost, which is what happens when "who failed?" is a question you
 * have to go and assemble by hand.
 */
export async function getReferralCandidates(): Promise<ReferralCandidate[]> {
  const rankedCourses = await prisma.course.findMany({
    where: { published: true, passMark: { not: null } },
    select: { id: true, title: true, passMark: true },
  });
  if (rankedCourses.length === 0) return [];

  const coaches = await prisma.user.findMany({
    where: {
      role: "COACH",
      active: true,
      enrollments: { some: { courseId: { in: rankedCourses.map((c) => c.id) } } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      enrollments: { select: { courseId: true } },
      supportCases: { select: { courseId: true } },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  const candidates: ReferralCandidate[] = [];

  for (const coach of coaches) {
    const tasks = await getTasksForCoach(coach.id);
    const enrolled = new Set(coach.enrollments.map((e) => e.courseId));
    const withCase = new Set(coach.supportCases.map((c) => c.courseId));

    for (const course of rankedCourses) {
      if (!enrolled.has(course.id) || withCase.has(course.id)) continue;
      const result = rollUpCourse(course, tasks);
      if (result.verdict === "not_passed") {
        const { enrollments: _e, supportCases: _s, ...user } = coach;
        candidates.push({ user, result });
      }
    }
  }

  return candidates;
}
