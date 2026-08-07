import Link from "next/link";
import { Stars } from "@/components/cda/stars";
import { Badge, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { assessorCanScore, requireAssessmentAccess, requireAssessor } from "@/lib/cda/access";
import { ASSESSED_DOMAINS, DOMAIN_BLURBS, DOMAIN_LABELS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";
import { CriterionCard, type CriterionCardData } from "./criterion-card";
import { SubmitScoring } from "./submit-scoring";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Score a club" };

export default async function AssessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ domain?: string }>;
}) {
  const { id } = await params;
  const { domain: domainParam } = await searchParams;

  const assessor = await requireAssessor();
  const assessment = await requireAssessmentAccess(assessor, id);

  const domain: Domain = ASSESSED_DOMAINS.includes(domainParam as never)
    ? (domainParam as Domain)
    : "PLANNING";

  const criteria = await prisma.criterion.findMany({
    where: { active: true, domain: { in: [...ASSESSED_DOMAINS] } },
    include: {
      subCriteria: { orderBy: { position: "asc" } },
      // Scoped to this assessor *and* this assessment. Both halves matter:
      // without the assessor filter an assessor would see what the others put
      // down, and three independent judgements is the whole point — one visible
      // score anchors the next two. Without the assessment filter the criterion
      // pulls back this assessor's scores for every club they have ever scored,
      // so opening an unscored club pre-fills it with a different club's
      // evidence and stars.
      scores: {
        where: { assessorId: assessor.id, assessmentId: id },
        include: { evidence: { select: { subCriterionId: true } } },
      },
    },
    orderBy: [{ domain: "asc" }, { position: "asc" }],
  });

  const staffCount = await prisma.staffMember.count({ where: { assessmentId: id } });
  const scoredTotal = criteria.filter((c) => c.scores.length > 0).length;
  const editable = assessorCanScore(assessment.status);
  const myAssignment = assessment.assessors.find((a) => a.assessorId === assessor.id);

  const forDomain = criteria.filter((c) => c.domain === domain);

  const cards: CriterionCardData[] = forDomain.map((c) => {
    const score = c.scores[0];
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      description: c.description,
      weight: c.weight,
      oneStarAt: c.oneStarAt,
      twoStarAt: c.twoStarAt,
      threeStarAt: c.threeStarAt,
      subCriteria: c.subCriteria.map((s) => ({ id: s.id, text: s.text })),
      savedStars: score ? score.stars : null,
      metIds: score ? score.evidence.map((e) => e.subCriterionId) : [],
      comment: score?.comment ?? "",
    };
  });

  const domainProgress = ASSESSED_DOMAINS.map((d) => {
    const inDomain = criteria.filter((c) => c.domain === d);
    return {
      domain: d,
      scored: inDomain.filter((c) => c.scores.length > 0).length,
      total: inDomain.length,
    };
  });

  return (
    <>
      <PageHeader
        title={assessment.club.name}
        subtitle={
          <>
            {[assessment.club.zone, assessment.club.tier].filter(Boolean).join(" · ")} —{" "}
            {assessment.cycle.name}
          </>
        }
        breadcrumb={{ href: "/cda/assess", label: "My clubs" }}
        action={
          <Link href={`/cda/assess/${id}/club-data`} className="btn-secondary btn-sm">
            Club&apos;s submitted evidence
          </Link>
        }
      />

      {!editable && (
        <div className="mb-6 card card-pad">
          <p className="text-sm text-ink-700">
            {myAssignment?.submittedAt
              ? "You've submitted your scoring for this club. It's shown here read-only."
              : "This assessment has moved into review by the Club Development Unit and is no longer open for scoring."}
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Your progress"
          value={`${scoredTotal}/${criteria.length}`}
          tone={scoredTotal === criteria.length ? "good" : "warn"}
          hint="Criteria scored"
        />
        <StatTile
          label="Staff on register"
          value={staffCount}
          hint="Declared by the club"
        />
        <StatTile
          label="Assessors on this club"
          value={assessment.assessors.length}
          hint="Scoring independently"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <nav className="mb-4 flex flex-wrap gap-2" aria-label="Domains">
            {domainProgress.map((d) => (
              <Link
                key={d.domain}
                href={`/cda/assess/${id}?domain=${d.domain}`}
                aria-current={d.domain === domain ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  d.domain === domain
                    ? "bg-maroon-600 text-white"
                    : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                }`}
              >
                {DOMAIN_LABELS[d.domain]}
                <span className={d.domain === domain ? "ml-2 text-white/75" : "ml-2 text-ink-400"}>
                  {d.scored}/{d.total}
                </span>
              </Link>
            ))}
          </nav>

          <p className="mb-4 text-sm text-ink-600">{DOMAIN_BLURBS[domain]}</p>

          <div className="space-y-4">
            {cards.map((criterion) => (
              <CriterionCard
                key={criterion.id}
                assessmentId={id}
                criterion={criterion}
                editable={editable}
              />
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <SubmitScoring
            assessmentId={id}
            scored={scoredTotal}
            total={criteria.length}
            submittedAt={myAssignment?.submittedAt ?? null}
            editable={editable}
          />

          <div className="card card-pad">
            <h2 className="mb-3 font-semibold text-ink-900">Progress by domain</h2>
            <div className="space-y-3">
              {domainProgress.map((d) => (
                <div key={d.domain}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink-700">{DOMAIN_LABELS[d.domain]}</span>
                    <span className="text-ink-500">
                      {d.scored}/{d.total}
                    </span>
                  </div>
                  <ProgressBar
                    value={(d.scored / d.total) * 100}
                    tone={d.scored === d.total ? "good" : "warn"}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="border-b border-ink-200 px-5 py-3 font-semibold text-ink-900">
              This domain
            </h2>
            <div className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
              {cards.map((c) => (
                <a
                  key={c.id}
                  href={`#${c.code}`}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-ink-50"
                >
                  <span className="min-w-0 truncate text-ink-700">
                    <span className="text-ink-400">{c.code}</span> {c.title}
                  </span>
                  {c.savedStars === null ? (
                    <Badge tone="muted">—</Badge>
                  ) : (
                    <Stars value={c.savedStars} size="sm" />
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
