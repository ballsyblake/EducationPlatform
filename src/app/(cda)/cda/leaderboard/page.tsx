import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Delta, RankDelta } from "@/components/cda/delta";
import { ShieldBadge } from "@/components/cda/shield";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { isCdu } from "@/lib/auth";
import { ambassadorClubIds, requireCdaUser } from "@/lib/cda/access";
import {
  LEAGUE_BANDS,
  boardCycles,
  loadLeaderboard,
  type ScoreBasis,
  type Standing,
} from "@/lib/cda/leaderboard";
import { DOMAIN_LABELS, SHIELD_SHORT_LABELS } from "@/lib/cda/rubric";
import { HARMONISED_DOMAINS, pct } from "@/lib/cda/scoring";
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
  searchParams: Promise<{
    cycle?: string;
    sort?: string;
    zone?: string;
    tier?: string;
    view?: string;
    score?: string;
  }>;
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
    view: viewParam,
    score: scoreParam,
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

  const scoreBasis: ScoreBasis = scoreParam === "harmonised" ? "HARMONISED" : "RAW";
  const harmonisedView = scoreBasis === "HARMONISED";

  const board = await loadLeaderboard(cycle.id, scoreBasis);
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

  // Football Queensland keeps two boards of the same data: one overall, which
  // is what the league allocation is drawn from, and one per pool, which is how
  // a pool's own assessors read the clubs they scored against each other.
  const byPool = viewParam === "pool";
  const sorted = byPool ? sortPools(rows) : sortRows(rows, sort);

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
    view?: string | null;
    score?: string | null;
  }) => {
    const q = new URLSearchParams();
    q.set("cycle", params.cycle ?? cycle.id);
    const s = params.sort ?? sort;
    if (s !== "rank") q.set("sort", s);
    const z = params.zone === undefined ? zone : params.zone;
    if (z) q.set("zone", z);
    const t = params.tier === undefined ? tier : params.tier;
    if (t) q.set("tier", t);
    const v = params.view === undefined ? (byPool ? "pool" : undefined) : params.view;
    if (v) q.set("view", v);
    const sc =
      params.score === undefined ? (harmonisedView ? "harmonised" : undefined) : params.score;
    if (sc) q.set("score", sc);
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

      <div className="mb-6 space-y-4">
        {board.harmonisable > 0 && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Score
              </span>
              {[
                { value: null, label: "This season" },
                { value: "harmonised", label: "Harmonised" },
              ].map((o) => (
                <Link
                  key={o.label}
                  href={href({ score: o.value })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    harmonisedView === (o.value === "harmonised")
                      ? "bg-maroon-600 text-white"
                      : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                  }`}
                >
                  {o.label}
                </Link>
              ))}
            </div>
            <p className="mt-1.5 max-w-3xl text-xs text-ink-500">
              {harmonisedView ? (
                <>
                  {HARMONISED_DOMAINS.map((d) => DOMAIN_LABELS[d]).join(" and ")} pooled across{" "}
                  {board.priorCycle?.year} and {board.cycle.year} — every point scored across both
                  seasons over every point available — with the places, leagues and changes drawn
                  from that. {board.harmonisable} of {board.standings.length}{" "}
                  ranked clubs have a season to pool with; the rest keep this one&apos;s score.
                </>
              ) : (
                <>
                  This season&apos;s assessment alone. Planning evidence is retained between seasons
                  for some pools, so the harmonised board is the one a league allocation is drawn
                  from.
                </>
              )}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-ink-500 uppercase">View</span>
          {[
            { value: null, label: "Overall" },
            { value: "pool", label: "By pool" },
          ].map((v) => (
            <Link
              key={v.label}
              href={href({ view: v.value })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                byPool === (v.value === "pool")
                  ? "bg-maroon-600 text-white"
                  : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>

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
                  <Th align="right" title="Indicative, from the overall rank">
                    League
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
                {sorted.map((r, i) => (
                  <Fragment key={r.assessmentId}>
                    {byPool && r.pool !== sorted[i - 1]?.pool && (
                      <tr>
                        <td
                          colSpan={10}
                          className="bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-600"
                        >
                          {r.pool ? `Pool ${r.pool}` : "No pool"}
                        </td>
                      </tr>
                    )}
                    <Row
                      row={r}
                      cdu={cdu}
                      priorYear={board.priorCycle?.year}
                      place={byPool ? r.poolRank : r.rank}
                      harmonised={harmonisedView}
                    />
                  </Fragment>
                ))}
              </tbody>
            </table>

            <p className="border-t border-ink-200 px-5 py-2.5 text-xs text-ink-500">
              Points are the season&apos;s currency and the percentage is derived from them;
              only the percentage survives a change of year, because the points available move
              between cycles. Change is percentage points against the same club&apos;s
              {board.priorCycle ? ` ${board.priorCycle.year}` : " previous"} result, and a club
              with no comparable result shows a dash rather than a zero. League is indicative —
              the top {LEAGUE_BANDS[0]} by rank, then {LEAGUE_BANDS[1]}, then {LEAGUE_BANDS[2]} —
              and the Unit sets the real allocation. Places are counted across the whole cycle,
              so a filtered view keeps the gaps, and a Tier 2 percentage is a different
              measurement from a Tier 1 one rather than a lower version of it.
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

      {/* Below the board rather than beside it: ten columns of points,
          percentages and deltas need the width more than a sidebar does,
          and these two panels read as the board's footnotes anyway. */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
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

/** Points as FQ writes them: whole where they are whole, one place where not. */
function points(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function Row({
  row,
  cdu,
  priorYear,
  place,
  harmonised,
}: {
  row: Standing;
  cdu: boolean;
  priorYear?: number;
  /** Overall rank, or the rank within the pool when the board is grouped. */
  place: number | null;
  /** Show the two-season figure rather than this season's alone. */
  harmonised: boolean;
}) {
  // What this row is showing: the harmonised figure where the board is on that
  // basis and the club has one, this season's otherwise. Read once so the
  // number, the bar, the percentage and the ranking can never disagree.
  const showHarmonised = harmonised && row.harmonised !== null;
  const percent = showHarmonised ? row.harmonised!.percent : row.current.percent;
  const total = showHarmonised ? row.harmonised!.total : (row.points?.total ?? null);

  // The Unit's assessment page has the reconciliation and the lock; an
  // assessor has no business on it and is sent to what they may read instead.
  const target = cdu
    ? `/cda/cdu/assessments/${row.assessmentId}`
    : `/cda/assess/club/${row.assessmentId}`;

  return (
    <tr className={row.basis === "PROVISIONAL" ? "bg-ink-50/40" : undefined}>
      <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink-500">{place}</td>

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
        <span className="font-semibold tabular-nums text-ink-900">
          {total ? points(total.earned) : pct(percent, 1)}
        </span>
        {total && <span className="tabular-nums text-ink-400"> / {total.available}</span>}
        <div className="mt-1 flex items-center justify-end gap-2">
          <div className="w-16">
            <ProgressBar value={percent} />
          </div>
          <span className="text-xs tabular-nums text-ink-600">{pct(percent, 1)}</span>
        </div>
        {/* The adjustment, never only the adjusted number: a club asked why it
            sits where it does is owed the size of the correction. */}
        {harmonised && row.harmonised && (
          <p className="text-xs text-ink-500">
            {row.harmonised.diff >= 0 ? "+" : "−"}
            {Math.abs(row.harmonised.diff).toFixed(1)} on {points(row.points!.total.earned)}
            {row.harmonised.basis === "MEAN" && " · mean"}
          </p>
        )}
        {harmonised && !row.harmonised && (
          <p className="text-xs text-ink-400">this season only</p>
        )}
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

      <td className="px-3 py-3 text-right whitespace-nowrap">
        {row.league === null ? (
          <span className="text-ink-300">—</span>
        ) : (
          <>
            <span className="tabular-nums text-ink-800">League {row.league}</span>
            {row.priorLeague !== null && row.priorLeague !== row.league && (
              // Promotion and relegation is what the ranking is actually read
              // for, so a crossing is called out rather than left to be worked
              // out from two rank numbers.
              <p
                className={`text-xs font-medium ${
                  row.league < row.priorLeague ? "text-status-green-fg" : "text-maroon-700"
                }`}
              >
                {row.league < row.priorLeague ? "up" : "down"} from {row.priorLeague}
              </p>
            )}
          </>
        )}
      </td>

      {DOMAIN_ORDER.map((d) => {
        const swap = harmonised ? row.harmonised?.domains[d] : undefined;
        const earned = swap ? swap.points : row.points?.domains[d].earned;
        return (
          <td key={d} className="px-3 py-3 text-right whitespace-nowrap">
            <span
              className="font-medium tabular-nums text-ink-900"
              title={
                row.points
                  ? `${points(row.points.domains[d].earned)} of ${
                      row.points.domains[d].available
                    } points this season${
                      swap ? `, ${points(swap.points)} pooled across both` : ""
                    }`
                  : undefined
              }
            >
              {earned === undefined ? "—" : points(earned)}
            </span>
            <div className="mt-0.5 flex items-center justify-end gap-1.5">
              <span className="text-xs tabular-nums text-ink-600">
                {pct(swap ? swap.percent : row.current.domains[d], 0)}
              </span>
              <Delta value={row.movement?.domains[d] ?? null} />
            </div>
          </td>
        );
      })}

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
 * The per-pool board: pools in name order, clubs by their place within each.
 *
 * Deliberately not sortable by domain. The point of this view is the order
 * inside a pool, and a sort that cut across the groupings would leave the
 * headings meaning nothing.
 */
function sortPools(rows: Standing[]): Standing[] {
  return [...rows].sort(
    (a, b) =>
      (a.pool ?? "\uffff").localeCompare(b.pool ?? "\uffff") ||
      (a.poolRank ?? 0) - (b.poolRank ?? 0) ||
      a.club.localeCompare(b.club),
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
