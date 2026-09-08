/**
 * What the cycle is waiting on the Club Development Unit for.
 *
 * Every notification Football Queensland sends goes out by hand, outside this
 * system, which makes this list the mechanism rather than a convenience: if
 * nothing here says "these four clubs are owed a response by Tuesday", nobody
 * knows to write to them. The alternative in practice is remembering which of
 * forty-eight windows closed and opening forty-eight pages to check.
 *
 * Derived, never stored. Every deadline comes from `reviewTimeline`, so this
 * agrees with the club's own countdown by construction rather than by two
 * places being kept in step.
 */
import { daysUntil } from "./review";
import { reviewTimeline, type ReviewTimelineInput } from "./review";

export type WorkRow = ReviewTimelineInput & {
  id: string;
  clubName: string;
};

export type WorkItem = {
  assessmentId: string;
  clubName: string;
  /** The deadline this item is measured against, where it has one. */
  deadline: Date | null;
  /** Whole days left. Negative once overdue. Null where nothing is counting. */
  daysLeft: number | null;
  overdue: boolean;
};

export type WorkGroup = {
  key: string;
  title: string;
  /** What the Unit actually has to do, in one line. */
  blurb: string;
  tone: "bad" | "warn" | "info";
  items: WorkItem[];
};

/** Soonest deadline first, then alphabetically. Undated items sort last. */
function byUrgency(a: WorkItem, b: WorkItem) {
  if (a.deadline && b.deadline) {
    const d = a.deadline.getTime() - b.deadline.getTime();
    if (d !== 0) return d;
  } else if (a.deadline !== b.deadline) {
    return a.deadline ? -1 : 1;
  }
  return a.clubName.localeCompare(b.clubName);
}

/**
 * Groups a cycle's assessments into the things the Unit owes somebody.
 *
 * Ordered by who is waiting and what it costs them. A club owed a review
 * response is on a clock FQ published and can do nothing until the Unit moves,
 * so it comes first; a club that hasn't submitted is holding up only itself and
 * comes last. Empty groups are dropped rather than rendered as reassuring
 * zeroes — a list of six headings with nothing under five of them is harder to
 * read than a list of one.
 */
export function unitWorkList(
  rows: WorkRow[],
  now: Date = new Date(),
  /**
   * The cycle's due date for club entries, where one is set. Only the
   * unsubmitted group is measured against it — every other deadline here
   * belongs to one club's own process rather than to the timetable.
   */
  entriesDueAt: Date | null = null,
): WorkGroup[] {
  const groups: Record<string, WorkItem[]> = {
    respond: [],
    appeal: [],
    notify: [],
    reconcile: [],
    confirm: [],
    unsubmitted: [],
  };

  for (const row of rows) {
    const t = reviewTimeline(row, now);
    const item: WorkItem = {
      assessmentId: row.id,
      clubName: row.clubName,
      deadline: t.deadline,
      daysLeft: t.daysLeft,
      overdue: t.overdue,
    };

    if (t.stage === "AWAITING_RESPONSE") groups.respond.push(item);
    else if (t.stage === "AWAITING_APPEAL_DECISION") groups.appeal.push(item);
    else if (t.stage === "AWAITING_NOTIFICATION") groups.notify.push(item);
    else if (t.shouldConfirm && row.status !== "CONFIRMED") groups.confirm.push(item);

    // Not from the timeline: these two sit before a rating exists at all.
    if (row.status === "RECONCILING") groups.reconcile.push(item);
    if (row.status === "NOT_STARTED" || row.status === "IN_PROGRESS") {
      groups.unsubmitted.push(
        entriesDueAt
          ? {
              ...item,
              deadline: entriesDueAt,
              daysLeft: daysUntil(entriesDueAt, now),
              overdue: now > entriesDueAt,
            }
          : item,
      );
    }
  }

  const shape: { key: string; title: string; blurb: string; tone: WorkGroup["tone"] }[] = [
    {
      key: "respond",
      title: "Reviews to answer",
      blurb: "The club is waiting on the Unit, inside FQ's 10 working days.",
      tone: "bad",
    },
    {
      key: "appeal",
      title: "Appeals with the CEO",
      blurb: "Eight working days from the appeal, and the club can do nothing until it lands.",
      tone: "bad",
    },
    {
      key: "notify",
      title: "Released — club not yet told",
      blurb:
        "The rating is in the portal and nobody has recorded writing to the club. Their eight days have not started.",
      tone: "warn",
    },
    {
      key: "reconcile",
      title: "Ready to reconcile",
      blurb: "Every assessor has submitted. Resolve the scores and lock.",
      tone: "warn",
    },
    {
      key: "confirm",
      title: "Windows closed — confirm the rating",
      blurb: "Settled under FQ's rules. Confirming is what lets the club display its shield.",
      tone: "info",
    },
    {
      key: "unsubmitted",
      title: "Clubs yet to submit",
      blurb: "Nothing can be scored until they do. Measured against the cycle's due date.",
      tone: "info",
    },
  ];

  return shape
    .map((g) => ({ ...g, items: groups[g.key].sort(byUrgency) }))
    .filter((g) => g.items.length > 0);
}
