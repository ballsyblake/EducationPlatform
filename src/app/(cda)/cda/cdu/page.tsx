import Link from "next/link";
import { ShieldBadge } from "@/components/cda/shield";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { RELEASED_STATUSES, requireCdu } from "@/lib/cda/access";
import { activeCycle } from "@/lib/cda/assessment";
import { SHIELD_LABELS } from "@/lib/cda/rubric";
import { pct } from "@/lib/cda/scoring";
import { prisma } from "@/lib/db";
import { CycleSettings } from "./cycle-settings";
import { NewCycle } from "./new-cycle";
import { PoolsPanel, type PoolSummary } from "./pools-panel";
import type { Shield } from "@prisma-client";

export const metadata = { title: "Cycle" };

const STATUS_TONE = {
  NOT_STARTED: "muted",
  IN_PROGRESS: "muted",
  SUBMITTED: "info",
  IN_ASSESSMENT: "warn",
  RECONCILING: "warn",
  LOCKED: "ok",
  PUBLISHED: "info",
  IN_REVIEW: "warn",
  UNDER_APPEAL: "warn",
  CONFIRMED: "good",
} as const;

const STATUS_LABEL = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "Club entering",
  SUBMITTED: "Awaiting assessors",
  IN_ASSESSMENT: "Being assessed",
  RECONCILING: "Ready to reconcile",
  LOCKED: "Locked",
  PUBLISHED: "Preliminary",
  IN_REVIEW: "Review requested",
  UNDER_APPEAL: "Under appeal",
  CONFIRMED: "Confirmed",
} as const;

export default async function CduHomePage() {
  await requireCdu();
  const cycle = await activeCycle();

  if (!cycle) {
    return (
      <>
        <PageHeader
          title="Club Development Unit"
          subtitle="Nothing has been set up yet."
        />
        <div className="mb-6 card card-pad max-w-2xl text-sm text-ink-700">
          <p>
            The rating rubric is already loaded — Football Queensland&apos;s line items,
            Non-Negotiables, qualifications and structure standards all ship with the portal and
            are visible under <strong>Rubric</strong>. What&apos;s missing is a season to assess.
          </p>
          <p className="mt-2 text-ink-500">
            Open a cycle below, add your clubs under <strong>Clubs</strong>, create an
            administrator account for each under <strong>Assessors</strong>, then move the cycle to
            Club entry when you want clubs to start submitting.
          </p>
        </div>
        <NewCycle suggestedYear={new Date().getFullYear()} />
      </>
    );
  }

  const criteriaCount = await prisma.criterion.count({
    where: { active: true, domain: { in: ["PLANNING", "DELIVERY", "OUTCOMES"] } },
  });

  const poolRows = await prisma.pool.findMany({
    where: { cycleId: cycle.id },
    orderBy: { position: "asc" },
    include: {
      _count: { select: { assessments: true } },
      assignments: { select: { criterionId: true } },
    },
  });
  const pools: PoolSummary[] = poolRows.map((p) => ({
    id: p.id,
    name: p.name,
    clubs: p._count.assessments,
    // Line items with at least one assessor, not raw allocations: two slots on
    // one item is one item covered, and reporting it as two overstates how far
    // the pool has actually been staffed.
    items: new Set(p.assignments.map((x) => x.criterionId)).size,
  }));

  const assessments = await prisma.clubAssessment.findMany({
    where: { cycleId: cycle.id },
    include: {
      club: true,
      pool: { include: { assignments: { select: { criterionId: true, submittedAt: true } } } },
      _count: { select: { finalScores: true, staff: true } },
    },
    orderBy: { club: { name: "asc" } },
  });

  // Aggregated across the whole cycle rather than per club. Drawing this board
  // by loading each assessment in full would be a handful of queries per club,
  // which is fine for six and unusable for the couple of hundred clubs FQ
  // actually affiliates.
  const verdictCounts = await prisma.nonNegotiableResult.groupBy({
    by: ["assessmentId", "verdict"],
    where: { assessment: { cycleId: cycle.id } },
    _count: { _all: true },
  });

  const verdicts = new Map<string, { PASS: number; FAIL: number; PENDING: number }>();
  for (const row of verdictCounts) {
    const entry = verdicts.get(row.assessmentId) ?? { PASS: 0, FAIL: 0, PENDING: 0 };
    entry[row.verdict] = row._count._all;
    verdicts.set(row.assessmentId, entry);
  }

  const published = assessments.filter((a) => RELEASED_STATUSES.includes(a.status as never));
  const shieldCounts = published.reduce<Record<string, number>>((acc, a) => {
    const key = a.eligible ? (a.finalShield ?? "NONE") : "INELIGIBLE";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const needsAttention = assessments.filter((a) => a.status === "RECONCILING").length;

  return (
    <>
      <PageHeader
        title={cycle.name}
        subtitle={`${assessments.length} clubs in this cycle`}
        action={<Badge tone="info">{cycle.status.replace("_", " ").toLowerCase()}</Badge>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Clubs" value={assessments.length} />
        <StatTile
          label="Ready to reconcile"
          value={needsAttention}
          tone={needsAttention > 0 ? "warn" : "muted"}
          hint="All assessors submitted"
        />
        <StatTile label="Released" value={published.length} tone="good" />
        <StatTile
          label="Not eligible"
          value={shieldCounts.INELIGIBLE ?? 0}
          tone={(shieldCounts.INELIGIBLE ?? 0) > 0 ? "bad" : "muted"}
          hint="Failed a Non-Negotiable"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0">
          <h2 className="section-title mb-3">Clubs</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">Club</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                    Pool
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                    Reconciled
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                    Non-Neg.
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {assessments.map((a) => {
                  // Progress is a property of the pool now: a club is assessed
                  // when every line item covering its pool is in, which no single
                  // assessor is ever in a position to report.
                  const items = a.pool
                    ? [...new Set(a.pool.assignments.map((x) => x.criterionId))]
                    : [];
                  const itemsIn = items.filter((cid) =>
                    a.pool!.assignments.filter((x) => x.criterionId === cid).every((x) => x.submittedAt),
                  ).length;
                  const v = verdicts.get(a.id) ?? { PASS: 0, FAIL: 0, PENDING: 0 };
                  const frozen = a.lockedAt !== null;

                  return (
                    <tr key={a.id} className="hover:bg-ink-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/cda/cdu/assessments/${a.id}`}
                          className="font-medium text-ink-900 hover:text-maroon-700"
                        >
                          {a.club.name}
                        </Link>
                        <p className="text-xs text-ink-500">
                          {[a.club.zone, a.club.tier].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-ink-700">
                        {!a.pool ? (
                          <span className="text-maroon-700">No pool</span>
                        ) : items.length === 0 ? (
                          <span className="text-maroon-700">Nothing allocated</span>
                        ) : (
                          <span className="tabular-nums">
                            {itemsIn}/{items.length} items in
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16">
                            <ProgressBar
                              value={(a._count.finalScores / criteriaCount) * 100}
                              tone={a._count.finalScores === criteriaCount ? "good" : "warn"}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-ink-500">
                            {a._count.finalScores}/{criteriaCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {v.FAIL > 0 ? (
                          <Badge tone="bad">{v.FAIL} failed</Badge>
                        ) : v.PENDING > 0 ? (
                          <span className="text-xs text-ink-500">{v.PENDING} pending</span>
                        ) : (
                          <Badge tone="good">All met</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {frozen ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums text-ink-700">
                              {pct(a.finalPercent ?? 0, 0)}
                            </span>
                            <ShieldBadge
                              shield={a.eligible ? (a.finalShield ?? "NONE") : null}
                              size="sm"
                              short
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400">Not locked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <PoolsPanel cycleId={cycle.id} pools={pools} />

          <CycleSettings cycle={cycle} />

          {published.length > 0 && (
            <div className="card card-pad">
              {/* Not "Shields awarded" any more: the Development Committed row
                  is a badge, and the last row isn't an award at all. */}
              <h2 className="mb-3 font-semibold text-ink-900">Results released</h2>
              <ul className="space-y-2 text-sm">
                {(
                  ["GOLD", "SILVER", "BRONZE", "DEVELOPMENT_COMMITTED", "NONE"] as Shield[]
                ).map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2">
                    <ShieldBadge shield={s} size="sm" short />
                    <span className="tabular-nums text-ink-700">{shieldCounts[s] ?? 0}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-2 border-t border-ink-200 pt-2">
                  <ShieldBadge shield={null} size="sm" />
                  <span className="tabular-nums text-ink-700">{shieldCounts.INELIGIBLE ?? 0}</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-ink-500">
                {SHIELD_LABELS.GOLD} needs {cycle.goldMin}%, {SHIELD_LABELS.SILVER}{" "}
                {cycle.silverMin}%, {SHIELD_LABELS.BRONZE} {cycle.bronzeMin}%. Below that a
                licence-compliant club receives the Development Committed badge.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
