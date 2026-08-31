import "server-only";

import { summariseAttendance, type AttendanceSummary } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { courseResult, type CourseResult } from "@/lib/support-rubric";
import type { CourseOutcome, EnrollmentTrack, SupportCaseStatus, User } from "@prisma-client";

/**
 * Where every coach stands, one row per enrolment.
 *
 * The register answers this for one course, and a coach who missed Day 6 on the
 * Sunshine Coast and is sitting it at Gold Coast Knights appears on two of them
 * with no page holding both. So the row here is the enrolment, not the person:
 * a coach on two courses is two rows, because they are two different standings
 * and averaging them would describe neither.
 *
 * Every figure is computed by the same functions the register uses —
 * `summariseAttendance` for hours, `courseResult` for the verdict — so this is
 * a second view of the register rather than a second opinion about it.
 */
export type CoachRow = {
  /** Enrolment id, or the user id for a coach on no course at all. */
  key: string;
  user: Pick<User, "id" | "name" | "email" | "active" | "title" | "photoId">;
  enrolment: {
    id: string;
    courseId: string;
    courseTitle: string;
    /// The title with its qualification prefix taken off, for a table cell.
    courseShort: string;
    qualification: string | null;
    track: EnrollmentTrack;
    clubName: string | null;
    catchUpNote: string | null;
    outcome: CourseOutcome;
    /// The days they were actually on this course, when that wasn't all of it.
    joinedAt: Date | null;
    leftAt: Date | null;
    /// Both ends of a move, so a coach's hours can be followed either way.
    transferredTo: { courseId: string; courseTitle: string } | null;
    transferredFrom: { courseId: string; courseTitle: string } | null;
    attendanceMet: boolean | null;
    journalComplete: boolean | null;
    readiness: string | null;
    deliveries: number;
    hours: AttendanceSummary;
    result: CourseResult;
    /** An open or closed support case on this course, if there is one. */
    supportCase: { id: string; status: SupportCaseStatus } | null;
  } | null;
};

/**
 * A course title short enough to sit in a table cell.
 *
 * FQ titles a course by everything about it — "AFC / Football Australia B
 * Diploma — Regional @ Gold Coast" — which is right on the course's own page
 * and hopeless in a column beside eight others, where the half that identifies
 * it is the half that gets wrapped away. The qualification goes on a line of
 * its own instead.
 */
export function shortCourseTitle(title: string): string {
  const parts = title.split(" — ");
  return parts.length > 1 ? parts[parts.length - 1] : title;
}

export type CoachFilters = {
  /**
   * The courses the viewer may see, or null for every course.
   *
   * An educator's roster is the courses they are rostered onto. Applied before
   * the course filter, not instead of it: asking for a course outside the scope
   * has to return nothing rather than everything.
   */
  scope?: string[] | null;
  courseId?: string;
  /** An outcome, or "SHORT" for anybody with hours missing and nothing raised. */
  outcome?: string;
  query?: string;
};

/** Everything the outcome filter offers, in the order the register thinks. */
export const ROSTER_OUTCOMES = [
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "PASSED", label: "Passed" },
  { value: "POST_COURSE_SUPPORT", label: "Post-course support" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "SHORT", label: "Hours unaccounted" },
] as const;

function matches(row: CoachRow, query: string): boolean {
  const haystack = [
    row.user.name,
    row.user.email,
    row.enrolment?.clubName,
    row.enrolment?.courseTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export async function getCoachRoster(filters: CoachFilters = {}): Promise<CoachRow[]> {
  const { courseId, outcome, query, scope = null } = filters;
  if (courseId && scope !== null && !scope.includes(courseId)) return [];

  const within = scope === null ? {} : { courseId: { in: scope } };

  const [enrollments, cases, unenrolled] = await Promise.all([
    prisma.enrollment.findMany({
      where: courseId ? { courseId } : within,
      include: {
        user: true,
        attendance: true,
        makeUps: true,
        course: {
          select: {
            id: true,
            title: true,
            qualification: true,
            ratingThreshold: true,
            days: true,
          },
        },
        transferredTo: { select: { courseId: true, course: { select: { title: true } } } },
        transferredFrom: { select: { courseId: true, course: { select: { title: true } } } },
        _count: { select: { deliveries: true } },
      },
    }),
    prisma.supportCase.findMany({
      where: within,
      select: { id: true, userId: true, courseId: true, status: true },
    }),
    // A coach with an account and no course is still somebody's problem — they
    // were added for an intake that hasn't started, or their enrolment never
    // happened. Filtering to one course is asking about that course, so they
    // drop out of the answer then.
    // An educator's list is their courses; a coach on none of them is not
    // theirs to see, so the unenrolled only appear for an admin.
    courseId || scope !== null
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { role: "COACH", enrollments: { none: {} } },
          orderBy: [{ name: "asc" }, { email: "asc" }],
        }),
  ]);

  const rows: CoachRow[] = enrollments.map((e) => ({
    key: e.id,
    user: e.user,
    enrolment: {
      id: e.id,
      courseId: e.courseId,
      courseTitle: e.course.title,
      courseShort: shortCourseTitle(e.course.title),
      qualification: e.course.qualification,
      track: e.track,
      clubName: e.clubName,
      catchUpNote: e.catchUpNote,
      outcome: e.outcome,
      joinedAt: e.joinedAt,
      leftAt: e.leftAt,
      transferredTo: e.transferredTo
        ? { courseId: e.transferredTo.courseId, courseTitle: e.transferredTo.course.title }
        : null,
      transferredFrom: e.transferredFrom
        ? { courseId: e.transferredFrom.courseId, courseTitle: e.transferredFrom.course.title }
        : null,
      attendanceMet: e.attendanceMet,
      journalComplete: e.journalComplete,
      readiness: e.readiness,
      deliveries: e._count.deliveries,
      hours: summariseAttendance({
        days: e.course.days,
        attendance: e.attendance,
        makeUps: e.makeUps,
        track: e.track,
        joinedAt: e.joinedAt,
        leftAt: e.leftAt,
      }),
      result: courseResult({
        courseId: e.courseId,
        rating: e.rating,
        outcome: e.outcome,
        course: { title: e.course.title, ratingThreshold: e.course.ratingThreshold },
      }),
      supportCase:
        cases.find((c) => c.userId === e.userId && c.courseId === e.courseId) ?? null,
    },
  }));

  for (const user of unenrolled) rows.push({ key: user.id, user, enrolment: null });

  const filtered = rows.filter((row) => {
    if (outcome === "SHORT") {
      if (!row.enrolment || row.enrolment.hours.unaccountedMinutes === 0) return false;
    } else if (outcome && row.enrolment?.outcome !== outcome) {
      return false;
    }
    if (query && !matches(row, query.trim().toLowerCase())) return false;
    return true;
  });

  // By coach, then by course — so a coach on two courses reads as two lines of
  // one story rather than turning up twice in different halves of the list.
  return filtered.sort(
    (a, b) =>
      (a.user.name ?? a.user.email).localeCompare(b.user.name ?? b.user.email) ||
      (a.enrolment?.courseTitle ?? "").localeCompare(b.enrolment?.courseTitle ?? ""),
  );
}
