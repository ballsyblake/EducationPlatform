/**
 * Every cohort on one screen, with what each still owes.
 *
 * The page this feeds used to be per-coach coursework completion, which
 * measured the half of this product Football Queensland doesn't use: all three
 * B Diploma cohorts carry no assignments and no quizzes, so it drew eighty-odd
 * rows of "0/0 — no grades" under headline figures computed entirely from two
 * demonstration courses. A percentage that describes seed data is worse than no
 * percentage.
 *
 * What was missing instead was the view across cohorts. `courseStanding` has
 * answered "is this one finished" since the course page grew a Finishing up
 * panel, but only one course at a time — you had to open all nine to find the
 * one with results outstanding. This is that panel, for every cohort at once.
 *
 * Batched on purpose: thirteen queries whatever the number of cohorts, counted
 * rather than guessed. The page it replaces ran 624, and the lesson is written
 * down in `(app)/CLAUDE.md`.
 */
import { prisma } from "@/lib/db";
import { summariseAttendance } from "@/lib/attendance";
import { courseStanding, type CourseStanding } from "@/lib/courses";

export type CohortRow = {
  id: string;
  title: string;
  season: string | null;
  published: boolean;
  standing: CourseStanding;
  coaches: number;
  days: number;
  /** Days the register has actually taken, which is not always every day. */
  daysTaken: number;
  /** Hours sat across the cohort as a share of hours required, or null before
   *  any day has been taken. */
  attendancePct: number | null;
  /** Coaches whose hours fall short with nothing raised on the ledger. */
  coachesShort: number;
  /** Results recorded, out of the coaches who need one. */
  resultsIn: number;
  resultsDue: number;
};

export async function getCohortRows(scope: string[] | null = null): Promise<CohortRow[]> {
  const where = scope === null ? {} : { id: { in: scope } };

  const courses = await prisma.course.findMany({
    where,
    orderBy: [{ closedAt: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      season: true,
      published: true,
      closedAt: true,
      days: { select: { id: true, date: true, startTime: true, endTime: true } },
    },
  });
  if (courses.length === 0) return [];

  const ids = courses.map((c) => c.id);

  const [enrollments, supportCases, submissions, attempts] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: { in: ids } },
      select: {
        courseId: true,
        track: true,
        outcome: true,
        joinedAt: true,
        leftAt: true,
        attendance: { select: { courseDayId: true, minutes: true } },
        makeUps: { select: { minutesOwed: true, minutesCredited: true, status: true } },
      },
    }),
    prisma.supportCase.groupBy({
      by: ["courseId"],
      where: { courseId: { in: ids }, status: "IN_PROGRESS" },
      _count: { _all: true },
    }),
    prisma.submission.findMany({
      where: { status: "SUBMITTED", assignment: { courseId: { in: ids } } },
      select: { assignment: { select: { courseId: true } } },
    }),
    prisma.quizAttempt.findMany({
      where: { status: "AWAITING_REVIEW", quiz: { courseId: { in: ids } } },
      select: { quiz: { select: { courseId: true } } },
    }),
  ]);

  const enrolByCourse = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const list = enrolByCourse.get(e.courseId) ?? [];
    list.push(e);
    enrolByCourse.set(e.courseId, list);
  }

  const casesByCourse = new Map(supportCases.map((s) => [s.courseId, s._count._all]));

  const ungradedByCourse = new Map<string, number>();
  for (const s of submissions) {
    const id = s.assignment.courseId;
    ungradedByCourse.set(id, (ungradedByCourse.get(id) ?? 0) + 1);
  }
  for (const a of attempts) {
    const id = a.quiz.courseId;
    ungradedByCourse.set(id, (ungradedByCourse.get(id) ?? 0) + 1);
  }

  return courses.map((course) => {
    const enrolled = enrolByCourse.get(course.id) ?? [];

    const standing = courseStanding({
      days: course.days,
      closedAt: course.closedAt,
      enrollments: enrolled,
      openSupportCases: casesByCourse.get(course.id) ?? 0,
      ungraded: ungradedByCourse.get(course.id) ?? 0,
    });

    let required = 0;
    let effective = 0;
    let coachesShort = 0;
    let daysTaken = 0;

    for (const e of enrolled) {
      const summary = summariseAttendance({
        days: course.days,
        attendance: e.attendance,
        makeUps: e.makeUps,
        track: e.track,
        joinedAt: e.joinedAt,
        leftAt: e.leftAt,
      });
      required += summary.requiredMinutes;
      effective += summary.effectiveMinutes;
      if (summary.unaccountedMinutes > 0) coachesShort += 1;
      daysTaken = Math.max(daysTaken, summary.daysTaken);
    }

    // A coach who transferred out or withdrew has their answer already; the
    // cohort isn't waiting on a result for them.
    const resultsDue = enrolled.filter(
      (e) => e.outcome !== "TRANSFERRED" && e.outcome !== "WITHDRAWN",
    ).length;
    const resultsIn = enrolled.filter(
      (e) => e.outcome !== "IN_PROGRESS" && e.outcome !== "TRANSFERRED" && e.outcome !== "WITHDRAWN",
    ).length;

    return {
      id: course.id,
      title: course.title,
      season: course.season,
      published: course.published,
      standing,
      coaches: enrolled.length,
      days: course.days.length,
      daysTaken,
      attendancePct: required > 0 ? Math.min(100, Math.round((effective / required) * 100)) : null,
      coachesShort,
      resultsIn,
      resultsDue,
    };
  });
}
