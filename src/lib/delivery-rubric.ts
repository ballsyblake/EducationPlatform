/**
 * Football Australia's assessment rubric for a practical delivery.
 *
 * Six areas, each scored 0-3 on a best-fit reading of the session, eighteen
 * points in all, and a competency threshold that moves with the diploma. Taken
 * from the Football Australia/AFC *Coach Education Assessor Guide*, which is
 * what a tutor on the grass is working from.
 *
 * This is not the same instrument as `support-rubric.ts`. That one rates a
 * coach 1-5 in half steps across seven criteria and is what the 2026 registers
 * and every imported score are in; this one scores one session out of eighteen
 * and is what the assessor's own paperwork asks for. Both exist because both
 * are in use — the register keeps a 1-5 column, FA's rubric produces the
 * outcome — and collapsing either into the other would be inventing a
 * conversion nobody has published.
 *
 * Pure and client-safe, same as `support-rubric.ts` and for the same reason:
 * the assessment form, the pages that read a score back and anything that
 * totals one all have to agree, and three approximations of eighteen points is
 * how they stop agreeing. **Keep database access out of here.**
 */

/** One of the rubric's six areas. */
export type DeliveryArea = {
  /// Stored on `DeliveryScore.code`, so these strings are data. Don't rename.
  code: string;
  title: string;
  /// What the assessor is looking at, in the guide's own terms.
  detail: string;
};

/**
 * The six areas, in the order the guide prints them — which is also the order a
 * session happens in: what it was for, what was in it, how it was set up, how
 * it was introduced, how it was coached, and what the group felt like.
 */
export const DELIVERY_AREAS: DeliveryArea[] = [
  {
    code: "OBJECTIVE",
    title: "Objective",
    detail: "A clear learning outcome, and everything in the session pointed at it.",
  },
  {
    code: "CONTENT",
    title: "Content",
    detail: "The football is correct and current, and meets the 5Rs — relevance, realism, repetition, rewards, reflection.",
  },
  {
    code: "ORGANISATION",
    title: "Organisation",
    detail: "Practice design, area, numbers and equipment produce the picture the topic needs, and the session runs without dead time.",
  },
  {
    code: "PRESENTING",
    title: "Presenting",
    detail: "The 3Es — engage, explain, exit — used so the players understand what they are about to do.",
  },
  {
    code: "COACHING",
    title: "Coaching",
    detail: "The 4Es — enter, enhance, educate, ensure — and interventions that move the learning on.",
  },
  {
    code: "ENVIRONMENT",
    title: "Environment",
    detail: "Safe, inclusive and engaging, and modified with SO CHANGE IT when it needs to be.",
  },
];

export const AREA_CODES = DELIVERY_AREAS.map((a) => a.code);

const AREA_BY_CODE = new Map(DELIVERY_AREAS.map((a) => [a.code, a]));

export function areaByCode(code: string) {
  return AREA_BY_CODE.get(code) ?? null;
}

/** One rung of the 0-3 scale, as the guide defines it. */
export type DeliveryLevel = {
  score: 0 | 1 | 2 | 3;
  label: "Not Evident" | "Developing" | "Proficient" | "Expertise";
  description: string;
};

export const DELIVERY_LEVELS: DeliveryLevel[] = [
  {
    score: 0,
    label: "Not Evident",
    description: "The required elements are absent, vague, or entirely ineffective.",
  },
  {
    score: 1,
    label: "Developing",
    description: "Elements are present but lack consistency, clarity, or full alignment with objectives.",
  },
  {
    score: 2,
    label: "Proficient",
    description: "Elements are clear, consistent, and effectively support player understanding and engagement.",
  },
  {
    score: 3,
    label: "Expertise",
    description: "Elements are exemplary, seamlessly integrated, and maximise player learning and engagement.",
  },
];

/** Six areas at three points each. */
export const MAX_DELIVERY_POINTS = DELIVERY_AREAS.length * 3;

export type DeliveryDiplomaLevel = "A" | "B" | "C";

/**
 * Where the lines fall, per diploma.
 *
 * `competent` is the guide's own table — nine points on a C Diploma, twelve on
 * a B, fifteen on an A — and is the minimum for competency at that level.
 *
 * `highlyCompetent` is Football Australia's clarification of 15 October 2026:
 * on the C Diploma, 9 to 11 points is Competent and 12 or more is Highly
 * Competent. FA has not published the equivalent line for B or A, so those
 * follow the same three-point step. **They are inferred, not quoted** — if
 * somebody asks FA and the answer is different, this table is the only place to
 * change, and an A Diploma's Highly Competent currently means a perfect
 * eighteen, which is the kind of answer worth checking before it is relied on.
 */
export const DELIVERY_THRESHOLDS: Record<
  DeliveryDiplomaLevel,
  { competent: number; highlyCompetent: number; inferred: boolean }
> = {
  C: { competent: 9, highlyCompetent: 12, inferred: false },
  B: { competent: 12, highlyCompetent: 15, inferred: true },
  A: { competent: 15, highlyCompetent: 18, inferred: true },
};

/**
 * The C Diploma's lines, for a course whose level nothing says.
 *
 * The lowest bar rather than no bar: a course the pattern doesn't recognise is
 * far more often a C Diploma typed oddly than an A Diploma, and the alternative
 * — scoring a session and refusing to say what it means — leaves an assessor
 * holding a total with no outcome.
 */
export const DEFAULT_DELIVERY_LEVEL: DeliveryDiplomaLevel = "C";

// Widened from `diplomaLevelOf` in `diploma-coursework.ts`, which deliberately
// knows only the two levels that carry standing coursework. The rubric applies
// to all three, so an A Diploma has to be readable here.
const LEVEL_PATTERN = /\b([abc])\s*[-/]?\s*(?:diploma|licence|license|certificate)\b/i;

/** Which diploma a course is on, from the words FQ actually writes. */
export function deliveryLevelOf(course: {
  qualification?: string | null;
  title?: string | null;
}): DeliveryDiplomaLevel | null {
  for (const source of [course.qualification, course.title]) {
    const letter = source?.match(LEVEL_PATTERN)?.[1]?.toUpperCase();
    if (letter === "A" || letter === "B" || letter === "C") return letter;
  }
  return null;
}

export function thresholdsFor(course: { qualification?: string | null; title?: string | null }) {
  const level = deliveryLevelOf(course);
  return {
    level,
    ...DELIVERY_THRESHOLDS[level ?? DEFAULT_DELIVERY_LEVEL],
    /// True when the lines being applied are the fallback's rather than this
    /// course's own, so a page can say so instead of implying a decision.
    assumed: level === null,
  };
}

/** Football Australia's three outcomes, and how each one reads. */
export type DeliveryOutcome = {
  label: "Highly Competent" | "Competent" | "Not Yet Competent";
  tone: "good" | "ok" | "warn";
  /// Whether this outcome is at or above the level's minimum for competency.
  competent: boolean;
};

/**
 * The outcome for a total, at a given diploma's lines.
 *
 * Arithmetic, not a judgement: the guide says what nine points means, so a
 * complete scoresheet already carries its outcome and asking an assessor to
 * choose it again only invites the two disagreeing. What is nobody's to derive
 * is the *course* rating — that is a judgement across everything a coach
 * delivered, and it stays a person's to set.
 */
export function outcomeFor(
  points: number,
  thresholds: { competent: number; highlyCompetent: number },
): DeliveryOutcome {
  if (points >= thresholds.highlyCompetent) {
    return { label: "Highly Competent", tone: "good", competent: true };
  }
  if (points >= thresholds.competent) {
    return { label: "Competent", tone: "ok", competent: true };
  }
  return { label: "Not Yet Competent", tone: "warn", competent: false };
}

/**
 * Totals a scoresheet.
 *
 * An area with no score is not a zero. Nought is a judgement — "the required
 * elements are absent" — and a scoresheet half filled in on the drive home is
 * not a coach who showed nothing; the total is incomplete until all six areas
 * have an answer, and `complete` is what says so.
 */
export function totalPoints(scores: Map<string, number | null | undefined>) {
  const given = DELIVERY_AREAS.map((area) => scores.get(area.code)).filter(
    (value): value is number => typeof value === "number",
  );
  return {
    points: given.reduce((sum, value) => sum + value, 0),
    scored: given.length,
    missing: DELIVERY_AREAS.filter((a) => typeof scores.get(a.code) !== "number").map(
      (a) => a.code,
    ),
    complete: given.length === DELIVERY_AREAS.length,
  };
}

/** A score off a form, or null if it isn't one of the four rungs. */
export function parseAreaScore(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 3 ? parsed : null;
}

/** Up to three recommendations, which is what the guide asks for. */
export const MAX_ACTION_STEPS = 3;
