import "server-only";

import { prisma } from "@/lib/db";
import { deadlineInForce, daysUntilDeadline, isPastDeadline } from "@/lib/support";
import { openAttempt } from "@/lib/support-rubric";

/**
 * What an educator is being asked for, and nothing else.
 *
 * An educator's view of this app was every staff page scoped by course: the
 * cross-course roster, the coursework grading queue, the hours ledger, the
 * cohort roll-up, the support desk with its six tiles and its referral forms.
 * All of it answers the program's questions. An educator has three: who have I
 * still got to watch deliver, what film and write-ups are sitting with me, and
 * who needs a date in a diary.
 *
 * "Attached" is the course roster — `CourseStaff`, the same seat
 * `staffCourseIds` resolves and every action already checks. It is deliberately
 * not a second coach-to-educator table: the register is what FQ actually keeps,
 * a coach belongs to an educator because they are on that educator's course,
 * and a parallel attachment would be a second thing to maintain and to
 * disagree with the roster.
 *
 * Every function here takes that scope as `string[] | null` — null being an
 * admin's absence of a filter, per `staffCourseIds`.
 */

/** Course ids as a Prisma filter fragment, or nothing at all for an admin. */
function within(scope: string[] | null) {
  return scope === null ? {} : { courseId: { in: scope } };
}

/* ------------------------- On-course delivery ----------------------------- */

/** Why a coach is on the grading list. The two are different jobs. */
export type DeliveryNeed =
  /// Nobody has written up a delivery for them yet.
  | "unassessed"
  /// Deliveries are written up; the course rating across them isn't set.
  | "unrated";

export type DeliveryRow = {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  coach: {
    id: string;
    name: string | null;
    email: string;
    photoId: string | null;
  };
  clubName: string | null;
  catchUp: boolean;
  need: DeliveryNeed;
  /** Deliveries written up so far, and when the last one was. */
  deliveries: number;
  lastDeliveryAt: Date | null;
  rating: number | null;
};

/**
 * Coaches on the educator's courses still owed something on their delivery.
 *
 * One query over enrolments with their deliveries, never one read per coach —
 * the progress page learned that the hard way at 624 queries for 88 coaches.
 *
 * A closed cohort is a record rather than work and drops out: an educator who
 * finds one more thing still has the course page. `IN_PROGRESS` is the same
 * test `courseStanding` calls "without a result" — a coach who withdrew or
 * transferred has had their decision taken, and chasing them for a delivery
 * would be chasing a decision somebody already made.
 */
export async function getDeliveryQueue(scope: string[] | null): Promise<DeliveryRow[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      ...within(scope),
      outcome: "IN_PROGRESS",
      course: { published: true, closedAt: null },
      user: { active: true },
    },
    select: {
      id: true,
      courseId: true,
      clubName: true,
      track: true,
      rating: true,
      course: { select: { title: true } },
      user: { select: { id: true, name: true, email: true, photoId: true } },
      deliveries: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ course: { title: "asc" } }, { position: "asc" }],
  });

  return enrollments
    .filter((e) => e.deliveries.length === 0 || e.rating === null)
    .map((e) => ({
      enrollmentId: e.id,
      courseId: e.courseId,
      courseTitle: e.course.title,
      coach: e.user,
      clubName: e.clubName,
      catchUp: e.track === "CATCH_UP",
      need: e.deliveries.length === 0 ? ("unassessed" as const) : ("unrated" as const),
      deliveries: e.deliveries.length,
      lastDeliveryAt: e.deliveries[0]?.createdAt ?? null,
      rating: e.rating,
    }));
}

/* ------------------------- Post-course support ---------------------------- */

const SUPPORT_CASE_SELECT = {
  id: true,
  courseId: true,
  deadline: true,
  attemptsAllowed: true,
  availabilityDay: true,
  availabilityTime: true,
  availabilityNote: true,
  availabilityAt: true,
  user: { select: { id: true, name: true, email: true, photoId: true } },
  course: { select: { title: true, supportDeadline: true } },
  educator: { select: { id: true, name: true, email: true } },
  educatorName: true,
  extensions: {
    select: {
      id: true,
      status: true,
      grantedUntil: true,
      decidedAt: true,
      requestedAt: true,
    },
  },
  attempts: {
    orderBy: { attemptNo: "asc" },
    select: {
      id: true,
      attemptNo: true,
      pathway: true,
      status: true,
      dueAt: true,
      venue: true,
      videoUrl: true,
      submittedAt: true,
    },
  },
} as const;

type SupportCaseRow = Awaited<ReturnType<typeof openCases>>[number];

async function openCases(scope: string[] | null) {
  return prisma.supportCase.findMany({
    where: { status: "IN_PROGRESS", ...within(scope) },
    select: SUPPORT_CASE_SELECT,
    orderBy: { openedAt: "desc" },
  });
}

/** Which pile a case is in. The page is these four lists and nothing else. */
export type SupportBucket =
  /// Film has come in, or an observation has happened: it is the educator's to review.
  | "to_review"
  /// Film was asked for and the date has gone. The coach needs chasing.
  | "to_chase"
  /// A live assessment the coach has told us when to come to, with no date set.
  | "to_schedule"
  /// A live assessment with nobody's availability to go on. Ring them.
  | "to_book"
  /// Arranged and in the future — the coach's to deliver, or to film.
  | "arranged";

export type SupportItem = {
  case: SupportCaseRow;
  bucket: SupportBucket;
  /** The open attempt, where there is one. */
  attempt: SupportCaseRow["attempts"][number] | null;
  deadline: Date | null;
  overdue: boolean;
  daysLeft: number | null;
};

/**
 * Every open case on the educator's courses, sorted into what to do with it.
 *
 * The desk's own page answers "where does this cohort stand"; this answers
 * "what do I do next", which is the only question an educator opens it with.
 * The deadline in force comes from `support.ts` rather than being re-derived,
 * so this page and the desk quote the same day for the same case.
 */
export async function getSupportWork(
  scope: string[] | null,
  now = new Date(),
): Promise<SupportItem[]> {
  const cases = await openCases(scope);

  return (
    cases
      .map((supportCase) => {
        const attempt = openAttempt(supportCase.attempts);
        const deadline = deadlineInForce(supportCase);

        const bucket: SupportBucket =
          // Film in, or a booked observation whose day has been and gone: either
          // way the delivery has happened and the write-up is owed.
          attempt?.status === "SUBMITTED" ||
          (attempt?.status === "SCHEDULED" && attempt.dueAt !== null && attempt.dueAt <= now)
            ? "to_review"
            : // Film asked for and the date gone. The coach's to send, but
              // nobody else is going to ask them for it.
              attempt?.status === "AWAITING_VIDEO" && attempt.dueAt !== null && attempt.dueAt < now
              ? "to_chase"
              : attempt
                ? "arranged"
                : // Nothing booked. Whether that is a date to set or a phone call
                  // to make turns on whether the coach has told us when to come —
                  // which is the form they fill in at referral, and the difference
                  // between two very different jobs sitting in one list.
                  supportCase.availabilityAt
                  ? "to_schedule"
                  : "to_book";

        return {
          case: supportCase,
          bucket,
          attempt: attempt ?? null,
          deadline: deadline.date,
          overdue: isPastDeadline(deadline.date, now),
          daysLeft: deadline.date ? daysUntilDeadline(deadline.date, now) : null,
        };
      })
      // Soonest deadline first, and an undated case last rather than first: it is
      // not urgent, it is unanswered. The same ordering the desk uses.
      .sort((a, b) => {
        if (a.deadline === null) return b.deadline === null ? 0 : 1;
        if (b.deadline === null) return -1;
        return a.deadline.getTime() - b.deadline.getTime();
      })
  );
}

/** The items in one pile, in the order `getSupportWork` resolved them. */
export function inBucket(items: SupportItem[], bucket: SupportBucket) {
  return items.filter((i) => i.bucket === bucket);
}

/* --------------------------- What is outstanding -------------------------- */

export type EducatorOutstanding = {
  /** Coaches with no delivery written up at all. */
  unassessed: number;
  /** Coaches whose deliveries are in but who have no course rating. */
  unrated: number;
  /** Film in, and observations to write up. */
  toReview: number;
  /** Live assessments to put a date on, availability in hand. */
  toSchedule: number;
  /** Live assessments with no availability — a coach to reach out to. */
  toBook: number;
  /** Film asked for, the date gone, nothing submitted. */
  toChase: number;
  /** Open cases past the date in force. */
  pastDeadline: number;
  /** Coursework still unmarked on their courses, which lives on the old desk. */
  ungraded: number;
  /** Everything above that is somebody's to do, minus the overlap. */
  total: number;
};

/**
 * The dashboard's one job: what is outstanding on the courses I am attached to.
 *
 * Built from the same two functions the pages below it draw, rather than its
 * own counts — the page that tells an educator they have four things to do and
 * the page that lists three of them is worse than either alone.
 */
export async function getEducatorOutstanding(
  scope: string[] | null,
  ungraded: number,
  now = new Date(),
): Promise<EducatorOutstanding> {
  const [deliveries, support] = await Promise.all([
    getDeliveryQueue(scope),
    getSupportWork(scope, now),
  ]);

  const unassessed = deliveries.filter((d) => d.need === "unassessed").length;
  const unrated = deliveries.filter((d) => d.need === "unrated").length;
  const toReview = inBucket(support, "to_review").length;
  const toSchedule = inBucket(support, "to_schedule").length;
  const toBook = inBucket(support, "to_book").length;
  const toChase = inBucket(support, "to_chase").length;

  return {
    unassessed,
    unrated,
    toReview,
    toSchedule,
    toBook,
    toChase,
    // Counted but not added in: a case past its deadline is already in one of
    // the piles above, and adding it again would inflate the figure the
    // dashboard leads with.
    pastDeadline: support.filter((i) => i.overdue).length,
    ungraded,
    total: unassessed + unrated + toReview + toSchedule + toBook + toChase + ungraded,
  };
}
