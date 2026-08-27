/**
 * Course hours: what a day is worth, what a coach has done, and what they owe.
 *
 * No database access and no framework, so the register grid, the make-ups desk
 * and the coach's own page all total the same way rather than three
 * approximations of it.
 *
 * Everything is in minutes. A B Diploma day runs 08:30–16:30 or 11:00–19:00 —
 * eight hours either way, seventy-two across the nine days — and the registers
 * record shortfalls in hours and half hours, so minutes is the smallest unit
 * that never rounds.
 */
import type { EnrollmentTrack, MakeUpStatus } from "@prisma-client";

/** A wall-clock label — "08:30" — as minutes past midnight. */
function clockMinutes(label: string | null): number | null {
  if (!label) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * How long a course day is scheduled for.
 *
 * Queensland keeps no daylight saving, so a day that starts at 08:30 and ends
 * at 16:30 is eight hours with no arithmetic to get wrong. A day with no times
 * recorded is worth nothing rather than a guessed eight hours: an invented
 * denominator would put every coach on that course into debt for a day nobody
 * has said the length of.
 */
export function dayMinutes(day: { startTime: string | null; endTime: string | null }): number {
  const start = clockMinutes(day.startTime);
  const end = clockMinutes(day.endTime);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

/** Minutes as the registers write them: "8 h", "7.5 h", "90 min". */
export function formatHours(minutes: number): string {
  if (minutes === 0) return "0";
  if (Math.abs(minutes) < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

/* --------------------------------- Debts ---------------------------------- */

export type MakeUpLike = {
  minutesOwed: number;
  minutesCredited: number;
  status: MakeUpStatus;
};

/** What is still outstanding on one debt. Never negative. */
export function makeUpBalance(m: MakeUpLike): number {
  if (m.status === "COMPLETED" || m.status === "WAIVED") return 0;
  return Math.max(0, m.minutesOwed - m.minutesCredited);
}

/** Whether a debt is settled by its own numbers, whatever its status says. */
export function isCovered(m: MakeUpLike): boolean {
  return m.minutesCredited >= m.minutesOwed;
}

export const MAKE_UP_STATUS: Record<
  MakeUpStatus,
  { label: string; tone: "bad" | "warn" | "good" | "muted"; blurb: string }
> = {
  OWED: {
    label: "Owed",
    tone: "bad",
    blurb: "Nothing arranged yet.",
  },
  ARRANGED: {
    label: "Arranged",
    tone: "warn",
    blurb: "A day has been found — not sat yet.",
  },
  COMPLETED: {
    label: "Made up",
    tone: "good",
    blurb: "Covered in full.",
  },
  WAIVED: {
    label: "Waived",
    tone: "muted",
    blurb: "Written off by an educator.",
  },
};

/* -------------------------------- Summary --------------------------------- */

export type AttendanceSummary = {
  /** The hours a coach on this track is expected to sit, for days taken so far. */
  requiredMinutes: number;
  /** Hours sat on this course. */
  attendedMinutes: number;
  /** Hours credited from elsewhere, through the make-up ledger. */
  creditedMinutes: number;
  /**
   * Everything ever raised on the ledger against this enrolment, settled or
   * not — including hours an educator waived.
   *
   * Waived hours are covered by a decision rather than by attendance, so they
   * count here and nowhere else: without this, writing a debt off would push
   * the same hours straight back into `unaccountedMinutes` the moment it was
   * settled.
   */
  raisedMinutes: number;
  /** Attended plus credited — what the coach actually has to their name. */
  effectiveMinutes: number;
  /** Open debt: raised, and not yet covered. */
  outstandingMinutes: number;
  /**
   * Time missing that nobody has raised a debt for.
   *
   * The distinction that makes this worth keeping. A coach eight hours short
   * with a make-up arranged is being dealt with; a coach eight hours short with
   * nothing on the ledger is the one an educator needs to see.
   */
  unaccountedMinutes: number;
  daysMarked: number;
  daysTaken: number;
  /** Effective hours as a share of required, or null before any day is taken. */
  percent: number | null;
};

/**
 * Rolls one enrolment's hours up.
 *
 * `days` is the days the register has actually taken — not every day on the
 * course. A course in its first block has days four to nine unmarked for
 * everybody, and counting them would put the entire roster forty-eight hours
 * short of a standard nobody has been measured against yet.
 *
 * A catch-up enrolment has no requirement of its own. It exists to host hours
 * owed on another course, and measuring it against a full nine days would show
 * every visiting coach as barely attending.
 */
export function summariseAttendance(input: {
  days: { id: string; startTime: string | null; endTime: string | null }[];
  attendance: { courseDayId: string; minutes: number }[];
  makeUps: MakeUpLike[];
  track?: EnrollmentTrack;
}): AttendanceSummary {
  const { days, attendance, makeUps, track = "MAIN" } = input;

  const marked = new Map(attendance.map((a) => [a.courseDayId, a.minutes]));
  const takenDays = days.filter((d) => marked.has(d.id));

  const requiredMinutes =
    track === "CATCH_UP" ? 0 : takenDays.reduce((sum, d) => sum + dayMinutes(d), 0);
  const attendedMinutes = attendance.reduce((sum, a) => sum + a.minutes, 0);
  const creditedMinutes = makeUps.reduce((sum, m) => sum + m.minutesCredited, 0);
  const outstandingMinutes = makeUps.reduce((sum, m) => sum + makeUpBalance(m), 0);

  const effectiveMinutes = attendedMinutes + creditedMinutes;

  // Everything raised against this enrolment, settled or not. What is missing
  // beyond that is what nobody has looked at.
  const raised = makeUps.reduce((sum, m) => sum + m.minutesOwed, 0);
  const gap = Math.max(0, requiredMinutes - attendedMinutes);
  const unaccountedMinutes = Math.max(0, gap - raised);

  return {
    requiredMinutes,
    attendedMinutes,
    creditedMinutes,
    raisedMinutes: raised,
    effectiveMinutes,
    outstandingMinutes,
    unaccountedMinutes,
    daysMarked: attendance.filter((a) => a.minutes > 0).length,
    daysTaken: takenDays.length,
    percent:
      requiredMinutes > 0
        ? Math.min(100, Math.round((effectiveMinutes / requiredMinutes) * 100))
        : null,
  };
}

/**
 * The shortfall on one day: what was scheduled, less what was sat.
 *
 * Used when opening a debt off the register, so the figure comes from the day
 * rather than from whoever is typing.
 */
export function shortfallOnDay(
  day: { startTime: string | null; endTime: string | null },
  minutesAttended: number,
): number {
  return Math.max(0, dayMinutes(day) - minutesAttended);
}
