import Link from "next/link";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { requireAssessor } from "@/lib/cda/access";
import { tierScope } from "@/lib/cda/assessment";
import { DOMAIN_LABELS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My line items" };

/**
 * An assessor's home is a list of line items, not a list of clubs.
 *
 * They hold one criterion across a whole pool, so the unit of work — and the
 * thing they need progress on — is "D6 across Pool A", not "Lions FC".
 */
export default async function AssessorHomePage() {
  const assessor = await requireAssessor();

  const assignments = await prisma.criterionAssignment.findMany({
    where: { assessorId: assessor.id },
    include: {
      criterion: true,
      pool: {
        include: {
          cycle: true,
          _count: { select: { assessments: true } },
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { criterion: { position: "asc" } }],
  });

  if (assignments.length === 0) {
    return (
      <>
        <PageHeader title="My line items" />
        <EmptyState
          title="Nothing assigned to you yet"
          description="The Club Assessment Unit allocates each line item to an assessor for a whole pool of clubs. Yours will appear here once they're allocated."
        />
      </>
    );
  }

  // One grouped query rather than one per assignment — an assessor holding a
  // dozen line items would otherwise pay a round trip each just to draw a bar.
  const counts = await prisma.assessorScore.groupBy({
    by: ["criterionId"],
    where: { assessorId: assessor.id },
    _count: { _all: true },
  });
  const scoredByCriterion = new Map(counts.map((c) => [c.criterionId, c._count._all]));

  // The denominator is every club in the pool that this item applies to — not
  // the pool's raw size. Tier 2 clubs are assessed on 18 of the same coded
  // items, so a mixed pool has clubs a given item never reaches, and counting
  // them made a bar that could never fill.
  const poolIds = [...new Set(assignments.map((a) => a.poolId))];
  const poolAssessments = await prisma.clubAssessment.findMany({
    where: { poolId: { in: poolIds } },
    select: { id: true, clubId: true, poolId: true, tierId: true },
  });

  const applies = await tierScope(poolAssessments, [
    ...new Set(assignments.map((a) => a.criterionId)),
  ]);

  const clubsFor = (poolId: string, criterionId: string) =>
    poolAssessments.filter((a) => a.poolId === poolId && applies(criterionId, a.id)).length;

  const outstanding = assignments.filter((a) => !a.submittedAt);
  const totalClubs = outstanding.reduce((n, a) => n + clubsFor(a.poolId, a.criterionId), 0);
  const totalScored = outstanding.reduce(
    (n, a) =>
      n + Math.min(scoredByCriterion.get(a.criterionId) ?? 0, clubsFor(a.poolId, a.criterionId)),
    0,
  );

  return (
    <>
      <PageHeader
        title="My line items"
        subtitle="Each line item is scored across every club in the pool, so the standard stays the same between them."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Line items" value={assignments.length} hint="Allocated to you" />
        <StatTile
          label="Outstanding"
          value={outstanding.length}
          tone={outstanding.length > 0 ? "warn" : "good"}
          hint={outstanding.length > 0 ? "Not yet submitted" : "All submitted"}
        />
        <StatTile
          label="Clubs scored"
          value={`${totalScored}/${totalClubs}`}
          hint="Across your open line items"
        />
      </div>

      <div className="card divide-y divide-ink-200">
        {assignments.map((a) => {
          const clubs = clubsFor(a.poolId, a.criterionId);
          const scored = Math.min(scoredByCriterion.get(a.criterionId) ?? 0, clubs);
          const complete = clubs > 0 && scored === clubs;

          return (
            <Link
              key={a.id}
              href={`/cda/assess/${a.id}`}
              className="block px-5 py-4 hover:bg-ink-50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold tracking-wide text-ink-400">
                      {a.criterion.code}
                    </span>
                    <p className="font-medium text-ink-900">{a.criterion.title}</p>
                    {a.submittedAt ? (
                      <Badge tone="good">Submitted</Badge>
                    ) : scored === 0 ? (
                      <Badge tone="muted">Not started</Badge>
                    ) : (
                      <Badge tone="warn">In progress</Badge>
                    )}
                    {a.slot === 3 && <Badge tone="info">Tiebreaker</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Pool {a.pool.name} · {clubs} club{clubs === 1 ? "" : "s"} ·{" "}
                    {DOMAIN_LABELS[a.criterion.domain]} ·{" "}
                    {a.criterion.mode === "OBSERVATION" ? "Observation" : "Evidence"} ·{" "}
                    {a.pool.cycle.name}
                    {a.submittedAt && ` · submitted ${formatDate(a.submittedAt)}`}
                  </p>
                </div>

                <div className="w-44">
                  <div className="mb-1 flex justify-between text-xs text-ink-500">
                    <span>
                      {scored} / {clubs}
                    </span>
                    <span>{clubs ? Math.round((scored / clubs) * 100) : 0}%</span>
                  </div>
                  <ProgressBar
                    value={clubs ? (scored / clubs) * 100 : 0}
                    tone={complete ? "good" : "warn"}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
