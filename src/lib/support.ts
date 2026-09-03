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

/* ------------------------------ The deadline ------------------------------ */

/** Where the date in force came from, so a page can say. */
export type DeadlineSource = "extension" | "case" | "course";

export type Deadline = {
  /// The date the case has to be finished by, or null when nobody has set one.
  date: Date | null;
  source: DeadlineSource | null;
  /// The extension that moved it, when one did.
  extensionId: string | null;
};

/** The shape the resolver needs. Anything wider is welcome; this is the floor. */
export type DeadlineInput = {
  deadline: Date | null;
  course: { supportDeadline: Date | null };
  extensions: {
    id: string;
    status: string;
    grantedUntil: Date | null;
    decidedAt: Date | null;
    requestedAt: Date;
  }[];
};

/**
 * The date a case is actually due by.
 *
 * One rule, in one place, because three tables can produce three answers and a
 * page that resolves them in a different order tells a coach a different day.
 * The latest granted extension wins; failing that the case's own date, set
 * where somebody moved it for this coach; failing that the cohort's, which is
 * where nearly every case gets its date from.
 *
 * "Latest" is the most recently *decided* grant rather than the furthest-away
 * date. A grant answers a request, and the answer is not always the date that
 * was asked for — a request for December answered with October means the case
 * is due in October, and reading the biggest date would quietly ignore the
 * answer. Where two grants were decided at the same moment the later date wins,
 * which only matters to a fixture.
 *
 * Deliberately not a database column and deliberately not SQL: there is no
 * cached copy to go stale, and at the scale this runs at — tens of open cases,
 * not thousands — one pass in memory is the cheaper mistake to make.
 */
export function deadlineInForce(supportCase: DeadlineInput): Deadline {
  const granted = supportCase.extensions
    .filter((e) => e.status === "GRANTED" && e.grantedUntil !== null)
    .sort((a, b) => {
      const decided =
        (b.decidedAt ?? b.requestedAt).getTime() - (a.decidedAt ?? a.requestedAt).getTime();
      return decided !== 0 ? decided : b.grantedUntil!.getTime() - a.grantedUntil!.getTime();
    })[0];

  if (granted) return { date: granted.grantedUntil, source: "extension", extensionId: granted.id };
  if (supportCase.deadline) return { date: supportCase.deadline, source: "case", extensionId: null };
  if (supportCase.course.supportDeadline) {
    return { date: supportCase.course.supportDeadline, source: "course", extensionId: null };
  }
  return { date: null, source: null, extensionId: null };
}

/** What to call the source in front of a person. */
export const DEADLINE_SOURCE_LABEL: Record<DeadlineSource, string> = {
  extension: "extended",
  case: "set for this coach",
  course: "the cohort's date",
};

/**
 * Days from now until a deadline, counted in whole days rather than hours.
 *
 * A deadline is a date, not an instant: a case due on the 5th is not overdue at
 * nine in the morning on the 5th. Compared the way the register compares a
 * course day, so whatever time of day happens to be stored can't decide whether
 * a coach ran out of time.
 */
export function daysUntilDeadline(date: Date, now = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day(date) - day(now)) / 86_400_000);
}

/** Past the date, with the whole of the day itself allowed. */
export function isPastDeadline(date: Date | null, now = new Date()): boolean {
  return date !== null && daysUntilDeadline(date, now) < 0;
}

/** The window the desk calls "coming up". */
export const DUE_SOON_DAYS = 30;

/** How near a deadline is, for a badge. */
export function deadlineTone(date: Date | null, now = new Date()) {
  if (!date) return "muted" as const;
  const days = daysUntilDeadline(date, now);
  if (days < 0) return "bad" as const;
  if (days <= DUE_SOON_DAYS) return "warn" as const;
  return "muted" as const;
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
  extensions: { orderBy: { requestedAt: "desc" }, include: { requestedBy: true } },
  activities: { orderBy: { occurredAt: "desc" }, include: { recordedBy: true } },
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

/* ---------------------------- The desk's clock ---------------------------- */

export type CaseWithDeadline = Awaited<ReturnType<typeof getOpenCaseDeadlines>>[number];

/**
 * Every open case with the date it is actually due by, soonest first.
 *
 * The whole point of the change: seventeen of the twenty-eight open cases were
 * past a date nobody could see. Resolved here, once, so the desk's tiles, its
 * overdue list and its case list all quote the same day for the same case.
 *
 * The query is filtered by status, which the `[status, deadline]` index leads
 * on; the ordering is done here rather than in SQL because two of the three
 * places a date can come from are in other tables.
 */
export async function getOpenCaseDeadlines(now = new Date(), scope: string[] | null = null) {
  const cases = await prisma.supportCase.findMany({
    where: { status: "IN_PROGRESS", ...(scope === null ? {} : { courseId: { in: scope } }) },
    include: {
      user: true,
      course: true,
      educator: true,
      extensions: true,
      attempts: { orderBy: { attemptNo: "asc" } },
    },
  });

  return cases
    .map((supportCase) => {
      const deadline = deadlineInForce(supportCase);
      return {
        ...supportCase,
        deadlineInForce: deadline,
        overdue: isPastDeadline(deadline.date, now),
        daysLeft: deadline.date ? daysUntilDeadline(deadline.date, now) : null,
      };
    })
    // Soonest first, and a case nobody has dated at all sorts to the bottom
    // rather than to the top: it is not urgent, it is unanswered.
    .sort((a, b) => {
      if (!a.deadlineInForce.date) return b.deadlineInForce.date ? 1 : 0;
      if (!b.deadlineInForce.date) return -1;
      return a.deadlineInForce.date.getTime() - b.deadlineInForce.date.getTime();
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
