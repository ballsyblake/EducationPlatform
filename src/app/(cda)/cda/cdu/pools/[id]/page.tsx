import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { ASSESSOR_POOL_WHERE, requireCdu } from "@/lib/cda/access";
import { tierScope } from "@/lib/cda/assessment";
import { ASSESSED_DOMAINS, DOMAIN_LABELS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";
import { AllocateRow, type AllocationRow } from "./allocate-row";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Allocate a pool" };

/**
 * Where the assessing work is handed out.
 *
 * A pool is the unit: every line item in it goes to one assessor who then
 * applies it to every club in the pool. That is what makes the standard
 * consistent between clubs, and it is why allocation lives here rather than on
 * any individual club's page.
 */
export default async function PoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ domain?: string }>;
}) {
  await requireCdu();
  const { id } = await params;
  const { domain: domainParam } = await searchParams;

  const pool = await prisma.pool.findUnique({
    where: { id },
    include: {
      cycle: true,
      assessments: { include: { club: true }, orderBy: { club: { name: "asc" } } },
    },
  });
  if (!pool) notFound();

  const domain = ASSESSED_DOMAINS.includes(domainParam as never)
    ? (domainParam as Domain)
    : undefined;

  const [criteria, assignments, assessorPool, scoreCounts] = await Promise.all([
    prisma.criterion.findMany({
      where: { active: true, domain: { in: [...ASSESSED_DOMAINS] } },
      orderBy: [{ position: "asc" }, { code: "asc" }],
    }),
    prisma.criterionAssignment.findMany({
      where: { poolId: id },
      include: { assessor: true },
      orderBy: { slot: "asc" },
    }),
    prisma.user.findMany({
      where: { ...ASSESSOR_POOL_WHERE, active: true },
      include: { _count: { select: { criterionAssignments: true } } },
      orderBy: { name: "asc" },
    }),
    // One grouped query for every assessor's progress on every line item, rather
    // than a query per row — forty rows would otherwise be forty round trips.
    prisma.assessorScore.groupBy({
      by: ["assessorId", "criterionId"],
      where: { assessment: { poolId: id } },
      _count: { _all: true },
    }),
  ]);

  const scored = new Map(
    scoreCounts.map((s) => [`${s.assessorId}:${s.criterionId}`, s._count._all]),
  );

  const clubCount = pool.assessments.length;

  // Tier 2 is assessed on 18 of the same coded items, so a pool holding both
  // tiers has line items that only apply to some of its clubs. The counts below
  // are per item for that reason: "0/7" on an item only five of the clubs are
  // scored on is a target the assessor can never reach.
  const applies = await tierScope(pool.assessments, criteria.map((c) => c.id));
  const applicableClubs = (criterionId: string) =>
    pool.assessments.filter((a) => applies(criterionId, a.id)).length;

  const tiersInPool = new Set(pool.assessments.map((a) => a.tierId ?? "—"));
  const mixedTiers = tiersInPool.size > 1;

  const rows: AllocationRow[] = criteria
    .filter((c) => !domain || c.domain === domain)
    .map((c) => {
      const held = assignments.filter((a) => a.criterionId === c.id);
      return {
        criterionId: c.id,
        code: c.code,
        title: c.title,
        mode: c.mode,
        weight: c.weight,
        clubs: applicableClubs(c.id),
        poolClubs: clubCount,
        scored: held.reduce((n, h) => n + (scored.get(`${h.assessorId}:${c.id}`) ?? 0), 0),
        slots: [1, 2, 3].map((slot) => {
          const a = held.find((h) => h.slot === slot);
          return {
            slot,
            assignmentId: a?.id ?? null,
            assessorId: a?.assessorId ?? null,
            assessorName: a ? displayName(a.assessor) : null,
            submittedAt: a?.submittedAt ?? null,
            scored: a ? (scored.get(`${a.assessorId}:${c.id}`) ?? 0) : 0,
          };
        }),
      };
    });

  const allocated = criteria.filter((c) =>
    assignments.some((a) => a.criterionId === c.id),
  ).length;
  const submitted = criteria.filter((c) => {
    const held = assignments.filter((a) => a.criterionId === c.id);
    return held.length > 0 && held.every((h) => h.submittedAt);
  }).length;

  return (
    <>
      <PageHeader
        title={`Pool ${pool.name}`}
        subtitle={`${clubCount} club${clubCount === 1 ? "" : "s"} · ${pool.cycle.name}`}
        breadcrumb={{ href: "/cda/cdu/clubs", label: "Clubs" }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Clubs" value={clubCount} />
        <StatTile
          label="Line items allocated"
          value={`${allocated}/${criteria.length}`}
          tone={allocated === criteria.length ? "good" : "warn"}
        />
        <StatTile
          label="Submitted"
          value={`${submitted}/${criteria.length}`}
          tone={submitted === criteria.length ? "good" : "muted"}
        />
        <StatTile
          label="Assessors involved"
          value={new Set(assignments.map((a) => a.assessorId)).size}
        />
      </div>

      {mixedTiers && (
        <div className="mb-6 card card-pad">
          <h2 className="font-semibold text-ink-900">This pool mixes assessment tiers</h2>
          <p className="mt-1 text-sm text-ink-600">
            Tier 2 clubs are assessed on 18 of the same coded line items, not all{" "}
            {criteria.length}. Items that don&apos;t apply to a club are simply not offered to the
            assessor for it, so nothing is scored wrongly &mdash; but the rows below will show
            uneven club counts, and a line item can be finished for one tier while still open for
            the other. A pool per tier keeps the numbers straightforward.
          </p>
        </div>
      )}

      <div className="mb-6 card card-pad">
        <h2 className="mb-2 font-semibold text-ink-900">Clubs in this pool</h2>
        {clubCount === 0 ? (
          <p className="text-sm text-maroon-700">
            No clubs yet — add them from each club&apos;s assessment page.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {pool.assessments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/cda/cdu/assessments/${a.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1 text-xs text-ink-700 hover:bg-ink-50"
                >
                  {a.club.name}
                  {a.lockedAt && <Badge tone="ok">Locked</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/cda/cdu/pools/${id}`}
          aria-current={!domain ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            !domain
              ? "bg-maroon-600 text-white"
              : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
          }`}
        >
          All domains
        </Link>
        {ASSESSED_DOMAINS.map((d) => (
          <Link
            key={d}
            href={`/cda/cdu/pools/${id}?domain=${d}`}
            aria-current={domain === d ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              domain === d
                ? "bg-maroon-600 text-white"
                : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
            }`}
          >
            {DOMAIN_LABELS[d]}
          </Link>
        ))}
      </div>

      <div className="mb-4">
        <ProgressBar
          value={criteria.length ? (allocated / criteria.length) * 100 : 0}
          tone={allocated === criteria.length ? "good" : "warn"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No line items" description="Nothing matches this filter." />
      ) : (
        <div className="card divide-y divide-ink-200">
          {rows.map((row) => (
            <AllocateRow
              key={row.criterionId}
              poolId={id}
              row={row}
              assessors={assessorPool.map((a) => ({
                id: a.id,
                name: displayName(a),
                load: a._count.criterionAssignments,
              }))}
            />
          ))}
        </div>
      )}
    </>
  );
}
