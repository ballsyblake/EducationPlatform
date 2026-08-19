import Link from "next/link";
import { ShieldBadge } from "@/components/cda/shield";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { requireCdu } from "@/lib/cda/access";
import { activeCycle, tierScope } from "@/lib/cda/assessment";
import { ASSESSED_DOMAINS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";

export const metadata = { title: "Progress" };

/**
 * Where a cycle actually stands, in one page.
 *
 * The Cycle board answers "how is each club doing"; this answers the questions
 * that cut across clubs and are otherwise spread over five screens: is every
 * line item allocated, is every allocation reachable, who is behind, and what
 * is stopping the whole thing from finishing.
 *
 * Everything is counted against what each club is actually assessed on — its
 * tier — and every allocation against the clubs its assessor is CDA for, so a
 * number here can be reached rather than being an ideal nobody can hit.
 */
export default async function ProgressPage() {
  await requireCdu();
  const cycle = await activeCycle();

  if (!cycle) {
    return (
      <>
        <PageHeader title="Progress" />
        <EmptyState title="No cycle open" description="Open a cycle to see where it stands." />
      </>
    );
  }

  const [assessments, criteria, assignments, scoreRows, nnRows, portfolios] = await Promise.all([
    prisma.clubAssessment.findMany({
      where: { cycleId: cycle.id },
      include: {
        club: { select: { id: true, name: true, zone: true } },
        pool: { select: { id: true, name: true } },
        _count: { select: { finalScores: true, staff: true } },
      },
      orderBy: [{ club: { name: "asc" } }],
    }),
    prisma.criterion.findMany({
      where: { active: true, domain: { in: [...ASSESSED_DOMAINS] } },
      select: { id: true, code: true, domain: true },
      orderBy: [{ position: "asc" }],
    }),
    prisma.criterionAssignment.findMany({
      where: { pool: { cycleId: cycle.id } },
      include: {
        assessor: { select: { id: true, name: true, email: true, active: true } },
        criterion: { select: { id: true, code: true } },
      },
    }),
    // One grouped query rather than one per assessor — a dozen assessors across
    // fifty-four items would otherwise be hundreds of round trips.
    prisma.assessorScore.groupBy({
      by: ["assessorId", "criterionId"],
      where: { assessment: { cycleId: cycle.id } },
      _count: { _all: true },
    }),
    prisma.nonNegotiableResult.groupBy({
      by: ["verdict"],
      where: { assessment: { cycleId: cycle.id } },
      _count: { _all: true },
    }),
    prisma.clubAmbassador.findMany({
      where: { club: { assessments: { some: { cycleId: cycle.id } } } },
      select: { userId: true, clubId: true },
    }),
  ]);

  const applies = await tierScope(assessments, criteria.map((c) => c.id));
  const scored = new Map(scoreRows.map((s) => [`${s.assessorId}:${s.criterionId}`, s._count._all]));

  const looksAfter = new Map<string, Set<string>>();
  for (const p of portfolios) {
    const set = looksAfter.get(p.userId) ?? new Set<string>();
    set.add(p.clubId);
    looksAfter.set(p.userId, set);
  }
  const clubsWithCda = new Set(portfolios.map((p) => p.clubId));

  /* ------------------------------ per club -------------------------------- */

  const clubRows = assessments.map((a) => {
    const items = criteria.filter((c) => applies(c.id, a.id)).length;
    return {
      id: a.id,
      name: a.club.name,
      pool: a.pool?.name ?? null,
      status: a.status,
      items,
      resolved: Math.min(a._count.finalScores, items),
      locked: a.lockedAt !== null,
      shield: a.finalShield,
      eligible: a.eligible,
      hasCda: clubsWithCda.has(a.club.id),
      staff: a._count.staff,
    };
  });

  const inPool = clubRows.filter((c) => c.pool);
  const totalItems = inPool.reduce((n, c) => n + c.items, 0);
  const totalResolved = inPool.reduce((n, c) => n + c.resolved, 0);

  /* ------------------------------ per pool -------------------------------- */

  const poolNames = [...new Set(assessments.map((a) => a.pool?.name).filter(Boolean))].sort();
  const pools = poolNames.map((name) => {
    const mine = assessments.filter((a) => a.pool?.name === name);
    const held = assignments.filter((x) => mine.some((m) => m.poolId === x.poolId));
    const covered = new Set(held.map((h) => h.criterionId));
    // Applicable here means "at least one club in this pool is scored on it",
    // so a pool of Tier 2 clubs isn't marked short of the 36 items they are
    // never assessed on.
    const applicable = criteria.filter((c) => mine.some((m) => applies(c.id, m.id)));
    const submitted = applicable.filter((c) => {
      const on = held.filter((h) => h.criterionId === c.id);
      return on.length > 0 && on.every((h) => h.submittedAt);
    });
    const rows = mine.map((m) => criteria.filter((c) => applies(c.id, m.id)).length);
    return {
      name: name as string,
      clubs: mine.length,
      applicable: applicable.length,
      allocated: applicable.filter((c) => covered.has(c.id)).length,
      submitted: submitted.length,
      resolved: mine.reduce((n, m) => n + Math.min(m._count.finalScores, 0 + (rows[mine.indexOf(m)] ?? 0)), 0),
      items: rows.reduce((n, x) => n + x, 0),
    };
  });

  /* ---------------------------- per assessor ------------------------------ */

  const assessorIds = [...new Set(assignments.map((a) => a.assessorId))];
  const assessors = assessorIds
    .map((id) => {
      const held = assignments.filter((a) => a.assessorId === id);
      const who = held[0].assessor;
      const mine = looksAfter.get(id) ?? new Set<string>();

      let due = 0;
      let done = 0;
      for (const h of held) {
        const reachable = assessments.filter(
          (a) => a.poolId === h.poolId && mine.has(a.club.id) && applies(h.criterionId, a.id),
        ).length;
        due += reachable;
        done += Math.min(scored.get(`${id}:${h.criterionId}`) ?? 0, reachable);
      }

      return {
        id,
        name: displayName(who),
        active: who.active,
        items: held.length,
        submitted: held.filter((h) => h.submittedAt).length,
        clubs: mine.size,
        due,
        done,
      };
    })
    .sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));

  /* ------------------------------ blockers -------------------------------- */

  const noPool = clubRows.filter((c) => !c.pool);
  const noCda = clubRows.filter((c) => c.pool && !c.hasCda);
  const unallocated = pools.reduce((n, p) => n + (p.applicable - p.allocated), 0);
  const unreachable = assignments.filter((h) => {
    const mine = looksAfter.get(h.assessorId) ?? new Set<string>();
    const reachable = assessments.filter(
      (a) => a.poolId === h.poolId && mine.has(a.club.id) && applies(h.criterionId, a.id),
    ).length;
    return reachable === 0;
  }).length;

  // The number that actually decides whether a season can finish: for every
  // club and every line item it is assessed on, is there anybody who both holds
  // that item in its pool and looks after that club?
  //
  // It is its own measure because the two halves each look fine alone. Every
  // line item can be allocated and every club can have a CDA while most pairs
  // still have nobody: a line item allocated to two assessors covers only the
  // clubs those two are ambassadors for, and a pool of twelve clubs spread over
  // six CDAs leaves the other four uncovered on that item.
  let pairs = 0;
  let coveredPairs = 0;
  for (const a of assessments) {
    if (!a.poolId) continue;
    for (const c of criteria) {
      if (!applies(c.id, a.id)) continue;
      pairs += 1;
      const holders = assignments.filter((x) => x.poolId === a.poolId && x.criterionId === c.id);
      if (holders.some((x) => looksAfter.get(x.assessorId)?.has(a.club.id))) coveredPairs += 1;
    }
  }
  const uncovered = pairs - coveredPairs;

  const nn = Object.fromEntries(nnRows.map((r) => [r.verdict, r._count._all]));
  const pendingNn = nn.PENDING ?? 0;

  const readyToLock = clubRows.filter((c) => !c.locked && c.items > 0 && c.resolved === c.items);

  const blockers = [
    noPool.length && {
      tone: "bad" as const,
      what: `${noPool.length} club${noPool.length === 1 ? "" : "s"} not in a pool`,
      why: "No assessor can reach them at all.",
      href: "/cda/cdu",
    },
    noCda.length && {
      tone: "bad" as const,
      what: `${noCda.length} club${noCda.length === 1 ? "" : "s"} with no CDA`,
      why: "An assessor reaches a club only if they look after it.",
      href: "/cda/cdu/clubs",
    },
    unallocated && {
      tone: "warn" as const,
      what: `${unallocated} line item${unallocated === 1 ? "" : "s"} unallocated`,
      why: "Nobody is scoring them.",
      href: "/cda/cdu",
    },
    uncovered && {
      tone: "bad" as const,
      what: `${uncovered} of ${pairs} scores have nobody to give them`,
      why:
        "For these club and line-item pairs, no assessor both holds the item in that pool and looks after that club.",
      href: "/cda/cdu",
    },
    unreachable && {
      tone: "warn" as const,
      what: `${unreachable} allocation${unreachable === 1 ? "" : "s"} reach no clubs`,
      why: "The assessor holds the item but is CDA for none of the clubs it covers.",
      href: "/cda/cdu",
    },
    pendingNn && {
      tone: "warn" as const,
      what: `${pendingNn} Non-Negotiable${pendingNn === 1 ? "" : "s"} unverified`,
      why: "A pending check blocks the shield as surely as a failed one.",
      href: "/cda/cdu",
    },
    readyToLock.length && {
      tone: "good" as const,
      what: `${readyToLock.length} club${readyToLock.length === 1 ? "" : "s"} fully reconciled`,
      why: "Every line item settled — ready to lock when you are.",
      href: "/cda/cdu",
    },
  ].filter(Boolean) as { tone: "bad" | "warn" | "good"; what: string; why: string; href: string }[];

  const byStatus = clubRows.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Progress"
        subtitle={`Where ${cycle.name} stands — across every club, pool and assessor.`}
        breadcrumb={{ href: "/cda/cdu", label: "Cycle" }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Clubs in a pool" value={`${inPool.length}/${clubRows.length}`} hint="Assessable" />
        <StatTile
          label="Line items settled"
          value={`${totalResolved}/${totalItems}`}
          tone={totalItems > 0 && totalResolved === totalItems ? "good" : "warn"}
          hint="Reconciled across all clubs"
        />
        <StatTile
          label="Scores reachable"
          value={pairs ? `${Math.round((coveredPairs / pairs) * 100)}%` : "—"}
          tone={pairs === 0 ? "muted" : coveredPairs === pairs ? "good" : "warn"}
          hint="Somebody holds the item and looks after the club"
        />
        <StatTile
          label="Locked"
          value={clubRows.filter((c) => c.locked).length}
          tone={clubRows.some((c) => c.locked) ? "good" : "muted"}
          hint="Results frozen"
        />
      </div>

      {blockers.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-semibold text-ink-900">What needs attention</h2>
          <div className="card divide-y divide-ink-200">
            {blockers.map((b) => (
              <Link key={b.what} href={b.href} className="flex flex-wrap items-baseline gap-x-3 px-5 py-3 hover:bg-ink-50">
                <Badge tone={b.tone}>{b.what}</Badge>
                <span className="text-sm text-ink-600">{b.why}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold text-ink-900">Pools</h2>
          {pools.length === 0 ? (
            <EmptyState title="No pools" description="Create one on the Cycle page." />
          ) : (
            <div className="card divide-y divide-ink-200">
              {pools.map((p) => (
                <div key={p.name} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href="/cda/cdu" className="font-medium text-ink-900 hover:text-maroon-700">
                      Pool {p.name}
                    </Link>
                    <span className="text-xs text-ink-500">
                      {p.clubs} club{p.clubs === 1 ? "" : "s"} · {p.applicable} line items
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div>
                      <dt className="text-ink-500">Allocated</dt>
                      <dd className="mt-1 flex items-center gap-2">
                        <div className="w-24">
                          <ProgressBar
                            value={p.applicable ? (p.allocated / p.applicable) * 100 : 0}
                            tone={p.allocated === p.applicable ? "good" : "warn"}
                          />
                        </div>
                        <span className="tabular-nums text-ink-700">
                          {p.allocated}/{p.applicable}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Submitted by assessors</dt>
                      <dd className="mt-1 flex items-center gap-2">
                        <div className="w-24">
                          <ProgressBar
                            value={p.applicable ? (p.submitted / p.applicable) * 100 : 0}
                            tone={p.submitted === p.applicable ? "good" : "warn"}
                          />
                        </div>
                        <span className="tabular-nums text-ink-700">
                          {p.submitted}/{p.applicable}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-ink-900">Assessors</h2>
          {assessors.length === 0 ? (
            <EmptyState title="Nobody allocated" description="Allocate line items from a pool's page." />
          ) : (
            <div className="card divide-y divide-ink-200">
              {assessors.map((a) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-900">{a.name}</span>
                      {!a.active && <Badge tone="bad">Deactivated</Badge>}
                      {a.clubs === 0 && <Badge tone="bad">No clubs</Badge>}
                    </div>
                    <span className="text-xs text-ink-500">
                      {a.items} item{a.items === 1 ? "" : "s"} · {a.submitted} submitted ·{" "}
                      {a.clubs} club{a.clubs === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="w-32">
                      <ProgressBar
                        value={a.due ? (a.done / a.due) * 100 : 0}
                        tone={a.due > 0 && a.done === a.due ? "good" : a.due === 0 ? "muted" : "warn"}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-ink-500">
                      {a.done}/{a.due} scores
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <h2 className="font-semibold text-ink-900">Clubs</h2>
          <span className="text-xs text-ink-500">
            {Object.entries(byStatus)
              .map(([s, n]) => `${n} ${s.toLowerCase().replace(/_/g, " ")}`)
              .join(" · ")}
          </span>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left">
                <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">Club</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">Pool</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">CDA</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">Reconciled</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">Staff</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {clubRows.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50">
                  <td className="px-4 py-2">
                    <Link href={`/cda/cdu/assessments/${c.id}`} className="font-medium text-ink-900 hover:text-maroon-700">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-600">
                    {c.pool ? `Pool ${c.pool}` : <span className="text-maroon-700">None</span>}
                  </td>
                  <td className="px-3 py-2">
                    {c.hasCda ? (
                      <span className="text-xs text-ink-500">Assigned</span>
                    ) : (
                      <Badge tone="warn">None</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <ProgressBar
                          value={c.items ? (c.resolved / c.items) * 100 : 0}
                          tone={c.items > 0 && c.resolved === c.items ? "good" : "warn"}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-ink-500">
                        {c.resolved}/{c.items}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-600">{c.staff}</td>
                  <td className="px-4 py-2 text-right">
                    {c.locked ? (
                      <ShieldBadge shield={c.eligible ? (c.shield ?? "NONE") : null} size="sm" short />
                    ) : (
                      <span className="text-xs text-ink-400">Not locked</span>
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
