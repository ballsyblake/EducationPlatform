/**
 * Football Queensland's review and appeal cycle, as arithmetic.
 *
 * No database access and no framework: every deadline and every quota in the
 * process is derived here, so the club's countdown, the Unit's queue and the
 * server-side guards all read the same clock rather than three approximations
 * of it.
 *
 * FQ's process, quoted from the assessment document:
 *
 *   "Clubs can submit their review request with specific comments regarding
 *   areas they request a review of within 8 days… A score review can be
 *   requested for a maximum of 4-line items in the Planning, 4-line items in
 *   the Delivery, and 2-line items in the Outcome section. A maximum of
 *   10-line items will be reviewed… If there is no review request, the club
 *   assessment score is set and final (Confirmed) after the review timeframe
 *   has lapsed… the Club Development and Assessment Unit provides detailed
 *   feedback… within 10 working days. Clubs can appeal the outcome of the
 *   review within 3 working days to the CEO… The CEO has 8 working days to
 *   respond and revise or preserve the score."
 */
import type { Domain, Shield } from "@prisma-client";

/* -------------------------------------------------------------------------- */
/* The published timetable                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Calendar days, not working days — FQ says "within 8 days" here and "working
 * days" everywhere else in the same paragraph, and the distinction is theirs.
 */
export const REVIEW_REQUEST_DAYS = 8;

/** Working days for the Unit to respond on every item. */
export const REVIEW_RESPONSE_WORKING_DAYS = 10;

/** Working days for the club to take the outcome to the CEO. */
export const APPEAL_REQUEST_WORKING_DAYS = 3;

/** Working days for the CEO to rule. */
export const APPEAL_RESPONSE_WORKING_DAYS = 8;

/**
 * How many line items a club may put up for review, by domain.
 *
 * Technical Qualifications is absent on purpose. It is computed from the staff
 * register rather than judged by an assessor, so a wrong Technical score is
 * fixed by correcting the register — there is no opinion to review.
 */
export const REVIEW_QUOTAS: Partial<Record<Domain, number>> = {
  PLANNING: 4,
  DELIVERY: 4,
  OUTCOMES: 2,
};

/**
 * The overall cap. It happens to equal the sum of the per-domain quotas, but FQ
 * states it separately, so it is enforced separately: if they ever raise one
 * domain's allowance without restating the total, the total is what holds.
 */
export const REVIEW_MAX_ITEMS = 10;

/* -------------------------------------------------------------------------- */
/* Working days                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Adds working days, skipping weekends.
 *
 * Public holidays are not handled, and cannot be without a Queensland holiday
 * calendar that somebody keeps current. The effect is that a deadline falling
 * either side of a public holiday is shown a day or two early — which errs
 * towards the club having less time than FQ intends, so the Unit should treat
 * these as guidance rather than as an automatic bar. Nothing in this module
 * refuses an action on a deadline; they drive display and warnings only.
 */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

/** Adds calendar days. */
export function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Whole days from now until `deadline`; negative once it has passed. */
export function daysUntil(deadline: Date, now: Date = new Date()): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Where a club is in the process                                             */
/* -------------------------------------------------------------------------- */

export type ReviewStage =
  /** Not released, so nothing to review yet. */
  | "NOT_RELEASED"
  /** Preliminary rating out, review window open. */
  | "WINDOW_OPEN"
  /** Window closed with no request. The rating confirms itself. */
  | "WINDOW_LAPSED"
  /** Club has asked; the Unit owes a response. */
  | "AWAITING_RESPONSE"
  /** Unit has answered; the club may appeal. */
  | "APPEAL_WINDOW_OPEN"
  /** Appeal window closed without one. The rating confirms itself. */
  | "APPEAL_WINDOW_LAPSED"
  /** With the CEO. */
  | "AWAITING_APPEAL_DECISION"
  /** Confirmed. Nowhere further to go. */
  | "CONFIRMED";

export type ReviewTimeline = {
  stage: ReviewStage;
  /** What has to happen next, and by when. Null once confirmed. */
  deadline: Date | null;
  /** Whole days left against that deadline. Negative once overdue. */
  daysLeft: number | null;
  overdue: boolean;
  /** True when the club may still submit a request. */
  canRequestReview: boolean;
  /** True when the club may still appeal. */
  canAppeal: boolean;
  /**
   * True when the rating is settled and should be marked Confirmed. Includes
   * the two lapsed cases, which need no action from anyone — FQ confirms by the
   * clock running out, not by a decision.
   */
  shouldConfirm: boolean;
};

export type ReviewTimelineInput = {
  status: string;
  publishedAt: Date | null;
  review: {
    status: string;
    submittedAt: Date;
    respondedAt: Date | null;
    appealedAt: Date | null;
    appealDecidedAt: Date | null;
  } | null;
};

/**
 * Works out where an assessment sits in the cycle and what is owed next.
 *
 * Every stage is derived from timestamps rather than read from the status
 * column, because two of the transitions happen by a deadline passing and
 * nobody is there to write a row when it does. The status column is the record
 * of what has been *done*; this is the record of where things stand.
 */
export function reviewTimeline(
  input: ReviewTimelineInput,
  now: Date = new Date(),
): ReviewTimeline {
  const settled = (stage: ReviewStage): ReviewTimeline => ({
    stage,
    deadline: null,
    daysLeft: null,
    overdue: false,
    canRequestReview: false,
    canAppeal: false,
    shouldConfirm: stage !== "CONFIRMED",
  });

  const waiting = (
    stage: ReviewStage,
    deadline: Date,
    opts: { canRequestReview?: boolean; canAppeal?: boolean } = {},
  ): ReviewTimeline => ({
    stage,
    deadline,
    daysLeft: daysUntil(deadline, now),
    overdue: now > deadline,
    canRequestReview: opts.canRequestReview ?? false,
    canAppeal: opts.canAppeal ?? false,
    shouldConfirm: false,
  });

  if (input.status === "CONFIRMED") return settled("CONFIRMED");
  if (!input.publishedAt) {
    return {
      stage: "NOT_RELEASED",
      deadline: null,
      daysLeft: null,
      overdue: false,
      canRequestReview: false,
      canAppeal: false,
      shouldConfirm: false,
    };
  }

  const review = input.review;

  if (!review) {
    const deadline = addDays(input.publishedAt, REVIEW_REQUEST_DAYS);
    if (now > deadline) return settled("WINDOW_LAPSED");
    return waiting("WINDOW_OPEN", deadline, { canRequestReview: true });
  }

  if (review.appealDecidedAt) return settled("CONFIRMED");

  if (review.appealedAt) {
    return waiting(
      "AWAITING_APPEAL_DECISION",
      addWorkingDays(review.appealedAt, APPEAL_RESPONSE_WORKING_DAYS),
    );
  }

  if (review.respondedAt) {
    const deadline = addWorkingDays(review.respondedAt, APPEAL_REQUEST_WORKING_DAYS);
    if (now > deadline) return settled("APPEAL_WINDOW_LAPSED");
    return waiting("APPEAL_WINDOW_OPEN", deadline, { canAppeal: true });
  }

  // The Unit's own deadline. Note it does not expire into anything: an overdue
  // response is FQ's problem to chase, and confirming a rating because the Unit
  // was slow would penalise the club for it.
  return waiting(
    "AWAITING_RESPONSE",
    addWorkingDays(review.submittedAt, REVIEW_RESPONSE_WORKING_DAYS),
  );
}

/* -------------------------------------------------------------------------- */
/* Quotas                                                                     */
/* -------------------------------------------------------------------------- */

export type QuotaCheck = {
  ok: boolean;
  /** Human-readable reason, when not ok. */
  message?: string;
  /** How many of each domain's allowance is used. */
  used: Partial<Record<Domain, number>>;
  remaining: Partial<Record<Domain, number>>;
  total: number;
};

/** Checks a proposed selection against FQ's per-domain and overall caps. */
export function checkQuota(domains: Domain[]): QuotaCheck {
  const used: Partial<Record<Domain, number>> = {};
  for (const d of domains) used[d] = (used[d] ?? 0) + 1;

  const remaining: Partial<Record<Domain, number>> = {};
  for (const [domain, allowed] of Object.entries(REVIEW_QUOTAS) as [Domain, number][]) {
    remaining[domain] = allowed - (used[domain] ?? 0);
  }

  for (const [domain, count] of Object.entries(used) as [Domain, number][]) {
    const allowed = REVIEW_QUOTAS[domain];
    if (allowed === undefined) {
      return {
        ok: false,
        message: "Technical Qualifications isn't reviewable — correct the staff register instead.",
        used,
        remaining,
        total: domains.length,
      };
    }
    if (count > allowed) {
      return {
        ok: false,
        message: `You can put forward at most ${allowed} ${DOMAIN_WORD[domain]} items; you've selected ${count}.`,
        used,
        remaining,
        total: domains.length,
      };
    }
  }

  if (domains.length > REVIEW_MAX_ITEMS) {
    return {
      ok: false,
      message: `Football Queensland reviews at most ${REVIEW_MAX_ITEMS} line items; you've selected ${domains.length}.`,
      used,
      remaining,
      total: domains.length,
    };
  }

  if (domains.length === 0) {
    return {
      ok: false,
      message: "Choose at least one line item to put forward.",
      used,
      remaining,
      total: 0,
    };
  }

  return { ok: true, used, remaining, total: domains.length };
}

const DOMAIN_WORD: Partial<Record<Domain, string>> = {
  PLANNING: "Planning",
  DELIVERY: "Delivery",
  OUTCOMES: "Outcomes",
};

/** The domains a club may put items forward from. */
export const REVIEWABLE_DOMAINS = Object.keys(REVIEW_QUOTAS) as Domain[];

export const STAGE_LABELS: Record<ReviewStage, string> = {
  NOT_RELEASED: "Not released",
  WINDOW_OPEN: "Review window open",
  WINDOW_LAPSED: "Review window closed",
  AWAITING_RESPONSE: "Awaiting the Unit's response",
  APPEAL_WINDOW_OPEN: "Appeal window open",
  APPEAL_WINDOW_LAPSED: "Appeal window closed",
  AWAITING_APPEAL_DECISION: "With the CEO",
  CONFIRMED: "Confirmed",
};

/**
 * Whether the club's rating is settled, from the club's point of view.
 *
 * Not simply `status === "CONFIRMED"`. Football Queensland confirms by the
 * clock — "the club assessment score is set and final (Confirmed) after the
 * review timeframe has lapsed" — so a rating whose windows have all run out is
 * confirmed whether or not anyone has been back to the portal to record it.
 * Telling a club its rating is still preliminary because the Unit hasn't
 * pressed a button would withhold a shield FQ's own rules have already awarded.
 *
 * The status column still only moves when someone acts; this is what the club
 * is told, and the two are allowed to differ by exactly the length of the
 * Unit's admin backlog.
 */
export function ratingSettled(timeline: ReviewTimeline): boolean {
  return timeline.stage === "CONFIRMED" || timeline.shouldConfirm;
}

export type ReviewMovement = {
  percentBefore: number;
  shieldBefore: Shield | null;
  percentAfter: number;
  shieldAfter: Shield | null;
  changed: boolean;
};
