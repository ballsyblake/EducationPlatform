import Link from "next/link";
import { redirect } from "next/navigation";
import { Delta, RankDelta } from "@/components/cda/delta";
import { ShieldBadge } from "@/components/cda/shield";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { isCdu } from "@/lib/auth";
import { ambassadorClubIds, requireCdaUser } from "@/lib/cda/access";
import { boardCycles, loadLeaderboard, type Standing } from "@/lib/cda/leaderboard";
import { DOMAIN_LABELS, SHIELD_SHORT_LABELS } from "@/lib/cda/rubric";
import { pct } from "@/lib/cda/scoring";
import { prisma } from "@/lib/db";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Leaderboard" };

const DOMAIN_ORDER: Domain[] = ["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"];

/** Short enough for a column head; the full names are on every other screen. */
const DOMAIN_SHORT: Record<Domain, string> = {
  TECHNICAL: "Technical",
  PLANNING: "Planning",
  DELIVERY: "Delivery",
  OUTCOMES: "Outcomes",
};

const SORTS = ["rank", "movement", "technical", "planning", "delivery", "outcomes", "club"] as const;
type Sort = (typeof SORTS)[number];

/**
 * Where every club in a cycle stands, and what moved since last season.
 *
 * The rest of the portal is built one club at a time, which is right for
 * assessing and wrong for running a program: nothing there could answer "who
 * went backwards this year", "did the cohort improve or did we mark it more
 * gently", or "is Delivery weak everywhere or weak at three clubs". Those are
 * the questions this page exists for, so it leads with the comparisons rather
 * than with a list of scores.
 *
 * Two rules govern what a reader is allowed to conclude from it.
 *
 * A frozen figure and a provisional one are different kinds of fact. The first
 * is what a club was told in writing at lock; the second moves every time the
 * Unit resolves a criterion, and on a half-reconciled club it can move a long
 * way. Both appear, because a board that waits for the last lock is useless for
 * ten months of the year — but they are labelled apart, and the row says how
 * much of the club is actually settled.
 *
 * And an assessor sees only ratings they can no longer influence. The evidence
 * screens deliberately show an assessor no computed score for a club they are
 * scoring, because knowing a club sits mid-table is exactly the anchor that
 * stops line items being judged on their own evidence. That reasoning does not
 * stop at the club page, so it holds here: assessors get locked results, for
 * the clubs they already reach, and nothing in flight.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; sort?: string; zone?: string; tier?: string }>;
}) {
  const user = await requireCdaUser();
  // A club has its own rating page, and the point of that page is its own
  // result. Nobody in the program is shown a table of other clubs' scores.
  if (user.cda === "CLUB") redirect("/cda/club/rating");

  const {
    cycle: cycleParam,
    sort: sortParam,
    zone: zoneParam,
    tier: tierParam,
  } = await searchParams;
  const cycles = await boardCycles();

  if (cycles.length === 0) {
    return (
      <>
        <PageHeader title="Leaderboard" />
        <EmptyState
          title="No cycle with clubs in it"
          description="Standings appear once a cycle has clubs assessed against it."
        />
      </>
    );
  }

  const cycle = cycles.find((c) => c.id === cycleParam) ?? cycles[0];
  const sort: Sort = SORTS.includes(sortParam as Sort) ? (sortParam as Sort) : "rank";

  const board = await loadLeaderboard(cycle.id);
  const cdu = isCdu(user);

  /* ------------------------------- scoping -------------------------------- */

  let rows = board.standings;
  let unscored = board.unscored;

  if (!cdu) {
    // The same reach the assessment pages grant: a line item held anywhere in
    // the club's pool, or the club being in this person's own portfolio.
    const [held, portfolio] = await Promise.all([
      prisma.criterionAssignment.findMany({
        where: { assessorId: user.id, pool: { cycleId: cycle.id } },
        select: { poolId: true },
        distinct: ["poolId"],
      }),
      ambassadorClubIds(user.id),
    ]);
    const pools = new Set(held.map((h) => h.poolId));
    const reaches = (r: Standing) =>
      (r.poolId !== null && pools.has(r.poolId)) || portfolio.has(r.clubId);

    rows = rows.filter((r) => r.basis === "FROZEN" && reaches(r));
    unscored = [];
  }

  const zones = [...new Set(board.standings.map((r) => r.zone).filter(Boolean))].sort() as string[];
  const zone = zoneParam && zones.includes(zoneParam) ? zoneParam : null;
  if (zone) rows = rows.filter((r) => r.zone === zone);

  // Tiers are the one filter that changes what a comparison *means* rather than
  // just what it covers. A Tier 2 club is assessed on 18 of the same line items
  // against its own Technical maximum, and it is awarded a badge rather than a
  // shield — so its percentage is not the same measurement as a Tier 1 club's,
  // however alike the two numbers look side by side.
  const tiers = [...new Set(board.standings.map((r) => r.tier).filter(Boolean))].sort() as string[];
  const tier = tierParam && tiers.includes(tierParam) ? tierParam : null;
  if (tier) rows = rows.filter((r) => r.tier === tier);

  const sorted = sortRows(rows, sort);

  /* ------------------------------- insights ------------------------------- */

  const movers = rows.filter((r) => r.movement !== null);
  const risers = [...movers].sort((a, b) => b.movement!.percent - a.movement!.percent).slice(0, 3);
  const fallers = [...movers].sort((a, b) => a.movement!.percent - b.movement!.percent).slice(0, 3);

  const cohortDelta = board.priorAverage
    ? board.average.percent - board.priorAverage.percent
    : null;

  const href = (params: {
    cycle?: string;
    sort?: string;
    zone?: string | null;
    tier?: string | null;
  }) => {
    const q = new URLSearchParams();
    q.set("cycle", params.cycle ?? cycle.id);
    const s = params.sort ?? sort;
    if (s !== "rank") q.set("sort", s);
    const z = params.zone === undefined ? zone : params.zone;
    if (z) q.set("zone", z);
    const t = params.tier === undefined ? tier : params.tier;
    if (t) q.set("tier", t);
    return `/cda/leaderboard?${q.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={
          board.priorCycle
            ? `${cycle.name} — every club ranked, against ${board.priorCycle.year}.`
            : `${cycle.name} — every club ranked. No prior cycle to compare against.`
        }
        action={
          cycles.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {cycles.map((c) => (
                <Link
                  key={c.id}
                  href={href({ cycle: c.id })}
                  aria-current={c.id === cycle.id ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    c.id === cycle.id
                      ? "bg-maroon-600 text-white"
                      : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                  }`}
                >
                  {c.year}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Clubs ranked"
          value={board.standings.length}
          hint={
            board.unscored.length
              ? `${board.unscored.length} not yet scored`
              : "Every club has a score"
          }
        />
        <StatTile
          label="Cohort average"
          value={pct(board.average.percent, 1)}
          tone="muted"
          hint={
            board.priorAverage
              ? `${cohortDelta! >= 0 ? "+" : "−"}${Math.abs(cohortDelta!).toFixed(1)} on ${
                  board.priorCycle!.year
                }, same ${board.comparable} clubs`
              : "No prior cycle to compare"
          }
        />
        <StatTile
          label="Improved / declined"
          value={board.comparable ? `${board.improved} / ${board.declined}` : "—"}
          tone={board.improved >= board.declined ? "good" : "warn"}
          hint={
            board.comparable
              ? `of ${board.comparable} with a ${board.priorCycle!.year} result`
              : "Nothing comparable last cycle"
          }
        />
        <StatTile
          label="Still provisional"
          value={board.provisional}
          tone={board.provisional === 0 ? "good" : "warn"}
          hint={
            board.provisional === 0
              ? "Every rating is frozen"
              : "Median of assessors, moves as the Unit resolves"
          }
        />
      </div>

      {!cdu && (
        <div className="mb-6 card card-pad text-sm text-ink-700">
          <p>
            You are seeing locked ratings only, for the clubs you assess or look after. Clubs still
            being scored are left out on purpose — knowing where a club sits before you judge its
            evidence is the anchor the assessment screens are built to avoid.
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {tiers.length > 1 && (
            <FilterRow
              label="Tier"
              options={tiers}
              active={tier}
              hrefFor={(t) => href({ tier: t })}
              note="Tiers are scored on different line items and awarded differently — pick one to compare like with like."
            />
          )}

          {zones.length > 1 && (
            <FilterRow
              label="Zone"
              options={zones}
              active={zone}
              hrefFor={(z) => href({ zone: z })}
            />
          )}

          {sorted.length === 0 ? (
            <EmptyState
              title="Nothing to show yet"
              description={
                cdu
                  ? "No club in this cycle has a score."
                  : "None of the clubs you assess has a locked rating in this cycle yet."
              }
            />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left">
                    <Th>#</Th>
                    <Th href={href({ sort: "club" })} active={sort === "club"}>
                      Club
                    </Th>
                    <Th href={href({ sort: "rank" })} active={sort === "rank"} align="right">
                      Overall
                    </Th>
                    <Th href={href({ sort: "movement" })} active={sort === "movement"} align="right">
                      Change
                    </Th>
                    {DOMAIN_ORDER.map((d) => (
                      <Th
                        key={d}
                        href={href({ sort: d.toLowerCase() as Sort })}
                        active={sort === (d.toLowerCase() as Sort)}
                        align="right"
                        title={DOMAIN_LABELS[d]}
                      >
                        {DOMAIN_SHORT[d]}
                      </Th>
                    ))}
                    <Th align="right">Shield</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sorted.map((r) => (
                    <Row key={r.assessmentId} row={r} cdu={cdu} priorYear={board.priorCycle?.year} />
                  ))}
                </tbody>
              </table>

              <p className="border-t border-ink-200 px-5 py-2.5 text-xs text-ink-500">
                Change is percentage points against the same club&apos;s
                {board.priorCycle ? ` ${board.priorCycle.year}` : " previous"} result. A club with
                no comparable result shows a dash rather than a zero. Places are counted across the
                whole cycle, so a filtered view keeps the gaps — and a Tier 2 percentage is a
                different measurement from a Tier 1 one, not a lower or higher version of it.
              </p>
            </div>
          )}

          {unscored.length > 0 && (
            <div className="card card-pad">
              <h2 className="mb-1 font-semibold text-ink-900">Not yet scored</h2>
              <p className="mb-3 text-sm text-ink-600">
                Nothing has been scored for {unscored.length === 1 ? "this club" : "these clubs"},
                so {unscored.length === 1 ? "it is" : "they are"} left out of the ranking rather
                than placed last on nothing.
              </p>
              <ul className="flex flex-wrap gap-2">
                {unscored.map((r) => (
                  <li key={r.assessmentId}>
                    <Badge tone="muted">
                      {r.club}
                      {r.zone ? ` · ${r.zone}` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card">
            <div className="border-b border-ink-200 px-5 py-3">
              <h2 className="font-semibold text-ink-900">Where the cohort moved</h2>
              <p className="text-xs text-ink-500">
                Averages across the ranked clubs, per domain.
              </p>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-ink-100">
                {DOMAIN_ORDER.map((d) => (
                  <tr key={d}>
                    <td className="px-5 py-2.5 text-ink-700">{DOMAIN_LABELS[d]}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-900">
                      {pct(board.average.domains[d], 0)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Delta
                        value={
                          board.priorAverage
                            ? board.average.domains[d] - board.priorAverage.domains[d]
                            : null
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50">
                  <td className="px-5 py-2.5 font-semibold text-ink-900">Overall</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink-900">
                    {pct(board.average.percent, 0)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Delta value={cohortDelta} />
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="border-t border-ink-200 px-5 py-2.5 text-xs text-ink-500">
              A domain that moved everywhere is a marking or a program story, not a club one.
            </p>
          </div>

          {movers.length > 0 && (
            <div className="card">
              <div className="border-b border-ink-200 px-5 py-3">
                <h2 className="font-semibold text-ink-900">Biggest movers</h2>
                <p className="text-xs text-ink-500">
                  On {board.priorCycle?.year ?? "last cycle"}, in percentage points.
                </p>
              </div>
              <MoverList title="Up" rows={risers} keep={(m) => m > 0} />
              <MoverList title="Down" rows={fallers} keep={(m) => m < 0} />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function FilterRow({
  label,
  options,
  active,
  hrefFor,
  note,
}: {
  label: string;
  options: string[];
  active: string | null;
  hrefFor: (value: string | null) => string;
  note?: string;
}) {
  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      on ? "bg-ink-800 text-white" : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</span>
        <Link href={hrefFor(null)} className={chip(!active)}>
          All
        </Link>
        {options.map((o) => (
          <Link key={o} href={hrefFor(o)} className={chip(active === o)}>
            {o}
          </Link>
        ))}
      </div>
      {note && <p className="mt-1.5 text-xs text-ink-500">{note}</p>}
    </div>
  );
}

function Th({
  children,
  href,
  active,
  align = "left",
  title,
}: {
  children?: React.ReactNode;
  href?: string;
  active?: boolean;
  align?: "left" | "right";
  title?: string;
}) {
  const base = `px-3 py-2 text-xs font-semibold tracking-wide uppercase ${
    align === "right" ? "text-right" : "text-left"
  }`;

  if (!href) return <th className={`${base} text-ink-500`}>{children}</th>;

  return (
    <th className={base} title={title}>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={active ? "text-maroon-700" : "text-ink-500 hover:text-maroon-700"}
      >
        {children}
        {active && <span aria-hidden="true"> ↓</span>}
      </Link>
    </th>
  );
}

function Row({
  row,
  cdu,
  priorYear,
}: {
  row: Standing;
  cdu: boolean;
  priorYear?: number;
}) {
  // The Unit's assessment page has the reconciliation and the lock; an
  // assessor has no business on it and is sent to what they may read instead.
  const target = cdu
    ? `/cda/cdu/assessments/${row.assessmentId}`
    : `/cda/assess/club/${row.assessmentId}`;

  return (
    <tr className={row.basis === "PROVISIONAL" ? "bg-ink-50/40" : undefined}>
      <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink-500">{row.rank}</td>

      <td className="px-3 py-3">
        <Link href={target} className="font-medium text-ink-900 hover:text-maroon-700">
          {row.club}
        </Link>
        <p className="text-xs text-ink-500">
          {[row.zone, row.pool, row.tier].filter(Boolean).join(" · ")}
        </p>
        {row.basis === "PROVISIONAL" && (
          <p className="mt-1">
            <Badge tone="warn">
              Provisional · {row.settled}/{row.applicable} settled
            </Badge>
          </p>
        )}
      </td>

      <td className="px-3 py-3 text-right whitespace-nowrap">
        <span className="font-semibold tabular-nums text-ink-900">{pct(row.current.percent, 1)}</span>
        <div className="mt-1 w-20 ml-auto">
          <ProgressBar value={row.current.percent} />
        </div>
      </td>

      <td className="px-3 py-3 text-right whitespace-nowrap">
        <Delta value={row.movement?.percent ?? null} />
        <div
          className="mt-0.5"
          title={
            row.prior
              ? `${priorYear ?? "Last cycle"}: ${row.prior.percent.toFixed(1)}%, rank ${
                  row.prior.rank ?? "—"
                }`
              : undefined
          }
        >
          <RankDelta value={row.movement?.rank ?? null} />
        </div>
      </td>

      {DOMAIN_ORDER.map((d) => (
        <td key={d} className="px-3 py-3 text-right whitespace-nowrap">
          <span className="tabular-nums text-ink-800">{pct(row.current.domains[d], 0)}</span>
          <div className="mt-0.5">
            <Delta value={row.movement?.domains[d] ?? null} />
          </div>
        </td>
      ))}

      <td className="px-3 py-3 text-right">
        <ShieldBadge shield={row.shield} size="sm" short />
        {row.movement && row.movement.shield !== 0 && (
          // Named rather than described as up or down: the two labels already
          // say which way it went, and "down from none" — which is what the
          // raw enum produced — says nothing at all.
          <p className="mt-1 text-xs text-ink-500">
            was{" "}
            {row.prior?.shield == null
              ? "not eligible"
              : SHIELD_SHORT_LABELS[row.prior.shield]}
          </p>
        )}
      </td>
    </tr>
  );
}

function MoverList({
  title,
  rows,
  keep,
}: {
  title: string;
  rows: Standing[];
  keep: (movement: number) => boolean;
}) {
  const shown = rows.filter((r) => keep(r.movement!.percent));
  if (shown.length === 0) return null;

  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <p className="px-5 pt-3 text-xs font-semibold tracking-wide text-ink-500 uppercase">{title}</p>
      <ul className="divide-y divide-ink-100">
        {shown.map((r) => (
          <li key={r.assessmentId} className="flex items-baseline justify-between gap-3 px-5 py-2">
            <span className="min-w-0 truncate text-ink-800">{r.club}</span>
            <Delta value={r.movement!.percent} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sorting the board.
 *
 * A club with no comparison sinks to the bottom of a movement sort rather than
 * sitting among the clubs that genuinely didn't move — "no result last year"
 * and "no change" are different answers and must not interleave.
 */
function sortRows(rows: Standing[], sort: Sort): Standing[] {
  const byName = (a: Standing, b: Standing) => a.club.localeCompare(b.club);
  const copy = [...rows];

  if (sort === "club") return copy.sort(byName);

  if (sort === "movement") {
    return copy.sort((a, b) => {
      if (!a.movement && !b.movement) return byName(a, b);
      if (!a.movement) return 1;
      if (!b.movement) return -1;
      return b.movement.percent - a.movement.percent || byName(a, b);
    });
  }

  if (sort === "rank") {
    return copy.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || byName(a, b));
  }

  const domain = sort.toUpperCase() as Domain;
  return copy.sort(
    (a, b) => b.current.domains[domain] - a.current.domains[domain] || byName(a, b),
  );
}
