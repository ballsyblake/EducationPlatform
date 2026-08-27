/**
 * Football Queensland's review and appeal cycle, as arithmetic.
 *
 * No database access and no framework: every deadline and every quota in the
 * process is derived here, so the club's countdown, the Unit's queue and the
 * server-side guards all read the same clock rather than three approximations
 * of it.
 *
 * FQ's process, quoted from the 2026 Club Development & Assessment Info Pack:
 *
 *   "Clubs can submit their review request with specific comments within eight
 *   (8) days… Tier 1 - A maximum of 9-line items will be reviewed… A score
 *   review can be requested for a maximum of 1 review for Technical Staff
 *   Qualifications, 3-line items in the Planning, 3-line items in the Delivery,
 *   and 2-line items in the Outcome section. Please note, clubs in Pool B can
 *   only review 1x Planning Item… Tier 2 - A maximum of 6-line items… 1 review
 *   for Technical Staff Qualifications, 2-line items in the Planning, 2-line
 *   items in the Delivery, and 1-line item in the Outcome section… the FQ Club
 *   Development Unit provides detailed feedback… within 10 working days. Clubs
 *   can appeal the outcome of the review within three (3) days to the CEO… The
 *   CEO has eight (8) working days to respond and revise or preserve the
 *   score." (pp. 9, 20)
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
 * What a club may put up for review, given its tier and pool.
 *
 * FQ sets this three ways at once — a per-domain quota, a stated total, and a
 * Pool B exception on Planning — so it is a function of the club rather than a
 * constant. The 2026 pack cut Tier 1's Planning and Delivery allowances from
 * four to three, on the finding that only 32% of such requests moved a score.
 *
 * Technical Staff Qualifications is now among them. An earlier reading of this
 * module excluded it, on the reasoning that the Technical score is computed
 * from the staff register and so carries no opinion to review. FQ allows one
 * anyway, in both tiers, and they are right to: what a club disputes is how a
 * qualification was read, which is a judgement even though the arithmetic after
 * it is not.
 */
export type ReviewAllowance = {
  /** Line-item quotas by domain. */
  quotas: Partial<Record<Domain, number>>;
  /** Whether the Technical Staff Qualifications score may also be put up. */
  technical: boolean;
  /** Everything the club may put forward, Technical included. */
  maxItems: number;
  /** For the copy on the page: which rule set produced this. */
  tier: "T1" | "T2";
  poolLimited: boolean;
};

/** FQ's stated ceilings, before the Pool B exception narrows Planning. */
const STATED_TOTAL = { T1: 9, T2: 6 } as const;

export function reviewAllowance(club: {
  tierCode?: string | null;
  poolName?: string | null;
}): ReviewAllowance {
  const tier = String(club.tierCode ?? "T1").toUpperCase() === "T2" ? "T2" : "T1";

  // Pool applies to Tier 1 only; Tier 2 clubs are not pooled.
  const poolLimited =
    tier === "T1" && /^(pool\s*)?b$/i.test(String(club.poolName ?? "").trim());

  const quotas: Partial<Record<Domain, number>> =
    tier === "T2"
      ? { PLANNING: 2, DELIVERY: 2, OUTCOMES: 1 }
      : { PLANNING: poolLimited ? 1 : 3, DELIVERY: 3, OUTCOMES: 2 };

  // The stated total is a ceiling, not a promise. Where the per-domain quotas
  // cannot reach it — a Pool B club can only ever put forward seven — the sum
  // is what the club is told, because advertising headroom nobody can use is
  // just a worse way of saying seven.
  const reachable = Object.values(quotas).reduce((sum, n) => sum + n, 0) + 1;

  return {
    quotas,
    technical: true,
    maxItems: Math.min(STATED_TOTAL[tier], reachable),
    tier,
    poolLimited,
  };
}

/** The Tier 1, non-Pool-B allowance. For copy and tests that need a default. */
export const DEFAULT_ALLOWANCE = reviewAllowance({});

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
  /** Everything selected, the Technical review included. */
  total: number;
};

export type Selection = {
  domains: Domain[];
  /** Whether the club has also put the Technical Qualifications score up. */
  technical?: boolean;
};

/** Checks a proposed selection against the club's per-domain and overall caps. */
export function checkQuota(selection: Selection, allowance: ReviewAllowance): QuotaCheck {
  const { domains, technical = false } = selection;

  const used: Partial<Record<Domain, number>> = {};
  for (const d of domains) used[d] = (used[d] ?? 0) + 1;

  const remaining: Partial<Record<Domain, number>> = {};
  for (const [domain, allowed] of Object.entries(allowance.quotas) as [Domain, number][]) {
    remaining[domain] = allowed - (used[domain] ?? 0);
  }

  const total = domains.length + (technical ? 1 : 0);
  const fail = (message: string): QuotaCheck => ({ ok: false, message, used, remaining, total });

  for (const [domain, count] of Object.entries(used) as [Domain, number][]) {
    const allowed = allowance.quotas[domain];
    if (allowed === undefined) {
      return fail(`${DOMAIN_WORD[domain] ?? domain} line items can't be put up for review.`);
    }
    if (count > allowed) {
      const because =
        domain === "PLANNING" && allowance.poolLimited
          ? " Pool B clubs get one, because their Planning is only part-reassessed."
          : "";
      return fail(
        `You can put forward at most ${allowed} ${DOMAIN_WORD[domain]} item${
          allowed === 1 ? "" : "s"
        }; you've selected ${count}.${because}`,
      );
    }
  }

  if (technical && !allowance.technical) {
    return fail("The Technical Staff Qualifications score isn't reviewable on this assessment.");
  }

  if (total > allowance.maxItems) {
    return fail(
      `Football Queensland reviews at most ${allowance.maxItems} items on a ${
        allowance.tier === "T2" ? "Tier 2" : "Tier 1"
      } assessment; you've selected ${total}.`,
    );
  }

  if (total === 0) {
    return fail("Choose at least one line item to put forward.");
  }

  return { ok: true, used, remaining, total };
}

const DOMAIN_WORD: Partial<Record<Domain, string>> = {
  PLANNING: "Planning",
  DELIVERY: "Delivery",
  OUTCOMES: "Outcomes",
};

/** The domains a club may put items forward from. */
export const REVIEWABLE_DOMAINS: Domain[] = ["PLANNING", "DELIVERY", "OUTCOMES"];

export { DOMAIN_WORD as REVIEW_DOMAIN_WORD };

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
