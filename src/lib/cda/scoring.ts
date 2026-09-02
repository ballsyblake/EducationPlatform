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
  /** The domain's points, scaled onto the same currency as the line items. */
  earned: number;
  available: number;
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
 *
 * `maxPoints` converts the result into the same currency as the line items so
 * the four domains can be added together. The staff rubric counts in units of
 * its own — fifteen points per person, ten roles, differing slot counts — and
 * those numbers have no relationship to a line item's `maxScore x weight`.
 * Adding them raw would make Technical dwarf everything else. So the domain is
 * scored as a ratio first and given its points afterwards, which is also how FQ
 * does it: their Technical maximum comes from a table of team profiles rather
 * than from the rubric's internals.
 */
export function scoreTechnicalDomain(
  staff: ScorableStaff[],
  maxPoints: number,
): TechnicalResult {
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
  const ratio = totalWeight === 0 ? 0 : weighted / totalWeight;

  return {
    percent: ratio * 100,
    // Rounded, so the domain contributes whole points like every line item does
    // and a report's columns add up when read.
    earned: Math.round(ratio * maxPoints),
    available: maxPoints,
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
  maxScore: number;
  /** FQ's macro-area within the domain, e.g. "Match Day Observations". */
  area: string | null;
};

export type CriterionOutcome = {
  criterion: ScorableCriterion;
  /** null when nobody has scored it yet — counted as zero, but flagged. */
  stars: number | null;
};

export type DomainResult = {
  domain: Domain;
  percent: number;
  /** Points earned: sum of score x weight. */
  earned: number;
  /** Points available: sum of maxScore x weight. */
  available: number;
  scored: number;
  total: number;
};

/**
 * Scores one line-item domain, in points.
 *
 * A line item is worth `score x weight`, out of `maxScore x weight` — which is
 * how Football Queensland's own sheets read, and why the maximum has to come
 * from the criterion rather than a constant.
 *
 * Unscored criteria stay in the denominator. Dropping them would let a
 * half-finished assessment show a flattering percentage that collapses the
 * moment the remaining criteria are filled in, which is worse than showing a
 * low number with "12 of 14 scored" next to it.
 */
export function scoreStarDomain(domain: Domain, outcomes: CriterionOutcome[]): DomainResult {
  const forDomain = outcomes.filter((o) => o.criterion.domain === domain);

  const available = forDomain.reduce(
    (sum, o) => sum + o.criterion.weight * o.criterion.maxScore,
    0,
  );
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
/* Macro-areas                                                                */
/* -------------------------------------------------------------------------- */

export type AreaResult = {
  domain: Domain;
  /** null collects anything the catalogue hasn't placed in an area. */
  area: string | null;
  earned: number;
  available: number;
  percent: number;
  scored: number;
  total: number;
  outcomes: CriterionOutcome[];
};

/**
 * Subtotals each domain by macro-area.
 *
 * Football Queensland's report is organised around these rather than around the
 * domain as a whole: a club is told it scored 67% on Program Management &
 * Monitoring and 48% on Training Program Observations, with a paragraph on
 * each. One Delivery percentage averages those into a number that describes
 * neither and gives the club nothing to act on.
 *
 * Areas come out in catalogue order rather than alphabetically, so a report
 * reads in the sequence the rubric was written in.
 */
export function scoreAreas(outcomes: CriterionOutcome[]): AreaResult[] {
  const groups: AreaResult[] = [];

  for (const o of outcomes) {
    // Matched on the pair rather than a composite key: area names contain
    // spaces and ampersands, and every separator that survives those is one
    // more thing to get wrong.
    let group = groups.find(
      (g) => g.domain === o.criterion.domain && g.area === (o.criterion.area ?? null),
    );

    if (!group) {
      group = {
        domain: o.criterion.domain,
        area: o.criterion.area ?? null,
        earned: 0,
        available: 0,
        percent: 0,
        scored: 0,
        total: 0,
        outcomes: [],
      };
      groups.push(group);
    }

    group.outcomes.push(o);
    group.total += 1;
    group.available += o.criterion.weight * o.criterion.maxScore;
    group.earned += (o.stars ?? 0) * o.criterion.weight;
    if (o.stars !== null) group.scored += 1;
  }

  for (const g of groups) {
    g.percent = g.available === 0 ? 0 : (g.earned / g.available) * 100;
  }

  return groups;
}

/* -------------------------------------------------------------------------- */
/* Non-Negotiables                                                            */
/* -------------------------------------------------------------------------- */

/** Weakest to strongest, so a cap can be compared against a provisional shield. */
export const SHIELD_ORDER: Shield[] = [
  "NONE",
  "DEVELOPMENT_COMMITTED",
  "BRONZE",
  "SILVER",
  "GOLD",
];

const SHIELD_RANK: Record<Shield, number> = {
  NONE: 0,
  DEVELOPMENT_COMMITTED: 1,
  BRONZE: 2,
  SILVER: 3,
  GOLD: 4,
};

/**
 * The three levels a threshold Non-Negotiable can be recorded against.
 *
 * Development Committed is excluded on purpose: FQ sets its threshold standards
 * per shield, and a badge is not a shield. A club below Bronze has no threshold
 * bar to meet.
 */
export const THRESHOLD_LEVELS: Shield[] = ["NONE", "BRONZE", "SILVER", "GOLD"];

/** The weaker of two shields. */
export function minShield(a: Shield, b: Shield): Shield {
  return SHIELD_RANK[a] <= SHIELD_RANK[b] ? a : b;
}

export type NonNegotiableState = {
  code: string;
  title: string;
  verdict: "PENDING" | "PASS" | "FAIL" | "ON_NOTICE";
  /**
   * Whether this same check was on notice in the club's previous cycle.
   *
   * Passed in rather than looked up, because this module stays pure — the
   * caller has the history. Absent means "not known to be", which is the safe
   * default: it lets the notice stand, and the Unit sees the run of verdicts on
   * the assessment either way.
   */
  onNoticeLastCycle?: boolean;
  /**
   * GATE checks are pass or fail; SHIELD_THRESHOLD checks set a different bar
   * per shield. Defaults to GATE when absent so a caller that hasn't been
   * updated still gets the stricter of the two behaviours.
   */
  kind?: "GATE" | "SHIELD_THRESHOLD";
  /** SHIELD_THRESHOLD only: the highest shield whose bar this club met. */
  shieldMet?: Shield | null;
};

export type EligibilityResult = {
  /** True only when every gate check has been verified as a pass. */
  eligible: boolean;
  passed: number;
  failed: NonNegotiableState[];
  pending: NonNegotiableState[];
  /** Threshold checks carrying a notice that stands. */
  onNotice: NonNegotiableState[];
  /**
   * Notices FQ's own limits don't allow — a second one in the same year, or the
   * same check on notice two seasons running. These read as failures.
   */
  noticesRefused: NonNegotiableState[];
  total: number;
  /**
   * The strongest shield the threshold checks allow, or null when none of them
   * constrains the result. A club can be eligible and still capped.
   */
  cap: Shield | null;
  /** The threshold checks that set that cap — the ones to name in the report. */
  cappedBy: NonNegotiableState[];
};

/**
 * Applies Football Queensland's two Non-Negotiable mechanisms.
 *
 * Six of the nine are gates: the documents are there or they aren't, and while
 * one is missing "no assessment score can be elevated to 'Confirmed' status" —
 * no shield at all, whatever the club scored.
 *
 * The other three are thresholds, and treating them as gates would be wrong in
 * a way that punishes exactly the clubs the scheme is meant to bring along. FQ
 * sets a different staffing and structure bar for each shield and phases them
 * in over four years, explicitly exempting Silver and Bronze clubs from the
 * Gold coaching requirement. So a club that meets the Silver bar but not the
 * Gold one is not ineligible — it is a Silver club, and the cap says so.
 */
export function checkEligibility(items: NonNegotiableState[]): EligibilityResult {
  const gates = items.filter((i) => i.kind !== "SHIELD_THRESHOLD");
  const thresholds = items.filter((i) => i.kind === "SHIELD_THRESHOLD");

  // On Notice is FQ's third verdict on the three Shield Threshold standards:
  // the bar was missed, and the club keeps its level this season anyway. It is
  // bounded — "clubs can only be on notice for the same line item for one
  // season and no more than one line item in a year" — and a notice outside
  // those bounds is what FQ calls repeated non-compliance, which reads as a
  // failure. A notice on a gate check is meaningless and treated the same way:
  // the six gates are documents that are there or aren't.
  const claimed = items.filter((i) => i.verdict === "ON_NOTICE");
  const noticesRefused = claimed.filter(
    (i) =>
      i.kind !== "SHIELD_THRESHOLD" ||
      i.onNoticeLastCycle === true ||
      // More than one in a year exhausts the allowance, and nothing in the
      // process says which of them survives — so none does, and the Unit
      // decides what each verdict should actually be.
      claimed.length > 1,
  );
  const onNotice = claimed.filter((i) => !noticesRefused.includes(i));

  const refused = (i: NonNegotiableState) => noticesRefused.includes(i);

  const failed = [...gates.filter((i) => i.verdict === "FAIL"), ...gates.filter(refused)].filter(
    (i, at, all) => all.indexOf(i) === at,
  );

  // Pending counts against eligibility as much as a failure does, for threshold
  // checks as much as for gates. A shield awarded on unverified checks is
  // exactly the outcome the gate exists to prevent, so "not yet checked" can
  // never resolve in the club's favour.
  const pending = items.filter((i) => i.verdict === "PENDING");

  /** The highest bar a threshold check is treated as having met. */
  const levelMet = (t: NonNegotiableState): Shield => {
    // A threshold check the CDU marked as failed met nobody's bar, and so does
    // a notice the limits don't allow. One left without a level recorded is
    // treated the same way; it is already holding up eligibility as a pending
    // item, and guessing upward here would let a half-finished verification
    // award a shield.
    if (t.verdict === "FAIL" || refused(t)) return "NONE";
    return t.shieldMet ?? "NONE";
  };

  let cap: Shield | null = null;
  for (const t of thresholds) {
    const met = levelMet(t);
    cap = cap === null ? met : minShield(cap, met);
  }

  const cappedBy = cap === null ? [] : thresholds.filter((t) => levelMet(t) === cap);

  return {
    eligible:
      items.length > 0 &&
      failed.length === 0 &&
      pending.length === 0 &&
      noticesRefused.length === 0,
    passed: items.filter((i) => i.verdict === "PASS").length,
    failed,
    pending,
    onNotice,
    noticesRefused,
    total: items.length,
    cap,
    cappedBy,
  };
}


/* -------------------------------------------------------------------------- */
/* Weighted total and shield                                                  */
/* -------------------------------------------------------------------------- */

export type ShieldThresholds = {
  bronzeMin: number;
  silverMin: number;
  goldMin: number;
  /** Tier 2's own bar for Development Committed. */
  developmentMin: number;
};

/** Which rule set a club is rated under. Defaults to Tier 1. */
export type AssessmentTier = "T1" | "T2";

export function tierOf(code?: string | null): AssessmentTier {
  return String(code ?? "T1").toUpperCase() === "T2" ? "T2" : "T1";
}

/** Points earned and available for one domain. */
export type DomainPoints = { earned: number; available: number };

export type RatingResult = {
  /** Each domain's percentage, for display only — it contributes nothing. */
  domains: Record<Domain, number>;
  points: Record<Domain, DomainPoints>;
  /** What share of the whole rating each domain turned out to carry. */
  shares: Record<Domain, number>;
  /** Each domain's contribution to the total, in percentage points. */
  contributions: Record<Domain, number>;
  earned: number;
  available: number;
  percent: number;
  eligibility: EligibilityResult;
  /** The shield the score earns, before the Non-Negotiables are applied. */
  provisionalShield: Shield;
  /** What the club is actually awarded — null when a gate check blocks it. */
  shield: Shield | null;
  /**
   * True when the club scored a higher shield than the threshold checks allow.
   * The score isn't wrong and the club isn't ineligible; they are held at the
   * level their structure and staffing actually support, and the report has to
   * say so rather than quietly showing a smaller shield.
   */
  cappedDown: boolean;
  /**
   * True when the award is the Development Committed badge rather than a
   * shield. Worth distinguishing because the two are used differently: a shield
   * is a mark of standard the club publishes, and the badge is an
   * acknowledgement that they are in the program and compliant.
   */
  developmentBadge: boolean;
  /**
   * Whether the club is licence compliant. Carried through rather than applied:
   * an FQ Academy League invitation needs the rating *and* this, and the Unit
   * has to be able to see the two apart.
   */
  licenceCompliant: boolean | null;
  tier: AssessmentTier;
};

/**
 * The shield a percentage earns on its own, under that club's tier.
 *
 * The two tiers award different things, and this is the correction the 2026
 * Info Pack forced. Tier 1 runs the Bronze/Silver/Gold ladder. Tier 2 does not
 * sit below it — it is a separate track with one outcome: "Tier 2 –
 * Development Committed rating is awarded if minimum 55% is achieved out of the
 * overall maximum points" (p19), reaffirmed as "Tier 2 assessment score over
 * 55%" in the league-invitation criteria (p27).
 *
 * An earlier reading had Development Committed as a badge for a Tier 1 club
 * scoring under 40%, quoting a sentence from an older pack that the 2026 one
 * does not carry. That handed the badge to precisely the clubs it was never
 * meant for — a Tier 1 club below Bronze — while a Tier 2 club on 60% could not
 * be awarded it at all.
 */
export function shieldFor(
  percent: number,
  t: ShieldThresholds,
  tier: AssessmentTier = "T1",
): Shield {
  if (tier === "T2") {
    return percent >= t.developmentMin ? "DEVELOPMENT_COMMITTED" : "NONE";
  }
  if (percent >= t.goldMin) return "GOLD";
  if (percent >= t.silverMin) return "SILVER";
  if (percent >= t.bronzeMin) return "BRONZE";
  return "NONE";
}

const DOMAINS: Domain[] = ["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"];

/**
 * Combines the four domains into the rating, by adding up points.
 *
 * This is Football Queensland's arithmetic, and it is not the same as scoring
 * each domain to a percentage and then averaging those percentages by weight.
 * Every line item contributes `score x weight` towards one grand total, and a
 * domain's influence is simply how many points it happens to contain — 490 of
 * FQ's 1314 sit in Delivery, so Delivery is 37% of the rating, and nobody
 * configured that anywhere.
 *
 * The practical difference: under the weighted-average method a domain with few
 * points still counts for its full configured share, so one bad mark in a small
 * domain moves the total as much as several in a large one. Summing points
 * makes every mark worth the same everywhere, which is what makes the weightings
 * on the line items mean anything.
 */
export function computeRating(
  points: Record<Domain, DomainPoints>,
  cycle: ShieldThresholds,
  nonNegotiables: NonNegotiableState[],
  /**
   * Whether the club is licence compliant in non-technical areas.
   *
   * No longer a condition on the award. The 2026 pack keeps licence compliance
   * as one of the two tests for an FQ Academy League invitation — "ASSESSMENT
   * COMPLIANT… LICENCE COMPLIANT" (p27) — and makes the rating itself turn on
   * the score alone. It stays on the result so the Unit can see, of a club that
   * earned its rating, whether the other half of the invitation is met.
   */
  licenceCompliant: boolean | null = null,
  tier: AssessmentTier = "T1",
): RatingResult {
  const earned = DOMAINS.reduce((sum, d) => sum + points[d].earned, 0);
  const available = DOMAINS.reduce((sum, d) => sum + points[d].available, 0);

  const domains = {} as Record<Domain, number>;
  const shares = {} as Record<Domain, number>;
  const contributions = {} as Record<Domain, number>;

  for (const domain of DOMAINS) {
    const p = points[domain];
    domains[domain] = p.available === 0 ? 0 : (p.earned / p.available) * 100;
    shares[domain] = available === 0 ? 0 : (p.available / available) * 100;
    contributions[domain] = available === 0 ? 0 : (p.earned / available) * 100;
  }

  const percent = available === 0 ? 0 : (earned / available) * 100;

  const eligibility = checkEligibility(nonNegotiables);
  const provisionalShield = shieldFor(percent, cycle, tier);

  // Tier 2 clubs are outside the Shield Threshold standards — "Tier 2 Academies
  // that have achieved the Development Committed shield are not bound by the
  // additional Shield Thresholds" (p14) — so nothing caps them. They still meet
  // the gate Non-Negotiables, which is what the same sentence goes on to say.
  const capped =
    tier === "T2" || eligibility.cap === null
      ? provisionalShield
      : minShield(provisionalShield, eligibility.cap);

  const awarded: Shield = capped;
  const badge = awarded === "DEVELOPMENT_COMMITTED";

  return {
    domains,
    points,
    shares,
    contributions,
    earned,
    available,
    percent,
    eligibility,
    provisionalShield,
    shield: eligibility.eligible ? awarded : null,
    // Measured against the capped result, not the awarded one, so the badge —
    // which raises the award rather than lowering it — never reads as a cap.
    cappedDown: eligibility.eligible && capped !== provisionalShield,
    developmentBadge: eligibility.eligible === true && badge,
    licenceCompliant,
    tier,
  };
}

/* -------------------------------------------------------------------------- */
/* Harmonisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which domains are scored across two seasons rather than one.
 *
 * Planning, and only Planning, because it is the only domain whose evidence is
 * retained. Football Queensland does not re-assess every pool's Planning
 * documents every year — their own cycle table runs "All / Retained +5 / All"
 * across the pools and seasons — so in a retained year a club's Planning score
 * rests partly on paperwork assessed last season. Delivery is observed at
 * training and on match day, Outcomes are counted from registrations, and
 * Technical is read off the staff register; all three are taken fresh every
 * year and have nothing to harmonise against.
 *
 * A list rather than a constant so the Unit's decision is in one place if the
 * retained-evidence cycle ever covers another domain.
 */
export const HARMONISED_DOMAINS: Domain[] = ["PLANNING"];

export type HarmonisedDomain = {
  /** The two seasons taken together. */
  percent: number;
  /** That ratio expressed in this season's points, which is what a total needs. */
  points: number;
  /** Harmonised points minus what this season alone scored. Usually negative. */
  diff: number;
  /**
   * POOLED is Football Queensland's arithmetic and needs both seasons' points.
   * MEAN is the fallback for a season imported as a percentage alone.
   */
  basis: "POOLED" | "MEAN";
};

/**
 * Averages a domain across two seasons.
 *
 * Not the mean of the two percentages, which is the obvious reading and the
 * wrong one. FQ pools the raw counts — every point scored across both seasons
 * over every point available across both — so a season assessed on more points
 * carries more of the result. Their sheet has Mitchelton at (276 + 252) of
 * (326 + 272), which is 88.29%; the mean of 84.66% and 92.65% is 88.66%. The
 * gap runs to half a percentage point across their clubs, which is wider than
 * the gaps between adjacent places on the board, so it decides positions.
 *
 * The pooling matters because the two seasons are not the same size: Planning
 * was worth 350 points in 2024, 326 in 2025 and 272 in 2026. Averaging the
 * percentages would silently weight a 272-point season equally with a 350-point
 * one.
 *
 * `prior` therefore wants both of last season's numbers. Given only a
 * percentage — which is all a season imported from FQ's own records leaves
 * behind — the two are weighted equally and `basis` says so, because a number
 * that came from a different formula must not be presented as though it didn't.
 */
export function harmonise(
  current: DomainPoints,
  prior: DomainPoints | { percent: number },
): HarmonisedDomain {
  const priorPoints = "available" in prior && prior.available > 0 ? prior : null;

  const percent = priorPoints
    ? ((priorPoints.earned + current.earned) / (priorPoints.available + current.available)) * 100
    : (("percent" in prior ? prior.percent : 0) +
        (current.available === 0 ? 0 : (current.earned / current.available) * 100)) /
      2;

  const points = (percent / 100) * current.available;

  return {
    percent,
    points,
    diff: points - current.earned,
    basis: priorPoints ? "POOLED" : "MEAN",
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

export type AgreementLevel = "UNSCORED" | "AGREED" | "PARTIAL" | "MINOR" | "MAJOR";

export type CriterionAgreement = {
  criterion: ScorableCriterion;
  entries: AssessorStar[];
  /** Only the assessors who actually scored it. */
  given: number[];
  spread: number;
  level: AgreementLevel;
  /** Assessors holding this item who haven't scored it yet. */
  outstanding: number;
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
 *
 * Agreement needs two people to agree. A criterion carrying one score — because
 * only one assessor holds it, or because the second hasn't scored yet — has a
 * spread of zero for want of anything to differ from, and calling that "Agreed"
 * would record one person's opinion as consensus and let the bulk accept sweep
 * it in unread. It comes back PARTIAL instead, which is why the check is on how
 * many scores there are rather than on the spread alone.
 *
 * A split with somebody still to score keeps its MINOR or MAJOR label: the
 * disagreement is real whatever else arrives, and those are resolved one at a
 * time regardless. Only the settled-looking ones need holding back.
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

  const outstanding = entries.filter((e) => e.stars === null).length;

  if (given.length === 0) {
    return {
      criterion,
      entries,
      given,
      spread: 0,
      level: "UNSCORED",
      outstanding,
      suggested: null,
      final,
    };
  }

  const spread = given[given.length - 1] - given[0];

  // Median, not mean: with three assessors it ignores a single outlier, and it
  // always lands on a whole star, which is the only thing that can be awarded.
  const mid = Math.floor(given.length / 2);
  const suggested =
    given.length % 2 === 1 ? given[mid] : Math.round((given[mid - 1] + given[mid]) / 2);

  // Two independent scores at a minimum, and nobody assigned still to score.
  const complete = given.length >= 2 && outstanding === 0;

  const level: AgreementLevel =
    spread === 0 ? (complete ? "AGREED" : "PARTIAL") : spread === 1 ? "MINOR" : "MAJOR";

  return { criterion, entries, given, spread, level, outstanding, suggested, final };
}

export const AGREEMENT_LABELS: Record<AgreementLevel, string> = {
  UNSCORED: "Not scored",
  AGREED: "Agreed",
  PARTIAL: "Second opinion needed",
  MINOR: "1 star apart",
  MAJOR: "2+ stars apart",
};

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function pct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}
