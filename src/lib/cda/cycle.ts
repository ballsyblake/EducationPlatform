/**
 * The club submission window: when a cycle opens to clubs, and when their
 * entries are due.
 *
 * These dates inform; they do not enforce. What actually stops a club editing
 * is the assessment's own status — `clubCanEdit` — and what closes entry for
 * everybody is the Unit moving the cycle to Assessing. Both are acts a person
 * takes. Football Queensland will accept a late submission from a club that
 * rang to explain, and a form that locked itself on a date would refuse work FQ
 * wants, silently, on a Saturday, with nobody to appeal to.
 *
 * What the dates are for is knowing. A club that never sees a due date submits
 * whenever it gets round to it; a Unit with no due date has no way to say which
 * of forty-eight clubs is late, and every notification FQ sends about it goes
 * out by hand.
 */
import { daysUntil } from "./review";

/** How close counts as closing soon, for the club's own countdown. */
export const CLOSING_SOON_DAYS = 7;

export type SubmissionStage =
  /** No timetable has been set for this cycle. */
  | "NO_DATES"
  /** Published, but not open to clubs yet. */
  | "BEFORE_OPEN"
  /** Open, with time in hand. */
  | "OPEN"
  /** Open, inside the last week. */
  | "CLOSING_SOON"
  /** The due date has passed. Late, not barred. */
  | "CLOSED";

export type SubmissionWindow = {
  stage: SubmissionStage;
  opensAt: Date | null;
  closesAt: Date | null;
  /** Whole days until the due date. Negative once past, null with no date. */
  daysLeft: number | null;
  overdue: boolean;
  tone: "muted" | "info" | "warn" | "bad";
};

export type CycleDates = { opensAt: Date | null; closesAt: Date | null };

/**
 * Where a cycle sits against its own timetable.
 *
 * A cycle with no dates set is `NO_DATES` rather than open or closed: FQ has
 * run years where the timetable lived in an email, and inventing a deadline for
 * them would put clubs in a state nobody put them in.
 */
export function submissionWindow(cycle: CycleDates, now: Date = new Date()): SubmissionWindow {
  const { opensAt, closesAt } = cycle;

  const base = { opensAt, closesAt, overdue: false } as const;

  if (!closesAt && !opensAt) {
    return { ...base, stage: "NO_DATES", daysLeft: null, tone: "muted" };
  }

  if (opensAt && now < opensAt) {
    return { ...base, stage: "BEFORE_OPEN", daysLeft: null, tone: "info" };
  }

  if (!closesAt) {
    return { ...base, stage: "OPEN", daysLeft: null, tone: "info" };
  }

  const daysLeft = daysUntil(closesAt, now);
  if (now > closesAt) {
    return { ...base, stage: "CLOSED", daysLeft, overdue: true, tone: "bad" };
  }
  if (daysLeft <= CLOSING_SOON_DAYS) {
    return { ...base, stage: "CLOSING_SOON", daysLeft, tone: "warn" };
  }
  return { ...base, stage: "OPEN", daysLeft, tone: "info" };
}

/**
 * How the window reads to a club that still has something to do.
 *
 * Past the date it says the club is late and to send it anyway, rather than
 * that submissions are closed — they aren't, and a club told they were would
 * stop trying and ring the Unit instead.
 */
export function submissionNote(w: SubmissionWindow, formatDate: (d: Date) => string): string | null {
  switch (w.stage) {
    case "BEFORE_OPEN":
      return w.opensAt ? `Entries open ${formatDate(w.opensAt)}.` : null;
    case "OPEN":
      return w.closesAt ? `Entries are due ${formatDate(w.closesAt)}.` : null;
    case "CLOSING_SOON":
      return w.closesAt
        ? `Entries are due ${formatDate(w.closesAt)} — ${
            w.daysLeft === 0 ? "today" : `${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"} left`
          }.`
        : null;
    case "CLOSED":
      return w.closesAt
        ? `Entries were due ${formatDate(w.closesAt)}. Send yours through anyway — Football Queensland would rather have it late than not at all.`
        : null;
    default:
      return null;
  }
}
