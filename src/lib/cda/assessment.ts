/*
 * Deliberately *not* marked "server-only", unlike the other data-access modules
 * here.
 *
 * The seed script has to freeze a demo assessment through exactly the same code
 * path a real lock uses, or the demo data drifts from what the app would
 * actually produce — and "server-only" throws the moment a plain Node script
 * loads it. The guard would also be redundant: this module imports the Prisma
 * client, which pulls a native driver that cannot be bundled for the browser, so
 * an accidental import from a Client Component fails at build time anyway.
 */
import { prisma } from "@/lib/db";
import {
  assessAgreement,
  checkEligibility,
  computeRating,
  scoreAreas,
  scoreStarDomain,
  scoreTechnicalDomain,
  shieldFor,
  type AreaResult,
  type AssessorStar,
  type CriterionAgreement,
  type CriterionOutcome,
  type DomainResult,
  type RatingResult,
  type ScorableCriterion,
  type TechnicalResult,
} from "@/lib/cda/scoring";
import { ASSESSED_DOMAINS } from "@/lib/cda/rubric";
import {
  STRUCTURE_STANDARDS_2026,
  scoreStructure,
  type StructureResult,
  type StructureRoleSpec,
} from "@/lib/cda/structure";
import { displayName } from "@/lib/format";
import type { Domain, RoleStatus, Shield } from "@prisma-client";

/**
 * Assembles the whole picture of one assessment: staff, criteria, every
 * assessor's scores, the reconciled scores, the Non-Negotiables, and the rating
 * that falls out of them.
 *
 * One function, used by all three roles, because the alternative — each screen
 * assembling its own — is how a club's dashboard and the CDU's report end up
 * quietly disagreeing about the same club's score.
 */

export type AssessmentOverview = {
  assessment: Awaited<ReturnType<typeof loadAssessmentRow>>;
  technical: TechnicalResult;
  domains: Record<Domain, DomainResult | null>;
  /** Each domain broken into FQ's macro-areas, in catalogue order. */
  areas: AreaResult[];
  /** The CDU's paragraph per area, keyed "DOMAIN|Area". */
  areaNotes: Map<string, string>;
  agreements: CriterionAgreement[];
  rating: RatingResult;
  /**
   * The rating the current scores actually produce, ignoring anything frozen.
   * Identical to `rating` before a lock, and different after one.
   */
  live: RatingResult;
  /** True when the stored, frozen result is what's being shown. */
  frozen: boolean;
  /** Everyone holding a line item on this club's pool, with their progress. */
  assessors: { id: string; name: string; items: number; submitted: number }[];
  criteria: ScorableCriterion[];
  unresolved: CriterionAgreement[];
  /** Criteria nobody has been assigned yet — invisible otherwise. */
  unassigned: CriterionAgreement[];
};

function loadAssessmentRow(id: string) {
  return prisma.clubAssessment.findUniqueOrThrow({
    where: { id },
    include: {
      club: true,
      cycle: true,
      pool: true,
      staff: { include: { qualification: true }, orderBy: { name: "asc" } },
      scores: { include: { assessor: true } },
      finalScores: true,
      // Retired checks drop out. Their result rows are left in place as a
      // record of what was asked at the time, but a check FQ has withdrawn must
      // not go on holding a shield back — and a retired check sitting at PENDING
      // forever would do exactly that.
      nonNegotiables: {
        where: { nonNegotiable: { active: true } },
        include: { nonNegotiable: true },
        orderBy: { nonNegotiable: { position: "asc" } },
      },
      metrics: true,
      areaNotes: true,
    },
  });
}

/** Stable key for an area note. Area names contain spaces; the domain doesn't. */
export function areaKey(domain: Domain, area: string | null) {
  return `${domain}|${area ?? ""}`;
}

/**
 * Which clubs a given line item is actually scored on.
 *
 * A pool is a group of clubs, and a line item is allocated across the whole
 * pool — but Tier 2 is assessed on 18 of the same coded items, not all 54. So a
 * pool holding both tiers means some allocated items simply do not apply to
 * some of its clubs.
 *
 * Without this, the assessor's screen listed every club in the pool for every
 * item they held and invited scores on all of them. Nothing broke and no rating
 * was wrong — scoring scopes to the club's own tier when it computes — but the
 * scores collected outside a club's tier were quietly discarded, which is
 * assessor effort spent for nothing, with no warning that it was being wasted.
 *
 * Returns a predicate rather than a filtered list because the two callers want
 * different things from the same answer: the assessor's screen drops the clubs,
 * the CDU's pool page counts them.
 */
export async function tierScope(
  assessments: { id: string; tierId: string | null }[],
  criterionIds: string[],
): Promise<(criterionId: string, assessmentId: string) => boolean> {
  const [fallback, criteria] = await Promise.all([
    prisma.tier.findFirst({ orderBy: { position: "asc" }, select: { id: true } }),
    prisma.criterion.findMany({
      where: { id: { in: criterionIds } },
      select: { id: true, tiers: { select: { id: true } } },
    }),
  ]);

  // Same fallback the scoring path uses, so this agrees with what the rating
  // will actually count rather than with a second opinion about it.
  const tierOf = new Map(
    assessments.map((a) => [a.id, a.tierId ?? fallback?.id ?? null] as const),
  );
  const tiersFor = new Map(criteria.map((c) => [c.id, new Set(c.tiers.map((t) => t.id))]));

  return (criterionId, assessmentId) => {
    const allowed = tiersFor.get(criterionId);
    // A criterion attached to no tier at all, or a club with no tier and no
    // tiers configured, is a setup problem rather than an exclusion. Showing
    // the club is the recoverable failure; hiding it silently is not.
    if (!allowed || allowed.size === 0) return true;
    const tier = tierOf.get(assessmentId);
    if (!tier) return true;
    return allowed.has(tier);
  };
}

export async function loadAssessment(id: string): Promise<AssessmentOverview> {
  const assessment = await loadAssessmentRow(id);

  // Scoped to the club's tier. Tier 2 is assessed on a subset of the same coded
  // items, so its maximum points — and therefore its percentage — come from
  // fewer line items. Scoring every club against all of them would give a Tier 2
  // club a denominator it was never assessed against.
  const tier =
    (assessment.tierId
      ? await prisma.tier.findUnique({ where: { id: assessment.tierId } })
      : null) ?? (await prisma.tier.findFirst({ orderBy: { position: "asc" } }));
  const tierId = tier?.id ?? null;

  const criteria = await prisma.criterion.findMany({
    where: {
      active: true,
      domain: { in: [...ASSESSED_DOMAINS] },
      ...(tierId ? { tiers: { some: { id: tierId } } } : {}),
    },
    // Position alone, deliberately. Positions are assigned across the whole
    // catalogue in domain order, so this yields Planning → Delivery → Outcomes.
    // Ordering by `domain` first would not: SQLite stores enums as TEXT, so
    // "asc" is alphabetical — Delivery, Outcomes, Planning — which is neither
    // the schema's order nor the order FQ presents the domains in.
    orderBy: [{ position: "asc" }, { code: "asc" }],
    select: {
      id: true, code: true, title: true, domain: true,
      weight: true, maxScore: true, area: true,
    },
  });

  /* ------------------------------- Technical ------------------------------ */

  const technical = scoreTechnicalDomain(
    assessment.staff.map((s) => ({
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
    // A tier may state its own Technical maximum; most inherit the cycle's.
    tier?.technicalMaxPoints ?? assessment.cycle.technicalMaxPoints,
  );

  /* --------------------------- Assessor agreement -------------------------- */

  // Assessors are now per line item, so each criterion has its own two or three
  // — not one panel covering the whole club. The comparison is drawn from the
  // assignments in this club's pool, which is also what makes an unassigned
  // criterion visibly unassigned rather than merely unscored.
  const assignments = assessment.poolId
    ? await prisma.criterionAssignment.findMany({
        where: { poolId: assessment.poolId },
        include: { assessor: true },
        orderBy: { slot: "asc" },
      })
    : [];

  const byCriterion = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byCriterion.get(a.criterionId) ?? [];
    list.push(a);
    byCriterion.set(a.criterionId, list);
  }

  const finalByCriterion = new Map(assessment.finalScores.map((f) => [f.criterionId, f]));

  const agreements = criteria.map((criterion) => {
    const held = byCriterion.get(criterion.id) ?? [];

    const entries: AssessorStar[] = held.map((a) => {
      const score = assessment.scores.find(
        (s) => s.assessorId === a.assessorId && s.criterionId === criterion.id,
      );
      return {
        assessorId: a.assessorId,
        assessorName: displayName(a.assessor),
        stars: score ? score.stars : null,
        comment: score?.comment ?? null,
      };
    });

    return assessAgreement(criterion, entries, finalByCriterion.get(criterion.id)?.stars ?? null);
  });

  // Everyone with a hand in this club, for the summary panels.
  const assessors = [...new Map(assignments.map((a) => [a.assessorId, a])).values()]
    .map((a) => ({
      id: a.assessorId,
      name: displayName(a.assessor),
      items: assignments.filter((x) => x.assessorId === a.assessorId).length,
      submitted: assignments.filter((x) => x.assessorId === a.assessorId && x.submittedAt).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /* ------------------------------- Domains -------------------------------- */

  // Before the CDU reconciles anything there is no final score to work from, so
  // the live view falls back to the median of the assessors. It's clearly
  // labelled as provisional everywhere it's shown — but showing nothing until
  // reconciliation would leave the CDU steering the process blind.
  const outcomes: CriterionOutcome[] = agreements.map((a) => ({
    criterion: a.criterion,
    stars: a.final ?? a.suggested,
  }));

  const areas = scoreAreas(outcomes);
  const areaNotes = new Map(
    assessment.areaNotes.map((n) => [areaKey(n.domain, n.area), n.comment]),
  );

  const domains: Record<Domain, DomainResult | null> = {
    TECHNICAL: null,
    PLANNING: scoreStarDomain("PLANNING", outcomes),
    DELIVERY: scoreStarDomain("DELIVERY", outcomes),
    OUTCOMES: scoreStarDomain("OUTCOMES", outcomes),
  };

  /* ------------------------------- Rating --------------------------------- */

  const nonNegotiables = assessment.nonNegotiables.map((r) => ({
    code: r.nonNegotiable.code,
    title: r.nonNegotiable.title,
    verdict: r.verdict,
    kind: r.nonNegotiable.kind,
    shieldMet: r.shieldMet,
  }));

  const live = computeRating(
    {
      TECHNICAL: { earned: technical.earned, available: technical.available },
      PLANNING: { earned: domains.PLANNING!.earned, available: domains.PLANNING!.available },
      DELIVERY: { earned: domains.DELIVERY!.earned, available: domains.DELIVERY!.available },
      OUTCOMES: { earned: domains.OUTCOMES!.earned, available: domains.OUTCOMES!.available },
    },
    assessment.cycle,
    nonNegotiables,
    assessment.licenceCompliant,
  );

  // Once locked, the stored numbers are the answer. Recomputing would let a
  // later edit to a criterion's weight silently change a rating the club has
  // already been given in writing.
  const frozen = assessment.lockedAt !== null && assessment.finalPercent !== null;

  const rating: RatingResult = frozen ? freeze() : live;

  function freeze(): RatingResult {
    const awarded = (assessment.finalShield ?? "NONE") as Shield;
    // The shield the frozen percentage earns on its own. Reconstructed rather
    // than stored: the thresholds belong to this assessment's own cycle, so
    // this is the same arithmetic that ran at lock, and it is what lets the
    // report still explain a cap months after publication.
    const provisional = shieldFor(assessment.finalPercent!, assessment.cycle);

    return {
      ...live,
      // The frozen percentages are what the club was told. The points columns
      // stay live: they describe the current catalogue, and are only ever
      // shown as supporting detail beside the frozen figures.
      domains: {
        TECHNICAL: assessment.technicalPct ?? 0,
        PLANNING: assessment.planningPct ?? 0,
        DELIVERY: assessment.deliveryPct ?? 0,
        OUTCOMES: assessment.outcomesPct ?? 0,
      },
      percent: assessment.finalPercent!,
      shield: assessment.eligible ? awarded : null,
      provisionalShield: provisional,
      // The badge raises the award above what the score alone earned, so it is
      // never a cap — checking for it here keeps a badged club from being told
      // its shield was held down.
      cappedDown:
        assessment.eligible === true &&
        awarded !== "DEVELOPMENT_COMMITTED" &&
        awarded !== provisional,
      developmentBadge: assessment.eligible === true && awarded === "DEVELOPMENT_COMMITTED",
      eligibility: checkEligibility(nonNegotiables),
    };
  }

  return {
    assessment,
    technical,
    domains,
    agreements,
    rating,
    /**
     * The rating as the current scores actually produce it, ignoring anything
     * frozen. Identical to `rating` before a lock and different after one.
     *
     * Exposed because freezing needs it. `rating` deliberately returns the
     * stored figures once locked, so a second freeze — which is exactly what a
     * review revision triggers — would otherwise write the old numbers straight
     * back and silently discard the revision.
     */
    live,
    frozen,
    assessors,
    areas,
    areaNotes,
    criteria,
    unresolved: agreements.filter((a) => a.final === null),
    unassigned: agreements.filter((a) => a.entries.length === 0),
  };
}

/**
 * Freezes the result onto the assessment row.
 *
 * Called at lock time and nowhere else. Everything before that point recomputes
 * on every read, which is what keeps the CDU's live view honest; everything
 * after reads these columns, which is what keeps a published rating stable.
 */
export async function freezeResult(assessmentId: string, lockedById: string) {
  const overview = await loadAssessment(assessmentId);
  // The *live* rating, never the frozen one. Locking an already-locked
  // assessment is a real path — a review revision recomputes through here — and
  // reading `rating` there would write the stored figures straight back and
  // silently throw the revision away.
  const { live: rating, technical, domains } = overview;

  return prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: {
      status: "LOCKED",
      lockedAt: new Date(),
      lockedById,
      technicalPct: technical.percent,
      planningPct: domains.PLANNING!.percent,
      deliveryPct: domains.DELIVERY!.percent,
      outcomesPct: domains.OUTCOMES!.percent,
      finalPercent: rating.percent,
      // The shield the club is actually awarded, after any threshold cap. When
      // a gate check makes them ineligible there is no award to store, so the
      // shield the score alone earned goes in instead — `eligible` is what
      // decides whether anything is shown, and the CDU still wants the figure.
      finalShield: rating.shield ?? rating.provisionalShield,
      eligible: rating.eligibility.eligible,
    },
  });
}

/**
 * Creates the assessment for a club in a cycle, along with an empty
 * Non-Negotiable row per active check.
 *
 * The rows are created up front rather than on first answer so that "9 checks,
 * 0 answered" is a real state the club can see a checklist for, instead of an
 * empty page that looks like nothing is required.
 */
export async function ensureAssessment(clubId: string, cycleId: string) {
  const existing = await prisma.clubAssessment.findUnique({
    where: { clubId_cycleId: { clubId, cycleId } },
  });
  if (existing) return existing;

  const [checks, club] = await Promise.all([
    prisma.nonNegotiable.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    prisma.club.findUnique({ where: { id: clubId }, select: { tierId: true } }),
  ]);

  return prisma.clubAssessment.create({
    data: {
      clubId,
      cycleId,
      // Inherited from the club, so a tier recorded before the cycle existed
      // still reaches the season it applies to. The assessment keeps its own
      // copy from here: moving a club between tiers must not rewrite a season
      // already scored.
      tierId: club?.tierId ?? null,
      nonNegotiables: {
        create: checks.map((c) => ({ nonNegotiableId: c.id })),
      },
    },
  });
}

/** The cycle everything defaults to: the newest one that isn't still in setup. */
export async function activeCycle() {
  return (
    (await prisma.cycle.findFirst({
      where: { status: { not: "SETUP" } },
      orderBy: { year: "desc" },
    })) ?? (await prisma.cycle.findFirst({ orderBy: { year: "desc" } }))
  );
}

/* -------------------------------------------------------------------------- */
/* Club Structure (NN7)                                                       */
/* -------------------------------------------------------------------------- */

export type StructureOverview = {
  roles: (StructureRoleSpec & { status: RoleStatus; holderName: string | null; note: string | null })[];
  result: StructureResult;
  /** False when the cycle has no standard set, so nothing can be computed. */
  configured: boolean;
};

/**
 * Loads a club's recorded structure and works out what it computes to.
 *
 * The standards belong to the assessment's own cycle, so a club published under
 * the 2026 bar keeps being measured against it after 2027's rows are added —
 * the same reason the shield thresholds live on the cycle.
 */
export async function loadStructure(assessmentId: string): Promise<StructureOverview> {
  const assessment = await prisma.clubAssessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: { id: true, cycleId: true },
  });

  const [roleRows, entries, standardRows] = await Promise.all([
    prisma.structureRole.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
    }),
    prisma.structureEntry.findMany({ where: { assessmentId } }),
    prisma.structureStandard.findMany({
      where: { cycleId: assessment.cycleId },
      include: { roles: true },
    }),
  ]);

  const byRole = new Map(entries.map((e) => [e.roleId, e]));

  const roles = roleRows.map((r) => {
    const entry = byRole.get(r.id);
    return {
      id: r.id,
      code: r.code,
      label: r.label,
      kind: r.kind,
      counts: r.counts,
      status: entry?.status ?? ("ABSENT" as RoleStatus),
      holderName: entry?.holderName ?? null,
      note: entry?.note ?? null,
    };
  });

  const result = scoreStructure(
    roles,
    roles.map((r) => ({ roleId: r.id, status: r.status })),
    standardRows.map((s) => ({
      shield: s.shield,
      functionsRequired: s.functionsRequired,
      roles: s.roles.map((rr) => ({
        roleId: rr.roleId,
        required: rr.required,
        minQualLevel: rr.minQualLevel,
        requireFullTime: rr.requireFullTime,
      })),
    })),
  );

  return { roles, result, configured: standardRows.length > 0 };
}

/**
 * Writes the computed level onto NN7's result row.
 *
 * Called whenever a club edits its structure. `shieldMetDerived` always tracks
 * the computation; `shieldMet` — the level that actually caps the shield — is
 * only moved along with it while the Unit hasn't decided otherwise. Once they
 * have recorded an override, a later edit updates what the rules say without
 * silently reversing their decision.
 */
export async function syncStructureLevel(assessmentId: string) {
  const check = await prisma.nonNegotiableResult.findFirst({
    where: {
      assessmentId,
      nonNegotiable: { code: STRUCTURE_CHECK_CODE, active: true },
    },
  });
  if (!check) return;

  const { result, configured } = await loadStructure(assessmentId);
  if (!configured) return;

  await prisma.nonNegotiableResult.update({
    where: { id: check.id },
    data: {
      shieldMetDerived: result.level,
      ...(check.overrideReason ? {} : { shieldMet: check.verdict === "PASS" ? result.level : check.shieldMet }),
    },
  });
}

/** The Non-Negotiable whose level this computes. */
export const STRUCTURE_CHECK_CODE = "NN7";

/**
 * Gives one cycle its per-shield structure bar, if it hasn't got one.
 *
 * Called when a cycle is created from the portal and again on every boot, so an
 * instance that has never run the demo still computes NN7. Only creates what is
 * missing: once clubs are being judged against a bar, neither a redeploy nor a
 * second call may move it.
 *
 * Every cycle currently gets the 2026 figures, because they are the only ones
 * Football Queensland has published. 2027 and 2028 raise the coverage counts —
 * Gold to 9 and then 11 — and when FQ issues them they belong here as a
 * per-year table rather than as an edit to this one.
 */
export async function ensureCycleStandards(cycleId: string) {
  const roles = new Map(
    (await prisma.structureRole.findMany({ select: { id: true, code: true } })).map((r) => [
      r.code,
      r.id,
    ]),
  );
  if (roles.size === 0) return;

  for (const std of STRUCTURE_STANDARDS_2026) {
    const existing = await prisma.structureStandard.findUnique({
      where: { cycleId_shield: { cycleId, shield: std.shield } },
    });
    if (existing) continue;

    await prisma.structureStandard.create({
      data: {
        cycleId,
        shield: std.shield,
        functionsRequired: std.functionsRequired,
        roles: {
          create: std.roles
            .filter((r) => roles.has(r.role))
            .map((r) => ({
              roleId: roles.get(r.role)!,
              required: r.required ?? false,
              minQualLevel: r.minQualLevel ?? 0,
              requireFullTime: r.requireFullTime ?? false,
            })),
        },
      },
    });
  }
}
