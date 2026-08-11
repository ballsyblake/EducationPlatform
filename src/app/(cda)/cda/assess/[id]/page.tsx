import { Stars, StarScale } from "@/components/cda/stars";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import {
  RELEASED_STATUSES,
  assessorCanScore,
  requireAssessor,
  requireAssignment,
} from "@/lib/cda/access";
import { DOMAIN_LABELS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";
import { ClubScoreCard, type ClubScoreData } from "./club-score-card";
import { SubmitLineItem } from "./submit-line-item";

export const metadata = { title: "Score a line item" };

/**
 * One line item, every club in the pool.
 *
 * The evidence points are stated once at the top rather than repeated per club:
 * the assessor is applying a single definition twelve times, and seeing it once
 * is what makes that a single standard rather than twelve.
 */
export default async function ScoreLineItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assessor = await requireAssessor();
  const assignment = await requireAssignment(assessor.id, id);

  const { criterion, pool } = assignment;

  const assessments = await prisma.clubAssessment.findMany({
    where: { poolId: pool.id },
    include: {
      club: true,
      scores: {
        where: { assessorId: assessor.id, criterionId: criterion.id },
        include: { evidence: { select: { subCriterionId: true } } },
      },
    },
    orderBy: { club: { name: "asc" } },
  });

  // Last cycle's confirmed score for this line item, per club — the first thing
  // to sanity-check a new score against.
  const priorScores = await prisma.finalScore.findMany({
    where: {
      criterionId: criterion.id,
      assessment: {
        clubId: { in: assessments.map((a) => a.clubId) },
        cycleId: { not: pool.cycleId },
        status: { in: [...RELEASED_STATUSES] },
      },
    },
    include: { assessment: { select: { clubId: true, cycle: { select: { year: true } } } } },
  });

  const priorByClub = new Map<string, number>();
  for (const p of priorScores) {
    // Most recent published cycle wins if a club has several.
    const existing = priorByClub.get(p.assessment.clubId);
    if (existing === undefined) priorByClub.set(p.assessment.clubId, p.stars);
  }

  const clubs: ClubScoreData[] = assessments.map((a) => {
    const score = a.scores[0];
    return {
      assessmentId: a.id,
      clubName: a.club.name,
      clubZone: a.club.zone,
      priorScore: priorByClub.get(a.clubId) ?? null,
      savedScore: score ? score.stars : null,
      metIds: score ? score.evidence.map((e) => e.subCriterionId) : [],
      comment: score?.comment ?? "",
      open: assessorCanScore(a.status),
    };
  });

  // Completion is measured against the clubs that are actually open, since a
  // club still entering its own data cannot be scored by anyone.
  const scorable = clubs.filter((c) => c.open);
  const scored = scorable.filter((c) => c.savedScore !== null).length;
  const waiting = clubs.length - scorable.length;
  const editable = assignment.submittedAt === null;

  const thresholds = {
    oneStarAt: criterion.oneStarAt,
    twoStarAt: criterion.twoStarAt,
    threeStarAt: criterion.threeStarAt,
    fourStarAt: criterion.fourStarAt,
    maxScore: criterion.maxScore,
  };

  return (
    <>
      <PageHeader
        title={`${criterion.code} — ${criterion.title}`}
        subtitle={
          <>
            Pool {pool.name} · {DOMAIN_LABELS[criterion.domain]}
            {criterion.area ? ` · ${criterion.area}` : ""} ·{" "}
            {criterion.mode === "OBSERVATION" ? "Observation based" : "Evidence based"} ·{" "}
            {pool.cycle.name}
          </>
        }
        breadcrumb={{ href: "/cda/assess", label: "My line items" }}
        action={assignment.slot === 3 ? <Badge tone="info">Tiebreaker</Badge> : undefined}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Scored"
          value={`${scored}/${scorable.length}`}
          tone={scorable.length > 0 && scored === scorable.length ? "good" : "warn"}
          hint={
            waiting > 0
              ? `${waiting} club${waiting === 1 ? "" : "s"} not yet submitted`
              : "Clubs in this pool"
          }
        />
        <StatTile
          label="Worth"
          value={`${criterion.maxScore * criterion.weight} pts`}
          hint={`Max ${criterion.maxScore} × weighting ${criterion.weight}`}
        />
        <StatTile
          label="Evidence points"
          value={criterion.subCriteria.length}
          hint="Per club"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0 space-y-4">
          <div className="card card-pad">
            <h2 className="font-semibold text-ink-900">What you&apos;re looking for</h2>
            {criterion.description && (
              <p className="mt-1 text-sm text-ink-600">{criterion.description}</p>
            )}
            <ol className="mt-3 space-y-1.5">
              {criterion.subCriteria.map((sub, i) => (
                <li key={sub.id} className="flex gap-2.5 text-sm text-ink-700">
                  <span className="text-xs text-ink-400">{i + 1}</span>
                  <span>{sub.text}</span>
                </li>
              ))}
            </ol>
            {criterion.evidenceProvisional && (
              <p className="mt-3 rounded-lg bg-status-orange-bg px-3 py-2 text-xs text-status-orange-fg">
                These evidence points are a working draft, not Football Queensland&apos;s published
                wording for this line item. Score against them as written and raise anything that
                reads wrong with the Club Assessment Unit.
              </p>
            )}

            <div className="mt-3 border-t border-ink-200 pt-3">
              <StarScale
                {...thresholds}
                total={criterion.subCriteria.length}
                met={criterion.subCriteria.length}
              />
            </div>
          </div>

          {clubs.length === 0 ? (
            <EmptyState
              title="No clubs in this pool yet"
              description="The Club Assessment Unit hasn't placed any clubs in this pool."
            />
          ) : (
            clubs.map((club) => (
              <ClubScoreCard
                key={club.assessmentId}
                assignmentId={id}
                club={club}
                subCriteria={criterion.subCriteria.map((s) => ({ id: s.id, text: s.text }))}
                thresholds={thresholds}
                editable={editable}
              />
            ))
          )}
        </div>

        <aside className="space-y-4">
          <SubmitLineItem
            assignmentId={id}
            code={criterion.code}
            scored={scored}
            total={scorable.length}
            submittedAt={assignment.submittedAt}
          />

          <div className="card">
            <h2 className="border-b border-ink-200 px-5 py-3 font-semibold text-ink-900">
              Across the pool
            </h2>
            <div className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
              {clubs.map((c) => (
                <a
                  key={c.assessmentId}
                  href={`#${c.assessmentId}`}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-ink-50"
                >
                  <span className="min-w-0 truncate text-ink-700">{c.clubName}</span>
                  {c.savedScore === null ? (
                    <Badge tone="muted">—</Badge>
                  ) : (
                    <Stars value={c.savedScore} max={criterion.maxScore} size="sm" />
                  )}
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
