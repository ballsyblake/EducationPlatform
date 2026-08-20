import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { ambassadorClubIds, requireAssessor } from "@/lib/cda/access";
import { activeCycle } from "@/lib/cda/assessment";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My clubs" };

/**
 * The clubs this Club Development Ambassador looks after.
 *
 * Their portfolio, not their scoring reach — those are deliberately different.
 * A line item is allocated across a whole pool and scored for every club in it,
 * which is what keeps one standard between them; the portfolio is the
 * year-round support relationship, and it is what decides whose submitted
 * evidence this person may open. So this page lists the clubs they visit and
 * support, which is a shorter list than the clubs they score.
 *
 * The Club Development Unit has its own clubs page covering every club, with
 * the controls to create and edit them. This one is read-only and is only ever
 * this assessor's own.
 */
export default async function MyClubsPage() {
  const assessor = await requireAssessor();
  const [ids, cycle] = await Promise.all([ambassadorClubIds(assessor.id), activeCycle()]);

  if (ids.size === 0) {
    return (
      <>
        <PageHeader title="My clubs" />
        <EmptyState
          title="No clubs assigned to you"
          description="Club Development Ambassadors are given a portfolio of clubs they support through the year. The Club Development Unit sets these — ask them if you were expecting clubs here."
        />
      </>
    );
  }

  const clubs = await prisma.club.findMany({
    where: { id: { in: [...ids] } },
    include: {
      defaultTier: { select: { name: true } },
      assessments: {
        where: cycle ? { cycleId: cycle.id } : undefined,
        select: {
          id: true,
          status: true,
          clubSubmittedAt: true,
          pool: { select: { name: true } },
          _count: { select: { staff: true } },
        },
        take: 1,
      },
      members: { select: { user: { select: { name: true, email: true, active: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const withAssessment = clubs.filter((c) => c.assessments[0]);
  const submitted = withAssessment.filter((c) => c.assessments[0].clubSubmittedAt).length;
  const noPool = withAssessment.filter((c) => !c.assessments[0].pool).length;
  const noAdmin = clubs.filter((c) => c.members.length === 0).length;

  return (
    <>
      <PageHeader
        title="My clubs"
        subtitle={
          cycle
            ? `The clubs you look after through ${cycle.name}.`
            : "The clubs you look after through the year."
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Clubs" value={clubs.length} hint="In your portfolio" />
        <StatTile
          label="Submitted their evidence"
          value={`${submitted}/${withAssessment.length}`}
          tone={withAssessment.length > 0 && submitted === withAssessment.length ? "good" : "warn"}
          hint="Ready for you to read"
        />
        <StatTile
          label="Without an administrator"
          value={noAdmin}
          tone={noAdmin > 0 ? "warn" : "good"}
          hint={noAdmin > 0 ? "Nobody can submit for them" : "All have someone"}
        />
      </div>

      {noPool > 0 && (
        <p className="mb-6 rounded-lg bg-status-orange-bg px-4 py-3 text-sm text-status-orange-fg">
          {noPool} of your clubs {noPool === 1 ? "is" : "are"} not in an assessment pool, so nobody
          is scoring {noPool === 1 ? "it" : "them"} this cycle. Worth raising with the Club
          Development Unit.
        </p>
      )}

      <div className="card divide-y divide-ink-200">
        {clubs.map((club) => {
          const a = club.assessments[0];
          return (
            <div key={club.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{club.name}</p>
                    {club.defaultTier && <Badge tone="muted">{club.defaultTier.name}</Badge>}
                    {a?.pool ? (
                      <Badge tone="info">Pool {a.pool.name}</Badge>
                    ) : (
                      <Badge tone="warn">No pool</Badge>
                    )}
                    {club.members.length === 0 && <Badge tone="warn">No administrator</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {[club.zone, club.tier].filter(Boolean).join(" · ") || "No zone recorded"}
                    {a && ` · ${a.status.toLowerCase().replace(/_/g, " ")}`}
                    {a?.clubSubmittedAt && ` · submitted ${formatDate(a.clubSubmittedAt)}`}
                    {a && ` · ${a._count.staff} staff declared`}
                  </p>

                  {club.members.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {club.members.map((m) => (
                        <li key={m.user.email} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-ink-700">{m.user.name}</span>
                          <span className="text-ink-400">{m.user.email}</span>
                          {!m.user.active && <Badge tone="bad">Deactivated</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {a && (
                  <Link href={`/cda/assess/club/${a.id}`} className="btn-secondary btn-sm shrink-0">
                    Their evidence
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
