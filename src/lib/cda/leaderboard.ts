import "server-only";

import { prisma } from "@/lib/db";
import { ASSESSED_DOMAINS } from "@/lib/cda/rubric";
import {
  SHIELD_ORDER,
  assessAgreement,
  computeRating,
  scoreStarDomain,
  scoreTechnicalDomain,
  tierOf,
  type CriterionOutcome,
  type DomainPoints,
  type ScorableCriterion,
} from "@/lib/cda/scoring";
import type { Domain, Shield } from "@prisma-client";

/**
 * Every club in a cycle, ranked, against what they scored the year before.
 *
 * The assessment screens answer "how is this club doing"; nothing answered "how
 * is this club doing compared to the rest, and to itself last season", which is
 * the question the Unit is actually asked — by the board, by the clubs, and by
 * anyone deciding where the development budget goes.
 *
 * Two constraints shaped this file.
 *
 * The first is that it must agree with the assessment screens to the decimal.
 * A leaderboard that disagrees with the club's own report about the club's own
 * score is worse than no leaderboard, so the arithmetic is not reimplemented
 * here: the same pure functions from the scoring engine run over the same
 * inputs, in the same order, with the same tier scoping and the same fallbacks.
 * What changes is only how the rows are fetched.
 *
 * The second is that it must not fetch them per club. `loadAssessment` is a
 * dozen queries for one club, which is right for one screen and unusable for a
 * board — Football Queensland affiliates a couple of hundred clubs. So every
 * table is read once for the whole cycle and grouped in memory, and the cost of
 * the page is flat in the number of clubs.
 */

/** A club's percentages, one per domain, plus the weighted total. */
export type Scores = {
  percent: number;
  domains: Record<Domain, number>;
};

export type Movement = {
  /** Percentage points, this cycle minus last. */
  percent: number;
  domains: Record<Domain, number>;
  /** Places gained (positive) or lost (negative). Null when unranked either year. */
  rank: number | null;
  /** Shields moved up or down the ladder, by rank rather than by name. */
  shield: number;
};

export type Standing = {
  assessmentId: string;
  clubId: string;
  club: string;
  zone: string | null;
  poolId: string | null;
  pool: string | null;
  tier: string | null;
  status: string;
  /**
   * Where the numbers came from. "FROZEN" is the figure the club was given in
   * writing at lock; "PROVISIONAL" is what the current scores produce, which
   * moves every time the Unit resolves a criterion. They are not the same kind
   * of fact and the board must never present them as one.
   */
  basis: "FROZEN" | "PROVISIONAL";
  current: Scores;
  shield: Shield | null;
  eligible: boolean;
  /** Line items settled by the Unit, out of the ones this club is assessed on. */
  settled: number;
  /** Line items carrying any score at all — settled, or an assessor's. */
  scored: number;
  applicable: number;
  /** Null until this club has a score of any kind. */
  rank: number | null;
  prior: (Scores & { shield: Shield | null; rank: number | null }) | null;
  movement: Movement | null;
};

export type CohortAverages = {
  /** Mean of the ranked clubs' totals. */
  percent: number;
  domains: Record<Domain, number>;
};

export type Leaderboard = {
  cycle: { id: string; year: number; name: string };
  priorCycle: { id: string; year: number; name: string } | null;
  standings: Standing[];
  /** Clubs with nothing scored yet. Listed, never ranked. */
  unscored: Standing[];
  /** This cycle's averages, and last cycle's over the clubs that have both. */
  average: CohortAverages;
  priorAverage: CohortAverages | null;
  /** How many of the ranked clubs are still provisional. */
  provisional: number;
  improved: number;
  declined: number;
  comparable: number;
};

const DOMAINS: Domain[] = ["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"];

const zeroDomains = (): Record<Domain, number> => ({
  TECHNICAL: 0,
  PLANNING: 0,
  DELIVERY: 0,
  OUTCOMES: 0,
});

/** Competition ranking: equal scores share a place and the next one skips. */
function rankBy<T>(rows: T[], value: (row: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const ranks = new Map<T, number>();
  let last: number | null = null;
  let place = 0;

  for (const [i, row] of sorted.entries()) {
    const v = value(row);
    if (last === null || v !== last) place = i + 1;
    ranks.set(row, place);
    last = v;
  }
  return ranks;
}

const shieldRank = (s: Shield | null) => (s === null ? -1 : SHIELD_ORDER.indexOf(s));

/**
 * Builds the board for one cycle.
 *
 * `cycleId` is passed rather than looked up so the Unit can read a closed
 * season's board without it silently becoming the current one.
 */
export async function loadLeaderboard(cycleId: string): Promise<Leaderboard> {
  const cycle = await prisma.cycle.findUniqueOrThrow({ where: { id: cycleId } });

  // Last season, by year rather than by "the previous row": cycles are unique
  // per year, and a gap year should read as no comparison rather than quietly
  // comparing 2026 against 2024.
  const priorCycle = await prisma.cycle.findFirst({ where: { year: cycle.year - 1 } });

  const [assessments, criteria, tiers, finals, scores, staff, checks, priorNotices, priorRows] =
    await Promise.all([
      prisma.clubAssessment.findMany({
        where: { cycleId },
        select: {
          id: true,
          clubId: true,
          status: true,
          tierId: true,
          lockedAt: true,
          licenceCompliant: true,
          finalPercent: true,
          technicalPct: true,
          planningPct: true,
          deliveryPct: true,
          outcomesPct: true,
          finalShield: true,
          eligible: true,
          poolId: true,
          club: { select: { id: true, name: true, zone: true } },
          pool: { select: { name: true } },
        },
        orderBy: { club: { name: "asc" } },
      }),
      prisma.criterion.findMany({
        where: { active: true, domain: { in: [...ASSESSED_DOMAINS] } },
        select: {
          id: true,
          code: true,
          title: true,
          domain: true,
          weight: true,
          maxScore: true,
          area: true,
          tiers: { select: { id: true } },
        },
        orderBy: [{ position: "asc" }, { code: "asc" }],
      }),
      prisma.tier.findMany({ orderBy: { position: "asc" } }),
      prisma.finalScore.findMany({
        where: { assessment: { cycleId } },
        select: { assessmentId: true, criterionId: true, stars: true },
      }),
      prisma.assessorScore.findMany({
        where: { assessment: { cycleId } },
        select: { assessmentId: true, criterionId: true, stars: true },
      }),
      prisma.staffMember.findMany({
        where: { assessment: { cycleId } },
        include: { qualification: true },
      }),
      prisma.nonNegotiableResult.findMany({
        where: { assessment: { cycleId }, nonNegotiable: { active: true } },
        select: {
          assessmentId: true,
          verdict: true,
          shieldMet: true,
          nonNegotiable: { select: { code: true, title: true, kind: true } },
        },
      }),
      // The same history `loadAssessment` consults, read once for the cycle: a
      // threshold check on notice two seasons running is repeated
      // non-compliance, and the shield has to reflect that here too.
      prisma.nonNegotiableResult.findMany({
        where: {
          verdict: "ON_NOTICE",
          assessment: { cycle: { year: cycle.year - 1 } },
        },
        select: { assessment: { select: { clubId: true } }, nonNegotiable: { select: { code: true } } },
      }),
      priorCycle
        ? prisma.clubAssessment.findMany({
            where: { cycleId: priorCycle.id, lockedAt: { not: null }, finalPercent: { not: null } },
            select: {
              clubId: true,
              finalPercent: true,
              technicalPct: true,
              planningPct: true,
              deliveryPct: true,
              outcomesPct: true,
              finalShield: true,
              eligible: true,
            },
          })
        : Promise.resolve([]),
    ]);

  /* ------------------------------ grouping -------------------------------- */

  const fallbackTier = tiers[0] ?? null;

  const finalFor = new Map<string, number>();
  for (const f of finals) finalFor.set(`${f.assessmentId}:${f.criterionId}`, f.stars);

  const scoresFor = new Map<string, number[]>();
  for (const s of scores) {
    const key = `${s.assessmentId}:${s.criterionId}`;
    const list = scoresFor.get(key) ?? [];
    list.push(s.stars);
    scoresFor.set(key, list);
  }

  const staffFor = new Map<string, typeof staff>();
  for (const s of staff) {
    const list = staffFor.get(s.assessmentId) ?? [];
    list.push(s);
    staffFor.set(s.assessmentId, list);
  }

  const checksFor = new Map<string, typeof checks>();
  for (const c of checks) {
    const list = checksFor.get(c.assessmentId) ?? [];
    list.push(c);
    checksFor.set(c.assessmentId, list);
  }

  const noticedLastCycle = new Set(
    priorNotices.map((n) => `${n.assessment.clubId}:${n.nonNegotiable.code}`),
  );

  /* -------------------------- prior season, ranked ------------------------- */

  // Ranked across every club that has a frozen result last season, not just the
  // ones still in this cycle. A club that has left the program still occupied a
  // place, and quietly re-ranking last season to exclude it would invent
  // movement nobody made.
  const priorRanks = rankBy(priorRows, (p) => p.finalPercent ?? 0);

  const priorFor = new Map(
    priorRows.map((p) => [
      p.clubId,
      {
        percent: p.finalPercent ?? 0,
        domains: {
          TECHNICAL: p.technicalPct ?? 0,
          PLANNING: p.planningPct ?? 0,
          DELIVERY: p.deliveryPct ?? 0,
          OUTCOMES: p.outcomesPct ?? 0,
        } as Record<Domain, number>,
        shield: p.eligible ? p.finalShield : null,
        rank: priorRanks.get(p) ?? null,
      },
    ]),
  );

  /* ------------------------------ per club -------------------------------- */

  const rows: Standing[] = assessments.map((a) => {
    // Both fallbacks are `loadAssessment`'s: a club with no tier is assessed on
    // the first one, and a cycle with no tiers configured at all is assessed on
    // the whole catalogue.
    const tier = (a.tierId ? tiers.find((t) => t.id === a.tierId) : null) ?? fallbackTier;
    const tierId = tier?.id ?? null;
    const applicable = tierId
      ? criteria.filter((c) => c.tiers.some((t) => t.id === tierId))
      : criteria;

    const technical = scoreTechnicalDomain(
      (staffFor.get(a.id) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        staffRole: s.staffRole,
        yearsExperience: s.yearsExperience,
        employment: s.employment,
        qualification: s.qualification
          ? {
              label: s.qualification.label,
              points: s.qualification.points,
              stream: s.qualification.stream,
            }
          : null,
      })),
      tier?.technicalMaxPoints ?? cycle.technicalMaxPoints,
    );

    let settled = 0;
    let scored = 0;

    const outcomes: CriterionOutcome[] = applicable.map((c) => {
      const key = `${a.id}:${c.id}`;
      const final = finalFor.get(key);
      const given = scoresFor.get(key) ?? [];

      if (final !== undefined) settled += 1;
      if (final !== undefined || given.length > 0) scored += 1;

      // Routed through assessAgreement rather than taking a median here, so the
      // provisional figure on this board is the same median the reconciliation
      // screen offers and the assessment page totals. Entries are built from
      // the scores that exist rather than from the pool's assignments; the
      // median reads only the scores given, so the two agree.
      const agreement = assessAgreement(
        c as ScorableCriterion,
        given.map((stars, i) => ({
          assessorId: String(i),
          assessorName: "",
          stars,
          comment: null,
        })),
        final ?? null,
      );

      return { criterion: c as ScorableCriterion, stars: agreement.final ?? agreement.suggested };
    });

    const points: Record<Domain, DomainPoints> = {
      TECHNICAL: { earned: technical.earned, available: technical.available },
      PLANNING: pointsOf(scoreStarDomain("PLANNING", outcomes)),
      DELIVERY: pointsOf(scoreStarDomain("DELIVERY", outcomes)),
      OUTCOMES: pointsOf(scoreStarDomain("OUTCOMES", outcomes)),
    };

    const rating = computeRating(
      points,
      cycle,
      (checksFor.get(a.id) ?? []).map((c) => ({
        code: c.nonNegotiable.code,
        title: c.nonNegotiable.title,
        verdict: c.verdict,
        kind: c.nonNegotiable.kind,
        shieldMet: c.shieldMet,
        onNoticeLastCycle: noticedLastCycle.has(`${a.clubId}:${c.nonNegotiable.code}`),
      })),
      a.licenceCompliant,
      tierOf(tier?.code),
    );

    // Frozen once locked, for the same reason the assessment page freezes: a
    // criterion reworded in October must not move a rating a club was given in
    // August. The live figure stays available on the club's own page; a board
    // that showed it would be quoting a number nobody has been told.
    const frozen = a.lockedAt !== null && a.finalPercent !== null;

    const current: Scores = frozen
      ? {
          percent: a.finalPercent!,
          domains: {
            TECHNICAL: a.technicalPct ?? 0,
            PLANNING: a.planningPct ?? 0,
            DELIVERY: a.deliveryPct ?? 0,
            OUTCOMES: a.outcomesPct ?? 0,
          },
        }
      : { percent: rating.percent, domains: rating.domains };

    const prior = priorFor.get(a.clubId) ?? null;
    const shield = frozen ? (a.eligible ? a.finalShield : null) : rating.shield;

    return {
      assessmentId: a.id,
      clubId: a.clubId,
      club: a.club.name,
      zone: a.club.zone,
      poolId: a.poolId,
      pool: a.pool?.name ?? null,
      tier: tier?.name ?? null,
      status: a.status,
      basis: frozen ? "FROZEN" : "PROVISIONAL",
      current,
      shield,
      eligible: frozen ? a.eligible === true : rating.eligibility.eligible,
      settled,
      scored,
      applicable: applicable.length,
      rank: null,
      prior,
      movement: prior
        ? {
            percent: current.percent - prior.percent,
            domains: Object.fromEntries(
              DOMAINS.map((d) => [d, current.domains[d] - prior.domains[d]]),
            ) as Record<Domain, number>,
            rank: null,
            shield: shieldRank(shield) - shieldRank(prior.shield),
          }
        : null,
    };
  });

  /* ------------------------------- ranking -------------------------------- */

  // A club nobody has scored yet is not last — it is not in the race. Ranking
  // it at 0% would put a club that hasn't submitted below one that genuinely
  // scored badly, and the board would be read as saying so.
  //
  // A frozen result counts even with no line items behind it, and that is not a
  // corner case: a season that predates the portal arrives as the result FQ
  // holds, written onto the frozen columns, because the evidence behind it was
  // never in here to import. Testing the line items alone read a whole
  // published season as unscored and ranked nobody in it.
  const isRanked = (r: Standing) => r.basis === "FROZEN" || r.scored > 0;
  const ranked = rows.filter(isRanked);
  const unscored = rows.filter((r) => !isRanked(r));

  const ranks = rankBy(ranked, (r) => r.current.percent);
  for (const row of ranked) {
    row.rank = ranks.get(row) ?? null;
    if (row.movement && row.prior?.rank != null && row.rank != null) {
      // Positive is upward, so the sign matches the arrow: rank 8 to rank 3 is
      // five places gained, not minus five.
      row.movement.rank = row.prior.rank - row.rank;
    }
  }

  ranked.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.club.localeCompare(b.club));

  /* ------------------------------- cohort --------------------------------- */

  const average = averageOf(ranked.map((r) => r.current));
  // Last season's average over the clubs on this board that have both figures,
  // so "the cohort moved 3 points" is a statement about the same clubs rather
  // than about two different populations.
  const comparableRows = ranked.filter((r) => r.prior !== null);
  const priorAverage = comparableRows.length
    ? averageOf(comparableRows.map((r) => r.prior!))
    : null;

  return {
    cycle: { id: cycle.id, year: cycle.year, name: cycle.name },
    priorCycle: priorCycle
      ? { id: priorCycle.id, year: priorCycle.year, name: priorCycle.name }
      : null,
    standings: ranked,
    unscored,
    average,
    priorAverage,
    provisional: ranked.filter((r) => r.basis === "PROVISIONAL").length,
    improved: comparableRows.filter((r) => r.movement!.percent > 0).length,
    declined: comparableRows.filter((r) => r.movement!.percent < 0).length,
    comparable: comparableRows.length,
  };
}

function pointsOf(result: { earned: number; available: number }): DomainPoints {
  return { earned: result.earned, available: result.available };
}

function averageOf(rows: Scores[]): CohortAverages {
  if (rows.length === 0) return { percent: 0, domains: zeroDomains() };

  const domains = zeroDomains();
  for (const d of DOMAINS) {
    domains[d] = rows.reduce((sum, r) => sum + r.domains[d], 0) / rows.length;
  }
  return { percent: rows.reduce((sum, r) => sum + r.percent, 0) / rows.length, domains };
}

/**
 * The cycles worth offering on the board, newest first.
 *
 * A cycle in SETUP has no assessments, so it would render an empty board and
 * look broken; it is left out until it has clubs in it.
 */
export async function boardCycles() {
  return prisma.cycle.findMany({
    where: { assessments: { some: {} } },
    select: { id: true, year: true, name: true },
    orderBy: { year: "desc" },
  });
}
