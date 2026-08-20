import Link from "next/link";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { ambassadorClubIds, assessorCanScore, requireAssessor } from "@/lib/cda/access";
import { tierScope } from "@/lib/cda/assessment";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My progress" };

/**
 * An assessor's own progress, cut by club rather than by line item.
 *
 * "My line items" answers "how far through D6 am I", which is the unit the work
 * is allocated in. It cannot answer "am I finished with Lions FC", because that
 * spans every item the assessor holds — and that is the question asked at the
 * end of a cycle, when a club is waiting on the last score before it can be
 * reconciled. So this is the same work counted the other way round.
 *
 * Everything is this assessor's own. There is a Club Development Unit version
 * of this page covering every assessor and every club; it lives under /cda/cdu
 * and is not reachable from here.
 */
export default async function AssessorProgressPage() {
  const assessor = await requireAssessor();

  const assignments = await prisma.criterionAssignment.findMany({
    where: { assessorId: assessor.id },
    include: {
      criterion: { select: { id: true, code: true, title: true } },
      pool: { select: { id: true, name: true, cycle: { select: { name: true } } } },
    },
    orderBy: [{ criterion: { position: "asc" } }],
  });

  if (assignments.length === 0) {
    return (
      <>
        <PageHeader title="My progress" />
        <EmptyState
          title="Nothing allocated to you yet"
          description="The Club Development Unit allocates each line item to an assessor for a whole pool of clubs. Your progress will appear here once you hold some."
        />
      </>
    );
  }

  const poolIds = [...new Set(assignments.map((a) => a.poolId))];
  const criterionIds = [...new Set(assignments.map((a) => a.criterionId))];

  const [assessments, myScores, portfolio] = await Promise.all([
    prisma.clubAssessment.findMany({
      where: { poolId: { in: poolIds } },
      select: {
        id: true,
        clubId: true,
        poolId: true,
        tierId: true,
        status: true,
        club: { select: { name: true, zone: true } },
      },
      orderBy: { club: { name: "asc" } },
    }),
    prisma.assessorScore.findMany({
      where: { assessorId: assessor.id, criterionId: { in: criterionIds } },
      select: { assessmentId: true, criterionId: true },
    }),
    ambassadorClubIds(assessor.id),
  ]);

  const applies = await tierScope(assessments, criterionIds);
  const done = new Set(myScores.map((s) => `${s.assessmentId}:${s.criterionId}`));

  // One row per club, counting only the line items this assessor holds in that
  // club's pool and that the club's tier is actually assessed on.
  const rows = assessments.map((a) => {
    const mine = assignments.filter(
      (x) => x.poolId === a.poolId && applies(x.criterionId, a.id),
    );
    const scored = mine.filter((x) => done.has(`${a.id}:${x.criterionId}`)).length;
    return {
      id: a.id,
      name: a.club.name,
      zone: a.club.zone,
      pool: a.poolId,
      poolName: assignments.find((x) => x.poolId === a.poolId)?.pool.name ?? "—",
      items: mine.length,
      scored,
      open: assessorCanScore(a.status),
      status: a.status,
      isMine: portfolio.has(a.clubId),
    };
  }).filter((r) => r.items > 0);

  // Counted over every club this assessor holds an applicable item on, not only
  // the ones still open to editing. Excluding the closed ones seems tidier and
  // is badly wrong: once the Unit moves a cycle into reconciliation nothing is
  // open, so the totals would collapse to 0/0 on a season that is in fact fully
  // scored, while the table below plainly showed 6/8. Whether a club can still
  // be edited is a separate fact, and it is reported separately.
  const totalDue = rows.reduce((n, r) => n + r.items, 0);
  const totalDone = rows.reduce((n, r) => n + r.scored, 0);
  const finished = rows.filter((r) => r.items > 0 && r.scored === r.items).length;
  const submitted = assignments.filter((a) => a.submittedAt).length;
  const closed = rows.filter((r) => !r.open).length;

  const cycleName = assignments[0].pool.cycle.name;

  const stillOpen = rows.length - closed;
  const openNote =
    (stillOpen === 0
      ? "None of your clubs is open for scoring right now."
      : `${stillOpen} of your ${rows.length} clubs ${stillOpen === 1 ? "is" : "are"} open for scoring right now.`) +
    " The rest either haven't submitted their evidence yet, or the Unit has moved them into" +
    " reconciliation. Scores already given still stand, and are counted above.";

  return (
    <>
      <PageHeader
        title="My progress"
        subtitle={`Your own scoring across ${cycleName}, counted by club rather than by line item.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Scores recorded"
          value={`${totalDone}/${totalDue}`}
          tone={totalDue > 0 && totalDone === totalDue ? "good" : "warn"}
          hint="Across every club you score"
        />
        <StatTile
          label="Clubs finished"
          value={`${finished}/${rows.length}`}
          tone={rows.length > 0 && finished === rows.length ? "good" : "warn"}
          hint="Every line item of yours scored"
        />
        <StatTile
          label="Line items submitted"
          value={`${submitted}/${assignments.length}`}
          tone={submitted === assignments.length ? "good" : "muted"}
          hint="Handed to the Unit"
        />
        <StatTile
          label="Clubs I look after"
          value={portfolio.size}
          tone={portfolio.size > 0 ? "good" : "muted"}
          hint="My CDA portfolio"
        />
      </div>

      {closed > 0 && (
        <p className="mb-6 rounded-lg bg-status-orange-bg px-4 py-3 text-sm text-status-orange-fg">
          {/* Built as one string rather than interleaved with JSX: a text line
              that begins after an expression loses the newline between them, so
              splitting a sentence across lines silently runs words together. */}
          {openNote}
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-3 font-semibold text-ink-900">My line items</h2>
        <div className="card divide-y divide-ink-200">
          {assignments.map((a) => {
            // Every club in this item's pool that its tier covers — open to
            // editing or not, for the same reason the totals above count them.
            const on = rows.filter(
              (r) => r.pool === a.poolId && applies(a.criterionId, r.id),
            );
            const applicable = on.length;
            const scored = on.filter((r) => done.has(`${r.id}:${a.criterionId}`)).length;
            return (
              <Link
                key={a.id}
                href={`/cda/assess/${a.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold tracking-wide text-ink-400">
                      {a.criterion.code}
                    </span>
                    <span className="font-medium text-ink-900">{a.criterion.title}</span>
                    {a.submittedAt ? (
                      <Badge tone="good">Submitted</Badge>
                    ) : scored === applicable && applicable > 0 ? (
                      <Badge tone="info">Ready to submit</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Pool {a.pool.name}
                    {a.submittedAt && ` · submitted ${formatDate(a.submittedAt)}`}
                  </p>
                </div>
                <div className="w-40">
                  <div className="mb-1 flex justify-between text-xs text-ink-500">
                    <span>
                      {scored} / {applicable}
                    </span>
                    <span>{applicable ? Math.round((scored / applicable) * 100) : 0}%</span>
                  </div>
                  <ProgressBar
                    value={applicable ? (scored / applicable) * 100 : 0}
                    tone={applicable > 0 && scored === applicable ? "good" : "warn"}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-ink-900">By club</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left">
                <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">Club</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">Pool</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                  My line items
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                  Mine to support
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50">
                  <td className="px-4 py-2">
                    <span className="font-medium text-ink-900">{r.name}</span>
                    {r.zone && <span className="ml-2 text-xs text-ink-400">{r.zone}</span>}
                    {!r.open && (
                      <span className="ml-2">
                        <Badge tone="muted">{r.status.toLowerCase().replace(/_/g, " ")}</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-600">Pool {r.poolName}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <ProgressBar
                          value={r.items ? (r.scored / r.items) * 100 : 0}
                          tone={r.scored === r.items ? "good" : r.open ? "warn" : "muted"}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-ink-500">
                        {r.scored}/{r.items}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.isMine ? (
                      <Link
                        href={`/cda/assess/club/${r.id}`}
                        className="text-xs font-medium text-maroon-700 hover:text-maroon-800"
                      >
                        Their evidence →
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
