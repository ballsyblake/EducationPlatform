/**
 * The scoring engine.
 *
 * Every number a club, an assessor or the CDU sees comes from here, and nothing
 * in here touches the database — it takes plain rows and returns plain results.
 * That's what makes the rubric testable, and it's why the reconciliation screen
 * can show "what the total would be if you resolved this criterion to 2 stars"
 * without writing anything down first.
 *
 * Two rules run through all of it:
 *
 *   1. A missing thing scores zero rather than being skipped. A club with no
 *      Technical Director must score worse than one that has an unqualified
 *      one, so absent roles and unscored criteria stay in the denominator.
 *   2. Non-Negotiables are a gate, not a score. They never move the percentage;
 *      they decide whether the percentage can be converted into a shield.
 */
import type { Domain, Shield } from "@prisma-client";
import {
  EMPLOYMENT_POINTS,
  MAX_STAFF_POINTS,
  MAX_STARS,
  STAFF_ROLE_SPECS,
  experiencePoints,
  streamMultiplier,
} from "@/lib/cda/rubric";

/* -------------------------------------------------------------------------- */
/* Technical Qualifications                                                   */
/* -------------------------------------------------------------------------- */

export type ScorableStaff = {
  id: string;
  name: string;
  staffRole: keyof typeof STAFF_ROLE_SPECS;
  yearsExperience: number;
  employment: keyof typeof EMPLOYMENT_POINTS;
  qualification: { label: string; points: number; stream: "OUTFIELD" | "GOALKEEPING" | "COMMUNITY" } | null;
};

export type StaffScore = {
  staff: ScorableStaff;
  qualificationPoints: number;
  experiencePoints: number;
  employmentPoints: number;
  /** Out of MAX_STAFF_POINTS. */
  total: number;
  /** True when an off-stream qualification was discounted. */
  discounted: boolean;
};

export function scoreStaffMember(staff: ScorableStaff): StaffScore {
  const spec = STAFF_ROLE_SPECS[staff.staffRole];
  const multiplier = staff.qualification
    ? streamMultiplier(spec.stream, staff.qualification.stream)
    : 1;

  const qualificationPoints = staff.qualification
    ? Math.round(staff.qualification.points * multiplier)
    : 0;
  const experience = experiencePoints(staff.yearsExperience);
  const employment = EMPLOYMENT_POINTS[staff.employment];

  return {
    staff,
    qualificationPoints,
    experiencePoints: experience,
    employmentPoints: employment,
    total: qualificationPoints + experience + employment,
    discounted: multiplier !== 1,
  };
}

export type RoleBreakdown = {
  role: keyof typeof STAFF_ROLE_SPECS;
  label: string;
  weight: number;
  /** How many staff in this role count towards the score. */
  counted: number;
  /** How many the club actually declared. */
  declared: number;
  /** The ones that counted, best first. */
  scores: StaffScore[];
  /** Points earned across the counted slots. */
  earned: number;
  /** Points available across the counted slots. */
  available: number;
  /** earned / available, 0-1. */
  ratio: number;
};

export type TechnicalResult = {
  percent: number;
  roles: RoleBreakdown[];
  staffCount: number;
  /** Roles the club has nobody in. The most actionable thing on the report. */
  unfilledRoles: RoleBreakdown[];
};

/**
 * Scores the Technical Qualifications domain.
 *
 * Each role contributes `counted` slots. The club's best people in that role
 * fill them; any slot left empty scores zero. Roles are then combined by
 * weight, so failing to appoint a Technical Director costs five times what
 * failing to appoint a MiniRoos Coordinator does.
 */
export function scoreTechnicalDomain(staff: ScorableStaff[]): TechnicalResult {
  const roles: RoleBreakdown[] = (
    Object.keys(STAFF_ROLE_SPECS) as (keyof typeof STAFF_ROLE_SPECS)[]
  ).map((role) => {
    const spec = STAFF_ROLE_SPECS[role];
    const inRole = staff.filter((s) => s.staffRole === role);

    // Best-scoring first, so the counted slots go to the strongest appointments
    // rather than to whoever the club happened to enter first.
    const scored = inRole
      .map(scoreStaffMember)
      .sort((a, b) => b.total - a.total)
      .slice(0, spec.counted);

    const available = spec.counted * MAX_STAFF_POINTS;
    const earned = scored.reduce((sum, s) => sum + s.total, 0);

    return {
      role,
      label: spec.label,
      weight: spec.weight,
      counted: spec.counted,
      declared: inRole.length,
      scores: scored,
      earned,
      available,
      ratio: available === 0 ? 0 : earned / available,
    };
  });

  const totalWeight = roles.reduce((sum, r) => sum + r.weight, 0);
  const weighted = roles.reduce((sum, r) => sum + r.ratio * r.weight, 0);

  return {
    percent: totalWeight === 0 ? 0 : (weighted / totalWeight) * 100,
    roles,
    staffCount: staff.length,
    unfilledRoles: roles.filter((r) => r.declared === 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Star-scored domains                                                        */
/* -------------------------------------------------------------------------- */

export type ScorableCriterion = {
  id: string;
  code: string;
  title: string;
  domain: Domain;
  weight: number;
};

export type CriterionOutcome = {
  criterion: ScorableCriterion;
  /** null when nobody has scored it yet — counted as zero, but flagged. */
  stars: number | null;
};

export type DomainResult = {
  domain: Domain;
  percent: number;
  earned: number;
  available: number;
  scored: number;
  total: number;
};

/**
 * Scores one star-based domain.
 *
 * Unscored criteria stay in the denominator. Dropping them would let a
 * half-finished assessment show a flattering percentage that collapses the
 * moment the remaining criteria are filled in, which is worse than showing a
 * low number with "12 of 14 scored" next to it.
 */
export function scoreStarDomain(domain: Domain, outcomes: CriterionOutcome[]): DomainResult {
  const forDomain = outcomes.filter((o) => o.criterion.domain === domain);

  const available = forDomain.reduce((sum, o) => sum + o.criterion.weight * MAX_STARS, 0);
  const earned = forDomain.reduce((sum, o) => sum + (o.stars ?? 0) * o.criterion.weight, 0);

  return {
    domain,
    percent: available === 0 ? 0 : (earned / available) * 100,
    earned,
    available,
    scored: forDomain.filter((o) => o.stars !== null).length,
    total: forDomain.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Non-Negotiables                                                            */
/* -------------------------------------------------------------------------- */

export type NonNegotiableState = {
  code: string;
  title: string;
  verdict: "PENDING" | "PASS" | "FAIL";
};

export type EligibilityResult = {
  /** True only when every Non-Negotiable has been verified as a pass. */
  eligible: boolean;
  passed: number;
  failed: NonNegotiableState[];
  pending: NonNegotiableState[];
  total: number;
};

export function checkEligibility(items: NonNegotiableState[]): EligibilityResult {
  const failed = items.filter((i) => i.verdict === "FAIL");
  const pending = items.filter((i) => i.verdict === "PENDING");

  return {
    // Pending counts against eligibility as much as a failure does. A shield
    // awarded on unverified checks is exactly the outcome the gate exists to
    // prevent, so "not yet checked" can never resolve in the club's favour.
    eligible: items.length > 0 && failed.length === 0 && pending.length === 0,
    passed: items.filter((i) => i.verdict === "PASS").length,
    failed,
    pending,
    total: items.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Weighted total and shield                                                  */
/* -------------------------------------------------------------------------- */

export type CycleWeights = {
  technicalWeight: number;
  planningWeight: number;
  deliveryWeight: number;
  outcomesWeight: number;
};

export type ShieldThresholds = {
  bronzeMin: number;
  silverMin: number;
  goldMin: number;
  platinumMin: number;
};

export type DomainPercentages = Record<Domain, number>;

export type RatingResult = {
  domains: DomainPercentages;
  weights: Record<Domain, number>;
  /** Each domain's contribution to the total, in percentage points. */
  contributions: Record<Domain, number>;
  percent: number;
  eligibility: EligibilityResult;
  /** The shield the score earns, before the Non-Negotiable gate. */
  provisionalShield: Shield;
  /** What the club is actually awarded — null when a Non-Negotiable blocks it. */
  shield: Shield | null;
};

export function shieldFor(percent: number, t: ShieldThresholds): Shield {
  if (percent >= t.platinumMin) return "PLATINUM";
  if (percent >= t.goldMin) return "GOLD";
  if (percent >= t.silverMin) return "SILVER";
  if (percent >= t.bronzeMin) return "BRONZE";
  return "NONE";
}

/**
 * Combines the four domains into the rating.
 *
 * Weights are normalised rather than assumed to total 100, so a cycle
 * configured 30/20/30/25 by mistake still produces a coherent percentage
 * instead of one that can't reach 100.
 */
export function computeRating(
  domains: DomainPercentages,
  cycle: CycleWeights & ShieldThresholds,
  nonNegotiables: NonNegotiableState[],
): RatingResult {
  const weights: Record<Domain, number> = {
    TECHNICAL: cycle.technicalWeight,
    PLANNING: cycle.planningWeight,
    DELIVERY: cycle.deliveryWeight,
    OUTCOMES: cycle.outcomesWeight,
  };

  const totalWeight =
    weights.TECHNICAL + weights.PLANNING + weights.DELIVERY + weights.OUTCOMES;

  const contributions = {
    TECHNICAL: 0,
    PLANNING: 0,
    DELIVERY: 0,
    OUTCOMES: 0,
  } as Record<Domain, number>;

  for (const domain of Object.keys(weights) as Domain[]) {
    contributions[domain] =
      totalWeight === 0 ? 0 : (domains[domain] * weights[domain]) / totalWeight;
  }

  const percent =
    contributions.TECHNICAL +
    contributions.PLANNING +
    contributions.DELIVERY +
    contributions.OUTCOMES;

  const eligibility = checkEligibility(nonNegotiables);
  const provisionalShield = shieldFor(percent, cycle);

  return {
    domains,
    weights,
    contributions,
    percent,
    eligibility,
    provisionalShield,
    shield: eligibility.eligible ? provisionalShield : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Assessor agreement                                                         */
/* -------------------------------------------------------------------------- */

export type AssessorStar = {
  assessorId: string;
  assessorName: string;
  stars: number | null;
  comment: string | null;
};

export type AgreementLevel = "UNSCORED" | "AGREED" | "MINOR" | "MAJOR";

export type CriterionAgreement = {
  criterion: ScorableCriterion;
  entries: AssessorStar[];
  /** Only the assessors who actually scored it. */
  given: number[];
  spread: number;
  level: AgreementLevel;
  /** The median — what the CDU is offered as a starting point. */
  suggested: number | null;
  /** The reconciled score, once one exists. */
  final: number | null;
};

/**
 * How far apart the assessors are on one criterion.
 *
 * A one-star gap is normal disagreement between people watching different
 * sessions; a two-star gap means they saw different clubs. Only the second
 * kind is worth the CDU's attention, which is why they're separated rather
 * than both surfacing as "disagreement".
 */
export function assessAgreement(
  criterion: ScorableCriterion,
  entries: AssessorStar[],
  final: number | null,
): CriterionAgreement {
  const given = entries
    .map((e) => e.stars)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);

  if (given.length === 0) {
    return { criterion, entries, given, spread: 0, level: "UNSCORED", suggested: null, final };
  }

  const spread = given[given.length - 1] - given[0];

  // Median, not mean: with three assessors it ignores a single outlier, and it
  // always lands on a whole star, which is the only thing that can be awarded.
  const mid = Math.floor(given.length / 2);
  const suggested =
    given.length % 2 === 1 ? given[mid] : Math.round((given[mid - 1] + given[mid]) / 2);

  const level: AgreementLevel = spread === 0 ? "AGREED" : spread === 1 ? "MINOR" : "MAJOR";

  return { criterion, entries, given, spread, level, suggested, final };
}

export const AGREEMENT_LABELS: Record<AgreementLevel, string> = {
  UNSCORED: "Not scored",
  AGREED: "Agreed",
  MINOR: "1 star apart",
  MAJOR: "2+ stars apart",
};

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function pct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}
