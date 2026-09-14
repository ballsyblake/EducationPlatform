/**
 * Where a cohort stands: delivered, finished, or still owing somebody
 * something.
 *
 * A course had no end of any kind. It was published or not, forever, and the
 * Manage page was every cohort ever run in one flat list — the nine 2026 B
 * Diplomas beside a draft from last year, with nothing to say which were live.
 * Worse, nothing anywhere asked the question a cohort ends on: is there a
 * result for every coach, are the hours settled, did everyone who needed a
 * support case get one. Those answers existed on four different screens and
 * nobody was prompted to go and read them.
 *
 * No database access, so the course page, the course list and anything that
 * comes later all count the same things.
 */
import { summariseAttendance, type MakeUpLike } from "./attendance";
import type { CourseOutcome, EnrollmentTrack } from "@prisma-client";

/**
 * The last day the register has scheduled.
 *
 * Derived rather than stored, unlike `supportDeadline`, and for the opposite
 * reason: a support deadline grants a coach time and must not move when a
 * register is corrected, but "when did delivery finish" *should* move — if a
 * tenth day is added, delivery finished later. The register is the authority on
 * its own dates.
 */
export function lastDayOf(days: { date: Date }[]): Date | null {
  return days.reduce<Date | null>(
    (latest, d) => (latest === null || d.date > latest ? d.date : latest),
    null,
  );
}

export type StandingEnrollment = {
  outcome: CourseOutcome;
  track?: EnrollmentTrack;
  joinedAt?: Date | null;
  leftAt?: Date | null;
  attendance: { courseDayId: string; minutes: number }[];
  makeUps: MakeUpLike[];
};

export type StandingInput = {
  days: { id: string; date: Date; startTime: string | null; endTime: string | null }[];
  closedAt: Date | null;
  enrollments: StandingEnrollment[];
  /** Post-course support cases still open on this course. */
  openSupportCases: number;
  /** Submissions and quiz attempts waiting on a marker. */
  ungraded: number;
};

export type OutstandingItem = {
  key: "results" | "hours" | "debts" | "support" | "grading";
  label: string;
  count: number;
  /** What it would take to clear it, written for whoever has to do it. */
  blurb: string;
};

export type CourseStanding = {
  lastDay: Date | null;
  /** The last scheduled day has been and gone. */
  delivered: boolean;
  closed: boolean;
  /** Only the things with a non-zero count, in the order they get dealt with. */
  outstanding: OutstandingItem[];
  /** Nothing left owing. Not the same as closed — somebody still has to say so. */
  ready: boolean;
};

/**
 * An outcome that still needs a person to decide it.
 *
 * `TRANSFERRED` and `WITHDRAWN` are decisions already taken, and a coach who
 * moved intakes is the destination cohort's to finish, not this one's.
 */
function awaitingResult(outcome: CourseOutcome): boolean {
  return outcome === "IN_PROGRESS";
}

export function courseStanding(input: StandingInput, now: Date = new Date()): CourseStanding {
  const { days, closedAt, enrollments, openSupportCases, ungraded } = input;

  const lastDay = lastDayOf(days);

  let awaitingResults = 0;
  let withUnaccounted = 0;
  let withDebt = 0;

  for (const e of enrollments) {
    if (awaitingResult(e.outcome)) awaitingResults += 1;

    const summary = summariseAttendance({
      days,
      attendance: e.attendance,
      makeUps: e.makeUps,
      track: e.track,
      joinedAt: e.joinedAt,
      leftAt: e.leftAt,
    });
    // The ledger's own distinction, kept: hours nobody has looked at are a
    // different job from hours somebody is already chasing, and rolling them
    // into one number here would undo the point of holding them apart.
    if (summary.unaccountedMinutes > 0) withUnaccounted += 1;
    if (summary.outstandingMinutes > 0) withDebt += 1;
  }

  const all: OutstandingItem[] = [
    {
      key: "results",
      label: "without a result",
      count: awaitingResults,
      blurb: "Rate them on the register, or record why they didn't finish.",
    },
    {
      key: "hours",
      label: "with hours nobody has looked at",
      count: withUnaccounted,
      blurb: "Raise a make-up, or mark the time as covered.",
    },
    {
      key: "debts",
      label: "with hours still owed",
      count: withDebt,
      blurb: "Arrange the make-up, credit it, or write it off.",
    },
    {
      key: "support",
      label: "open support cases",
      count: openSupportCases,
      blurb: "Each one needs an assessment, an extension, or closing.",
    },
    {
      key: "grading",
      label: "pieces of work unmarked",
      count: ungraded,
      blurb: "Sitting in the grading queue.",
    },
  ];

  const outstanding = all.filter((o) => o.count > 0);

  return {
    lastDay,
    delivered: lastDay !== null && lastDay < now,
    closed: closedAt !== null,
    outstanding,
    ready: outstanding.length === 0,
  };
}
