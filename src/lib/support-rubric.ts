/**
 * Football Australia's B Diploma rubric, and the pure rules that read it.
 *
 * Kept clear of `server-only` and of any database import on purpose: the review
 * form is a client component, and it renders the same criteria, the same scale
 * and the same gate the server enforces on save. One definition, read from both
 * sides — see src/lib/support.ts for everything that touches the database.
 *
 * The criteria, the bands and the 2.5 pass mark are transcribed from the
 * `B - Rubric` sheet that ships inside every FQ attendance register. They are
 * Football Australia's, not Football Queensland's to reword mid-intake, which
 * is why they can sit in code at all — unlike the CDA rubric, which the Club
 * Development Unit does rewrite between cycles and which therefore lives in the
 * database.
 */
import type { SupportPathway } from "@prisma-client";

/* ------------------------------ The rubric -------------------------------- */

/**
 * What an educator rates a coach on.
 *
 * Seven criteria: engagement across the course as a whole, then six that apply
 * to a delivery on the grass. The register lists them by name only, so the
 * one-line `detail` under each is ours — a gloss to put the same words in front
 * of every assessor, not part of the published rubric.
 */
export const SUPPORT_CRITERIA = [
  {
    code: "ENGAGEMENT",
    group: "Course",
    title: "Participation / Engagement",
    detail:
      "Turns up, joins in, and contributes to the group — in the classroom as much as on the pitch.",
  },
  {
    code: "OBJECTIVE",
    group: "Practical delivery",
    title: "Objective",
    detail:
      "A clear learning outcome for the session, and everything in it pointed at that outcome.",
  },
  {
    code: "CONTENT",
    group: "Practical delivery",
    title: "Content",
    detail:
      "The football is correct, current, and pitched at the level of the players in front of them.",
  },
  {
    code: "ORGANISATION",
    group: "Practical delivery",
    title: "Organisation",
    detail:
      "Practice design, pitch geography and numbers produce the picture the topic needs, and the session runs without dead time.",
  },
  {
    code: "PRESENTING",
    group: "Practical delivery",
    title: "Presenting",
    detail:
      "Frames the session so the players know what they are doing and why — heard, understood, and shown.",
  },
  {
    code: "COACHING",
    group: "Practical delivery",
    title: "Coaching",
    detail:
      "Observes, picks the moment, intervenes on something worth stopping for, and lets the practice run on.",
  },
  {
    code: "ENVIRONMENT",
    group: "Practical delivery",
    title: "Environment",
    detail:
      "The session is safe, every player is involved, and the coach's presence is one players respond to.",
  },
] as const;

export type SupportCriterion = (typeof SUPPORT_CRITERIA)[number];
export type SupportCriterionCode = SupportCriterion["code"];

const BY_CODE = new Map<string, SupportCriterion>(SUPPORT_CRITERIA.map((c) => [c.code, c]));

export function criterionByCode(code: string) {
  return BY_CODE.get(code) ?? null;
}

/** The rubric grouped for display, in the order the groups are declared. */
export function criteriaByGroup() {
  const groups: { group: string; criteria: SupportCriterion[] }[] = [];
  for (const criterion of SUPPORT_CRITERIA) {
    const existing = groups.find((g) => g.group === criterion.group);
    if (existing) existing.criteria.push(criterion);
    else groups.push({ group: criterion.group, criteria: [criterion] });
  }
  return groups;
}

/**
 * The rating at or above which a coach has passed.
 *
 * The rubric's own line: 2.5 and up is "Pass on course", 2 and below is
 * "Post-course support". A course carries its own `ratingThreshold` so a future
 * licence can set a different bar without this constant moving; this is what a
 * course is given when nobody says otherwise.
 */
export const DEFAULT_RATING_THRESHOLD = 2.5;

/** Every mark an assessor can give: 1 to 5, in half steps. */
export const RATING_SCALE = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

export type Band = {
  min: number;
  /// Football Australia's wording.
  faRating: "Highly Competent" | "Competent" | "Not yet competent";
  outcome: "Pass on course" | "Post-course support";
  definition: string;
  tone: "good" | "ok" | "warn" | "bad";
};

/** The rubric's bands, highest first — `bandFor` reads them in this order. */
export const RATING_BANDS: Band[] = [
  {
    min: 4.5,
    faRating: "Highly Competent",
    outcome: "Pass on course",
    definition:
      "High quality candidate to progress further in the Advanced Coach Education Pathway. To be considered for roles within National Team, A-League, full-time FQ, CET, etc.",
    tone: "good",
  },
  {
    min: 3.5,
    faRating: "Highly Competent",
    outcome: "Pass on course",
    definition:
      "Top Tier 1 club coach; shows strong skills and is well equipped for the next level of accreditation. Exceeds level of competency. To be considered for roles in the FQA Emerging Program, CET, etc.",
    tone: "good",
  },
  {
    min: 3,
    faRating: "Competent",
    outcome: "Pass on course",
    definition:
      "Average Tier 1 club coach; actively engages and contributes to the course. Demonstrates potential and readiness for the next level of accreditation. Meets level of competency.",
    tone: "ok",
  },
  {
    min: 2.5,
    faRating: "Competent",
    outcome: "Pass on course",
    definition:
      "Tier 2 club coach; displays some football knowledge. Will need a higher level of support before progressing to the next professional progression. Meets level of competency.",
    tone: "ok",
  },
  {
    min: 1.5,
    faRating: "Not yet competent",
    outcome: "Post-course support",
    definition:
      "Community club coach needing support; displays basic football knowledge. Will need a higher level of support before progressing to the next level. Does not meet level of competency yet.",
    tone: "warn",
  },
  {
    min: 1,
    faRating: "Not yet competent",
    outcome: "Post-course support",
    definition: "Displays limited football knowledge; should not be on course, should not coach.",
    tone: "bad",
  },
];

export function bandFor(rating: number | null | undefined): Band | null {
  if (rating === null || rating === undefined) return null;
  return RATING_BANDS.find((b) => rating >= b.min) ?? RATING_BANDS[RATING_BANDS.length - 1];
}

/** Snaps a figure onto the rubric's half-step scale, and inside its range. */
export function toRatingStep(value: number) {
  return Math.min(5, Math.max(1, Math.round(value * 2) / 2));
}

export const PATHWAY_LABEL: Record<SupportPathway, string> = {
  LIVE_ASSESSMENT: "Live assessment",
  VIDEO_REVIEW: "Video review",
};

export const PATHWAY_DESCRIPTION: Record<SupportPathway, string> = {
  LIVE_ASSESSMENT: "An educator attends one of your sessions and assesses it in person.",
  VIDEO_REVIEW: "You film a session you deliver and send the link for an educator to review.",
};

/**
 * What a set of marks adds up to, and which outcomes that leaves open.
 *
 * Every criterion has to carry a mark — a blank is not a pass — and the overall
 * rating is the mean of the seven, snapped to the rubric's half-step scale. The
 * reviewer still chooses the outcome; this only says whether the rubric permits
 * a successful one, which it does at the threshold and not below it.
 */
export function reviewGate(
  marks: Map<string, number | null | undefined>,
  threshold = DEFAULT_RATING_THRESHOLD,
) {
  const missing = SUPPORT_CRITERIA.filter((c) => !marks.get(c.code)).map((c) => c.code);
  const given = SUPPORT_CRITERIA.map((c) => marks.get(c.code)).filter(
    (v): v is number => typeof v === "number" && v > 0,
  );

  const overall =
    given.length === SUPPORT_CRITERIA.length
      ? toRatingStep(given.reduce((sum, v) => sum + v, 0) / given.length)
      : null;

  return {
    missing,
    complete: missing.length === 0,
    overall,
    band: bandFor(overall),
    threshold,
    canPass: overall !== null && overall >= threshold,
  };
}

/* --------------------------- Did they pass? ------------------------------- */

export type CourseVerdict = "unrated" | "in_progress" | "passed" | "needs_support";

export type CourseResult = {
  courseId: string;
  courseTitle: string;
  threshold: number | null;
  rating: number | null;
  band: Band | null;
  outcome: string;
  verdict: CourseVerdict;
};

/**
 * Where one enrolment stands.
 *
 * A course only ranks if it carries a threshold; without one it is
 * complete-it-and-you're-done and nobody can fail it. An unrated coach on a
 * rated course hasn't failed either — nobody has assessed them yet, and a
 * referral before then would be a referral for the educator being behind.
 */
export function courseResult(enrollment: {
  courseId: string;
  rating: number | null;
  outcome: string;
  course: { title: string; ratingThreshold: number | null };
}): CourseResult {
  const { rating, outcome } = enrollment;
  const threshold = enrollment.course.ratingThreshold;

  let verdict: CourseVerdict = "unrated";
  if (outcome === "PASSED") verdict = "passed";
  else if (outcome === "POST_COURSE_SUPPORT") verdict = "needs_support";
  else if (threshold === null) verdict = "unrated";
  else if (rating === null) verdict = "in_progress";
  else verdict = rating >= threshold ? "passed" : "needs_support";

  return {
    courseId: enrollment.courseId,
    courseTitle: enrollment.course.title,
    threshold,
    rating,
    band: bandFor(rating),
    outcome,
    verdict,
  };
}

export const VERDICT_LABEL: Record<
  CourseVerdict,
  { label: string; tone: "muted" | "ok" | "good" | "warn" }
> = {
  unrated: { label: "Not rated", tone: "muted" },
  in_progress: { label: "In progress", tone: "muted" },
  passed: { label: "Passed", tone: "good" },
  needs_support: { label: "Post-course support", tone: "warn" },
};

/* --------------------------- Support cases -------------------------------- */

/** The attempt a case is currently living on, if any. */
export function openAttempt<T extends { status: string; attemptNo: number }>(attempts: T[]) {
  return (
    attempts.filter((a) => a.status !== "REVIEWED").sort((a, b) => b.attemptNo - a.attemptNo)[0] ??
    null
  );
}

export function latestAttempt<T extends { attemptNo: number }>(attempts: T[]) {
  return attempts.slice().sort((a, b) => b.attemptNo - a.attemptNo)[0] ?? null;
}

export type Stage = {
  label: string;
  /// Who the case is sitting with right now.
  waitingOn: "coach" | "educator" | "nobody";
  tone: "muted" | "ok" | "warn" | "bad" | "good" | "info";
  /// Plain-language next step, written for the coach.
  next: string;
};

/**
 * What is happening to a case right now, and whose move it is.
 *
 * Derived rather than stored: the case status says how it ended, the open
 * attempt says where it is, and a stage stored beside both would be a third
 * thing to keep in step with them.
 */
export function stageOf(
  supportCase: {
    status: string;
    attemptsAllowed: number;
    attempts: { status: string; attemptNo: number; pathway: SupportPathway; dueAt: Date | null }[];
  },
  now = new Date(),
): Stage {
  if (supportCase.status === "SUCCESSFUL")
    return {
      label: "Successful",
      waitingOn: "nobody",
      tone: "good",
      next: "Your delivery met the standard. The course is passed — nothing further to do.",
    };
  if (supportCase.status === "UNSUCCESSFUL")
    return {
      label: "Closed — not successful",
      waitingOn: "nobody",
      tone: "bad",
      next: "This support case is closed. Talk to your educator about what happens next.",
    };
  if (supportCase.status === "WITHDRAWN")
    return {
      label: "Withdrawn",
      waitingOn: "nobody",
      tone: "muted",
      next: "This case was closed without an assessment.",
    };

  const attempt = openAttempt(supportCase.attempts);
  if (!attempt) {
    const used = supportCase.attempts.length;
    return {
      label: used ? "Awaiting next attempt" : "Awaiting arrangement",
      waitingOn: "educator",
      tone: "warn",
      next:
        used >= supportCase.attemptsAllowed
          ? "You've used every assessment on this case. Your educator will be in touch about what happens next."
          : "Your educator is arranging your assessment. They'll confirm the date or the date your video is due.",
    };
  }

  const overdue = attempt.dueAt !== null && attempt.dueAt < now;

  if (attempt.status === "AWAITING_VIDEO")
    return {
      label: overdue ? "Video overdue" : "Awaiting video",
      waitingOn: "coach",
      tone: overdue ? "bad" : "warn",
      next: "Film a session you deliver and submit the link below.",
    };

  if (attempt.status === "SCHEDULED")
    return {
      label: overdue ? "Observation to write up" : "Assessment booked",
      waitingOn: overdue ? "educator" : "coach",
      tone: overdue ? "ok" : "info",
      next: overdue
        ? "Your educator has been out to see you and is writing up the assessment."
        : "Your educator will attend the session below. Run it as you normally would.",
    };

  return {
    label: "Awaiting write-up",
    waitingOn: "educator",
    tone: "ok",
    next: "Your delivery is with your educator. Their feedback lands here once it's written up.",
  };
}
