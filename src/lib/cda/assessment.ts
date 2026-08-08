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
  scoreStarDomain,
  scoreTechnicalDomain,
  type AssessorStar,
  type CriterionAgreement,
  type CriterionOutcome,
  type DomainResult,
  type RatingResult,
  type ScorableCriterion,
  type TechnicalResult,
} from "@/lib/cda/scoring";
import { ASSESSED_DOMAINS } from "@/lib/cda/rubric";
import { displayName } from "@/lib/format";
import type { Domain, Shield } from "@prisma-client";

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
  agreements: CriterionAgreement[];
  rating: RatingResult;
  /** True when the stored, frozen result is what's being shown. */
  frozen: boolean;
  assessors: { id: string; name: string; submittedAt: Date | null }[];
  criteria: ScorableCriterion[];
  unresolved: CriterionAgreement[];
};

function loadAssessmentRow(id: string) {
  return prisma.clubAssessment.findUniqueOrThrow({
    where: { id },
    include: {
      club: true,
      cycle: true,
      staff: { include: { qualification: true }, orderBy: { name: "asc" } },
      assessors: { include: { assessor: true } },
      scores: { include: { assessor: true } },
      finalScores: true,
      nonNegotiables: { include: { nonNegotiable: true } },
      metrics: true,
    },
  });
}

export async function loadAssessment(id: string): Promise<AssessmentOverview> {
  const assessment = await loadAssessmentRow(id);

  const criteria = await prisma.criterion.findMany({
    where: { active: true, domain: { in: [...ASSESSED_DOMAINS] } },
    // Position alone, deliberately. Positions are assigned across the whole
    // catalogue in domain order, so this yields Planning → Delivery → Outcomes.
    // Ordering by `domain` first would not: SQLite stores enums as TEXT, so
    // "asc" is alphabetical — Delivery, Outcomes, Planning — which is neither
    // the schema's order nor the order FQ presents the domains in.
    orderBy: [{ position: "asc" }, { code: "asc" }],
    select: { id: true, code: true, title: true, domain: true, weight: true },
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
  );

  /* --------------------------- Assessor agreement -------------------------- */

  const assessors = assessment.assessors
    .map((a) => ({
      id: a.assessorId,
      name: displayName(a.assessor),
      submittedAt: a.submittedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const finalByCriterion = new Map(assessment.finalScores.map((f) => [f.criterionId, f]));

  const agreements = criteria.map((criterion) => {
    const entries: AssessorStar[] = assessors.map((a) => {
      const score = assessment.scores.find(
        (s) => s.assessorId === a.id && s.criterionId === criterion.id,
      );
      return {
        assessorId: a.id,
        assessorName: a.name,
        stars: score ? score.stars : null,
        comment: score?.comment ?? null,
      };
    });

    return assessAgreement(criterion, entries, finalByCriterion.get(criterion.id)?.stars ?? null);
  });

  /* ------------------------------- Domains -------------------------------- */

  // Before the CDU reconciles anything there is no final score to work from, so
  // the live view falls back to the median of the assessors. It's clearly
  // labelled as provisional everywhere it's shown — but showing nothing until
  // reconciliation would leave the CDU steering the process blind.
  const outcomes: CriterionOutcome[] = agreements.map((a) => ({
    criterion: a.criterion,
    stars: a.final ?? a.suggested,
  }));

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
  }));

  const live = computeRating(
    {
      TECHNICAL: technical.percent,
      PLANNING: domains.PLANNING!.percent,
      DELIVERY: domains.DELIVERY!.percent,
      OUTCOMES: domains.OUTCOMES!.percent,
    },
    assessment.cycle,
    nonNegotiables,
  );

  // Once locked, the stored numbers are the answer. Recomputing would let a
  // later edit to a criterion's weight silently change a rating the club has
  // already been given in writing.
  const frozen = assessment.lockedAt !== null && assessment.finalPercent !== null;

  const rating: RatingResult = frozen
    ? {
        ...live,
        domains: {
          TECHNICAL: assessment.technicalPct ?? 0,
          PLANNING: assessment.planningPct ?? 0,
          DELIVERY: assessment.deliveryPct ?? 0,
          OUTCOMES: assessment.outcomesPct ?? 0,
        },
        percent: assessment.finalPercent!,
        shield: assessment.eligible ? ((assessment.finalShield ?? "NONE") as Shield) : null,
        provisionalShield: (assessment.finalShield ?? "NONE") as Shield,
        eligibility: checkEligibility(nonNegotiables),
      }
    : live;

  return {
    assessment,
    technical,
    domains,
    agreements,
    rating,
    frozen,
    assessors,
    criteria,
    unresolved: agreements.filter((a) => a.final === null),
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
  const { rating, technical, domains } = overview;

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
      finalShield: rating.provisionalShield,
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

  const checks = await prisma.nonNegotiable.findMany({
    where: { active: true },
    orderBy: { position: "asc" },
  });

  return prisma.clubAssessment.create({
    data: {
      clubId,
      cycleId,
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
