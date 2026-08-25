/**
 * The delivery rubric, and the pure rules that read it.
 *
 * Kept clear of `server-only` and of any database import on purpose: the review
 * form is a client component, and it renders the same eight criteria, the same
 * three marks and the same gate the server enforces on save. One definition,
 * read from both sides — see src/lib/support.ts for everything that touches the
 * database.
 */
import type { DeliveryRating, SupportPathway } from "@prisma-client";
import type { TaskItem } from "@/lib/coursework";

/* ------------------------------ The rubric -------------------------------- */

/**
 * What an educator watches for when they assess a coach delivering a session.
 *
 * Eight competencies, in the order a session actually unfolds: what was
 * prepared, what happened on the grass, and what the coach made of it
 * afterwards. Unlike the CDA rubric — which the Club Development Unit rewords
 * between cycles, and so lives in the database — this one is fixed, so it lives
 * here. A completed review stores the code, not a foreign key, and stays
 * readable even if a criterion is retired later.
 *
 * The same eight apply whether the educator is standing on the touchline or
 * watching film. A coach five hours from Brisbane submits video because of the
 * drive, not because less is expected of them.
 */
export const SUPPORT_CRITERIA = [
  {
    code: "PLAN",
    group: "Preparation",
    title: "Session plan and organisation",
    detail:
      "A plan exists, the session runs to it, and the transitions between practices don't cost the players minutes standing still.",
  },
  {
    code: "DESIGN",
    group: "Preparation",
    title: "Practice design fits the age and stage",
    detail:
      "Area, numbers, and conditions produce the picture the theme needs, and the practice is playable for the group in front of them.",
  },
  {
    code: "SAFETY",
    group: "Preparation",
    title: "Safety and duty of care",
    detail:
      "Surface and equipment checked, sensible work-to-rest, heat and hydration managed, and no player left unsupervised.",
  },
  {
    code: "TECHNICAL",
    group: "Delivery",
    title: "Technical and tactical content is correct",
    detail:
      "What the coach teaches is right, and it matches the theme they set out to coach.",
  },
  {
    code: "INTERVENE",
    group: "Delivery",
    title: "Interventions — when to stop, what to fix",
    detail:
      "Stops play on a moment worth stopping for, fixes one thing, and lets the practice run again.",
  },
  {
    code: "COMMS",
    group: "Delivery",
    title: "Communication and demonstration",
    detail:
      "Heard, understood, and shown. Language pitched at the group, and a demonstration when words won't do it.",
  },
  {
    code: "ENGAGE",
    group: "Delivery",
    title: "Player engagement and management",
    detail:
      "Every player involved, behaviour managed without stopping the session, and the coach knows the players by name.",
  },
  {
    code: "REFLECT",
    group: "Review",
    title: "Reflection and self-evaluation",
    detail:
      "Can say what worked, what didn't, and what they would change — without being led to it.",
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

export const RATING_LEVELS: {
  value: DeliveryRating;
  label: string;
  detail: string;
  tone: "bad" | "warn" | "good";
}[] = [
  {
    value: "NOT_YET",
    label: "Not yet",
    detail: "Below the standard on the day.",
    tone: "bad",
  },
  {
    value: "DEVELOPING",
    label: "Developing",
    detail: "Getting there — safe and sound, with something still to work on.",
    tone: "warn",
  },
  {
    value: "COMPETENT",
    label: "Competent",
    detail: "At the standard expected of the licence.",
    tone: "good",
  },
];

export const PATHWAY_LABEL: Record<SupportPathway, string> = {
  LIVE_ASSESSMENT: "Live assessment",
  VIDEO_REVIEW: "Video review",
};

export const PATHWAY_DESCRIPTION: Record<SupportPathway, string> = {
  LIVE_ASSESSMENT: "An educator attends one of your sessions and assesses it in person.",
  VIDEO_REVIEW: "You film a session you deliver and send the link for an educator to review.",
};

/**
 * Whether a set of marks can support a successful outcome.
 *
 * Every criterion has to be rated — a blank is not a pass — and a single
 * "Not yet" blocks the outcome outright. That is the point of a competency
 * rubric: an educator who wants to pass a coach on seven of eight has to move
 * the eighth mark and own it, not average it away. The reviewer still chooses
 * the outcome; this only says which choices the marks leave open.
 */
export function reviewGate(marks: Map<string, DeliveryRating | null | undefined>) {
  const missing = SUPPORT_CRITERIA.filter((c) => !marks.get(c.code)).map((c) => c.code);
  const notYet = SUPPORT_CRITERIA.filter((c) => marks.get(c.code) === "NOT_YET").map((c) => c.code);
  return {
    missing,
    notYet,
    complete: missing.length === 0,
    canPass: missing.length === 0 && notYet.length === 0,
  };
}

/* --------------------------- Did they pass? ------------------------------- */

export type CourseVerdict = "unranked" | "in_progress" | "passed" | "not_passed";

export type CourseResult = {
  courseId: string;
  courseTitle: string;
  passMark: number | null;
  earned: number;
  possible: number;
  /// Null until at least one item has been graded.
  pct: number | null;
  total: number;
  graded: number;
  outstanding: number;
  /// Every item on the course has been graded.
  finished: boolean;
  verdict: CourseVerdict;
};

/**
 * Rolls a coach's tasks up to a per-course result.
 *
 * A course only ranks if it carries a pass mark; without one it is
 * complete-it-and-you're-done and nobody can fail it. A coach with work still
 * outstanding hasn't failed either — they simply aren't finished, and a
 * referral before then would be a referral for being late, which is a different
 * conversation.
 */
export function rollUpCourse(
  course: { id: string; title: string; passMark: number | null },
  tasks: TaskItem[],
): CourseResult {
  const mine = tasks.filter((t) => t.courseId === course.id);
  const graded = mine.filter((t) => t.state === "graded" && t.maxScore);

  const earned = graded.reduce((sum, t) => sum + (t.score ?? 0), 0);
  const possible = graded.reduce((sum, t) => sum + (t.maxScore ?? 0), 0);
  const pct = possible > 0 ? Math.round((earned / possible) * 100) : null;

  const finished = mine.length > 0 && mine.every((t) => t.state === "graded");

  let verdict: CourseVerdict = "unranked";
  if (course.passMark !== null) {
    if (!finished || pct === null) verdict = "in_progress";
    else verdict = pct >= course.passMark ? "passed" : "not_passed";
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    passMark: course.passMark,
    earned,
    possible,
    pct,
    total: mine.length,
    graded: graded.length,
    outstanding: mine.filter((t) => t.state !== "graded").length,
    finished,
    verdict,
  };
}

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

