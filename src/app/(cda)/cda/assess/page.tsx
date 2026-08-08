import Link from "next/link";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { requireAssessor } from "@/lib/cda/access";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My clubs" };

export default async function AssessorHomePage() {
  const assessor = await requireAssessor();

  const assignments = await prisma.assessorAssignment.findMany({
    where: { assessorId: assessor.id },
    include: {
      assessment: {
        include: {
          club: true,
          cycle: true,
          _count: { select: { staff: true } },
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
  });

  const criteriaCount = await prisma.criterion.count({
    where: { active: true, domain: { in: ["PLANNING", "DELIVERY", "OUTCOMES"] } },
  });

  // One grouped query rather than one per club — an assessor with a dozen
  // assignments would otherwise pay a round trip each just to draw a progress bar.
  const scoreCounts = await prisma.assessorScore.groupBy({
    by: ["assessmentId"],
    where: { assessorId: assessor.id },
    _count: { _all: true },
  });
  const scoredByAssessment = new Map(scoreCounts.map((c) => [c.assessmentId, c._count._all]));

  if (assignments.length === 0) {
    return (
      <>
        <PageHeader title="My clubs" />
        <EmptyState
          title="No clubs assigned to you yet"
          description="The Club Development Unit assigns assessors to clubs once those clubs have submitted their data. You'll see them here."
        />
      </>
    );
  }

  const outstanding = assignments.filter((a) => !a.submittedAt).length;
  const totalScored = assignments.reduce(
    (n, a) => n + (scoredByAssessment.get(a.assessmentId) ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="My clubs"
        subtitle="Clubs assigned to you for this cycle. You only see the clubs you're assessing."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Assigned" value={assignments.length} hint="Clubs to assess" />
        <StatTile
          label="Outstanding"
          value={outstanding}
          tone={outstanding > 0 ? "warn" : "good"}
          hint={outstanding > 0 ? "Not yet submitted" : "All submitted"}
        />
        <StatTile label="Criteria scored" value={totalScored} hint="Across all your clubs" />
      </div>

      <div className="card divide-y divide-ink-200">
        {assignments.map((assignment) => {
          const { assessment } = assignment;
          const scored = scoredByAssessment.get(assessment.id) ?? 0;
          const closed = assessment.status !== "SUBMITTED" && assessment.status !== "IN_ASSESSMENT";

          return (
            <Link
              key={assignment.id}
              href={`/cda/assess/${assessment.id}`}
              className="block px-5 py-4 hover:bg-ink-50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{assessment.club.name}</p>
                    {assignment.submittedAt ? (
                      <Badge tone="good">Submitted</Badge>
                    ) : scored === 0 ? (
                      <Badge tone="muted">Not started</Badge>
                    ) : (
                      <Badge tone="warn">In progress</Badge>
                    )}
                    {closed && !assignment.submittedAt && <Badge tone="info">Closed</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {[assessment.club.zone, assessment.club.tier].filter(Boolean).join(" · ")} ·{" "}
                    {assessment.cycle.name} · {assessment._count.staff} staff on register
                    {assignment.submittedAt && ` · submitted ${formatDate(assignment.submittedAt)}`}
                  </p>
                </div>

                <div className="w-44">
                  <div className="mb-1 flex justify-between text-xs text-ink-500">
                    <span>
                      {scored} / {criteriaCount}
                    </span>
                    <span>{Math.round((scored / criteriaCount) * 100)}%</span>
                  </div>
                  <ProgressBar
                    value={(scored / criteriaCount) * 100}
                    tone={scored === criteriaCount ? "good" : "warn"}
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
