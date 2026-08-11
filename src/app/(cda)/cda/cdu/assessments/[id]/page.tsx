import Link from "next/link";
import { ShieldBadge } from "@/components/cda/shield";
import { DomainBreakdown } from "@/components/cda/summary";
import { Badge, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { requireCdu } from "@/lib/cda/access";
import { loadAssessment } from "@/lib/cda/assessment";
import { MAX_STAFF_POINTS, SHIELD_LABELS, STAFF_ROLE_SPECS } from "@/lib/cda/rubric";
import { pct } from "@/lib/cda/scoring";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";
import { AreaNotes, type AreaRow } from "./area-notes";
import { AssessorPanel } from "./assessor-panel";
import { LockPanel } from "./lock-panel";
import { VerifyForm, type VerifyItem } from "./verify-form";

export const metadata = { title: "Assessment" };

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCdu();
  const { id } = await params;

  const overview = await loadAssessment(id);
  const { assessment, technical, rating, agreements, frozen } = overview;

  const areaRows: AreaRow[] = overview.areas.map((a) => ({
    domain: a.domain,
    area: a.area,
    earned: a.earned,
    available: a.available,
    percent: a.percent,
    total: a.total,
    scored: a.scored,
    note: overview.areaNotes.get(`${a.domain}|${a.area ?? ""}`) ?? "",
  }));

  const [pools, poolDetail] = await Promise.all([
    prisma.pool.findMany({
      where: { cycleId: assessment.cycleId },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
    assessment.poolId
      ? prisma.pool.findUnique({
          where: { id: assessment.poolId },
          include: {
            _count: { select: { assessments: true } },
            assignments: { select: { criterionId: true, submittedAt: true } },
          },
        })
      : null,
  ]);

  // "Allocated" counts line items with at least one assessor; "submitted" only
  // those where every allocated slot is in, since one outstanding slot means the
  // item isn't finished.
  const poolSummary = poolDetail
    ? {
        id: poolDetail.id,
        name: poolDetail.name,
        clubs: poolDetail._count.assessments,
        assigned: new Set(poolDetail.assignments.map((a) => a.criterionId)).size,
        submitted: [...new Set(poolDetail.assignments.map((a) => a.criterionId))].filter((cid) =>
          poolDetail.assignments.filter((a) => a.criterionId === cid).every((a) => a.submittedAt),
        ).length,
        criteriaTotal: agreements.length,
      }
    : null;

  const checks: VerifyItem[] = assessment.nonNegotiables.map((n) => ({
    id: n.id,
    code: n.nonNegotiable.code,
    title: n.nonNegotiable.title,
    description: n.nonNegotiable.description,
    evidenceHint: n.nonNegotiable.evidenceHint,
    kind: n.nonNegotiable.kind,
    format: n.nonNegotiable.format,
    shieldGuidance: n.nonNegotiable.shieldGuidance,
    shieldMet: n.shieldMet,
    clubDeclared: n.clubDeclared,
    clubNote: n.clubNote,
    verdict: n.verdict,
    adminNote: n.adminNote ?? "",
    evidence: [],
  }));

  const evidence = await prisma.upload.findMany({
    where: { nonNegotiableResultId: { in: checks.map((c) => c.id) } },
    select: { id: true, filename: true, nonNegotiableResultId: true },
  });
  for (const e of evidence) {
    checks.find((c) => c.id === e.nonNegotiableResultId)?.evidence.push({
      id: e.id,
      filename: e.filename,
    });
  }

  const majorSplits = agreements.filter((a) => a.level === "MAJOR").length;
  const pendingChecks = checks.filter((c) => c.verdict === "PENDING").length;
  const locked = assessment.lockedAt !== null;

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
        breadcrumb={{ href: "/cda/cdu", label: "Cycle" }}
        action={
          <Link href={`/cda/cdu/assessments/${id}/reconcile`} className="btn-primary btn-sm">
            Reconcile scores
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile
          label={frozen ? "Final score" : "Provisional score"}
          value={pct(rating.percent, 1)}
          tone={frozen ? "good" : "muted"}
          hint={frozen ? "Frozen at lock" : "Median of assessors"}
        />
        <StatTile
          label="Shield"
          value={<ShieldBadge shield={rating.shield} />}
          hint={
            !rating.eligibility.eligible
              ? `${rating.eligibility.failed.length} failed, ${rating.eligibility.pending.length} pending`
              : rating.cappedDown
                ? // The score alone would have earned more. Saying so here stops
                  // the CDU chasing a scoring error that isn't there.
                  `Scored ${SHIELD_LABELS[rating.provisionalShield]}, capped by ${rating.eligibility.cappedBy
                    .map((c) => c.code)
                    .join(", ")}`
                : undefined
          }
        />
        <StatTile
          label="Resolved"
          value={`${agreements.length - overview.unresolved.length}/${agreements.length}`}
          tone={overview.unresolved.length === 0 ? "good" : "warn"}
        />
        <StatTile
          label="Major splits"
          value={majorSplits}
          tone={majorSplits > 0 ? "warn" : "good"}
          hint="Assessors 2+ stars apart"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <DomainBreakdown rating={rating} provisional={!frozen} />

          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-title">By macro-area</h2>
              <p className="text-xs text-ink-500">
                The structure the club&apos;s report is built around.
              </p>
            </div>
            <AreaNotes
              assessmentId={id}
              areas={areaRows}
              editable={assessment.publishedAt === null}
            />
          </section>

          <section>
            <h2 className="section-title mb-3">Technical Qualifications breakdown</h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left">
                    <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">Role</th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Declared
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Counted
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Points
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                      Weight
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {technical.roles.map((r) => (
                    <tr key={r.role} className={r.declared === 0 ? "bg-maroon-50/40" : undefined}>
                      <td className="px-4 py-2">
                        <span className="font-medium text-ink-900">{r.label}</span>
                        {r.declared === 0 && (
                          <span className="ml-2">
                            <Badge tone="bad">Unfilled</Badge>
                          </span>
                        )}
                        {r.scores.some((s) => s.discounted) && (
                          <span className="ml-2">
                            <Badge tone="warn">Off-stream licence</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-700">{r.declared}</td>
                      <td className="px-3 py-2 tabular-nums text-ink-500">
                        {Math.min(r.declared, r.counted)} of {r.counted}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <ProgressBar value={r.ratio * 100} />
                          </div>
                          <span className="text-xs tabular-nums text-ink-600">
                            {r.earned}/{r.available}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink-500">×{r.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Each counted slot is worth up to {MAX_STAFF_POINTS} points — qualification (10),
              experience (3) and employment type (2). An unfilled role scores zero across its whole
              weight.
            </p>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-title">Non-Negotiables</h2>
              <p className="text-xs text-ink-500">
                {checks.filter((c) => c.verdict === "PASS").length} passed ·{" "}
                {checks.filter((c) => c.verdict === "FAIL").length} failed · {pendingChecks} pending
              </p>
            </div>
            <div className="card divide-y divide-ink-200">
              {checks.map((item) => (
                <VerifyForm key={item.id} item={item} locked={locked} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <LockPanel
            assessmentId={id}
            status={assessment.status}
            lockedAt={assessment.lockedAt}
            publishedAt={assessment.publishedAt}
            unresolved={overview.unresolved.length}
            pendingChecks={pendingChecks}
            summary={assessment.summary ?? ""}
            licenceCompliant={assessment.licenceCompliant}
            belowBronze={rating.provisionalShield === "NONE"}
          />

          <AssessorPanel
            assessmentId={id}
            pool={poolSummary}
            pools={pools}
            assessors={overview.assessors}
            locked={locked}
          />

          <div className="card card-pad">
            <h2 className="mb-2 font-semibold text-ink-900">Club submission</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Staff declared</dt>
                <dd className="tabular-nums text-ink-800">{assessment.staff.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Without a Blue Card</dt>
                <dd className="tabular-nums text-ink-800">
                  {assessment.staff.filter((s) => !s.blueCard).length}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Female technical staff</dt>
                <dd className="tabular-nums text-ink-800">
                  {assessment.staff.filter((s) => s.gender === "FEMALE").length}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Unfilled roles</dt>
                <dd className="tabular-nums text-ink-800">{technical.unfilledRoles.length}</dd>
              </div>
            </dl>
            {technical.unfilledRoles.length > 0 && (
              <p className="mt-2 text-xs text-ink-500">
                {technical.unfilledRoles.map((r) => STAFF_ROLE_SPECS[r.role].label).join(", ")}
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
