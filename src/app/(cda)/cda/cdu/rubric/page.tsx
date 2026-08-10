import { Badge, PageHeader, StatTile } from "@/components/ui";
import { requireCdu } from "@/lib/cda/access";
import { activeCycle } from "@/lib/cda/assessment";
import {
  DOMAIN_BLURBS,
  DOMAIN_LABELS,
  EMPLOYMENT_LABELS,
  EMPLOYMENT_POINTS,
  EXPERIENCE_BANDS,
  MAX_STAFF_POINTS,
  OFF_STREAM_MULTIPLIER,
  QUALIFICATION_STREAM_LABELS,
  STAFF_ROLE_ORDER,
  STAFF_ROLE_SPECS,
} from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Rubric" };

const ASSESSED: Domain[] = ["PLANNING", "DELIVERY", "OUTCOMES"];

/**
 * The whole rubric on one page.
 *
 * Read-only on purpose. The CDU needs to be able to answer "why did this club
 * score what it scored" without reading code, and the criteria text is edited
 * where it's used rather than through a second editor here that could drift.
 */
export default async function RubricPage() {
  await requireCdu();
  const cycle = await activeCycle();

  const [criteria, qualifications, nonNegotiables] = await Promise.all([
    prisma.criterion.findMany({
      where: { active: true },
      include: { _count: { select: { subCriteria: true } }, tiers: { orderBy: { position: "asc" } } },
      // Position, not domain: SQLite sorts the enum as TEXT, which would order
      // the domains alphabetically rather than the way FQ presents them.
      orderBy: [{ position: "asc" }, { code: "asc" }],
    }),
    prisma.qualification.findMany({
      where: { active: true },
      orderBy: [{ points: "desc" }, { position: "asc" }],
    }),
    prisma.nonNegotiable.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
  ]);

  const totalRoleWeight = STAFF_ROLE_ORDER.reduce(
    (n, r) => n + STAFF_ROLE_SPECS[r].weight,
    0,
  );

  return (
    <>
      <PageHeader
        title="Rating rubric"
        subtitle="How every number in the portal is produced."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Criteria" value={criteria.filter((c) => c.domain !== "TECHNICAL").length} />
        <StatTile label="Evidence points" value={criteria.reduce((n, c) => n + c._count.subCriteria, 0)} />
        <StatTile label="Non-Negotiables" value={nonNegotiables.length} />
        <StatTile label="Qualifications" value={qualifications.length} />
      </div>

      {cycle && (
        <div className="mb-6 card card-pad">
          <h2 className="mb-2 font-semibold text-ink-900">{cycle.name} weighting</h2>
          <p className="text-sm text-ink-600">
            Every line item is worth its score times its weighting, and the rating is those points
            summed across all four domains. Technical Qualifications contributes{" "}
            {cycle.technicalMaxPoints} points; the other three take theirs from the line items
            below. A shield needs Bronze {cycle.bronzeMin}%, Silver {cycle.silverMin}%, Gold{" "}
            {cycle.goldMin}%, Platinum {cycle.platinumMin}% — and all nine Non-Negotiables met,
            whatever the score.
          </p>
        </div>
      )}

      <section className="mb-8">
        <h2 className="section-title mb-3">Technical Qualifications</h2>

        <div className="mb-4 card card-pad">
          <p className="text-sm text-ink-700">
            Each staff member scores up to {MAX_STAFF_POINTS} points: their highest qualification
            (up to 10), years in the role (up to 3) and how the club engages them (up to 2). A role
            provides a fixed number of counted slots, filled by the club&apos;s best-scoring people
            in that role; any slot left empty scores zero. Roles are then combined by weight, so an
            unfilled Technical Director costs five times an unfilled MiniRoos Coordinator.
          </p>
          <p className="mt-2 text-sm text-ink-700">
            A qualification from the wrong stream for the role — a goalkeeping licence in an
            outfield role, or the reverse — counts at {OFF_STREAM_MULTIPLIER * 100}%. Community
            certificates are never discounted.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card overflow-x-auto">
            <h3 className="border-b border-ink-200 px-4 py-2 text-sm font-semibold text-ink-900">
              Roles
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">Role</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">Stream</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                    Slots
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {STAFF_ROLE_ORDER.map((role) => {
                  const spec = STAFF_ROLE_SPECS[role];
                  return (
                    <tr key={role}>
                      <td className="px-4 py-2 text-ink-800">{spec.label}</td>
                      <td className="px-3 py-2 text-xs text-ink-500">
                        {QUALIFICATION_STREAM_LABELS[spec.stream]}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-700">
                        {spec.counted}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink-700">
                        {spec.weight}
                        <span className="ml-1 text-xs text-ink-400">
                          ({Math.round((spec.weight / totalRoleWeight) * 100)}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            <div className="card overflow-x-auto">
              <h3 className="border-b border-ink-200 px-4 py-2 text-sm font-semibold text-ink-900">
                Qualification ladder
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ink-100">
                  {qualifications.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-1.5 text-ink-800">{q.label}</td>
                      <td className="px-3 py-1.5 text-xs text-ink-400">
                        {QUALIFICATION_STREAM_LABELS[q.stream]}
                      </td>
                      <td className="px-4 py-1.5 text-right font-medium tabular-nums text-ink-900">
                        {q.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card card-pad">
              <h3 className="mb-2 text-sm font-semibold text-ink-900">Experience and engagement</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <ul className="space-y-1 text-sm">
                  {EXPERIENCE_BANDS.map((b) => (
                    <li key={b.label} className="flex justify-between gap-2">
                      <span className="text-ink-600">{b.label}</span>
                      <span className="tabular-nums text-ink-900">+{b.points}</span>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1 text-sm">
                  {(Object.keys(EMPLOYMENT_POINTS) as (keyof typeof EMPLOYMENT_POINTS)[]).map(
                    (e) => (
                      <li key={e} className="flex justify-between gap-2">
                        <span className="text-ink-600">{EMPLOYMENT_LABELS[e]}</span>
                        <span className="tabular-nums text-ink-900">+{EMPLOYMENT_POINTS[e]}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {ASSESSED.map((domain) => {
        const inDomain = criteria.filter((c) => c.domain === domain);

        return (
          <section key={domain} className="mb-8">
            <h2 className="section-title mb-1">{DOMAIN_LABELS[domain]}</h2>
            <p className="mb-3 text-sm text-ink-600">{DOMAIN_BLURBS[domain]}</p>

            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left">
                    <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">Code</th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Criterion
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Tiers
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Evidence
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Bands at
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {inDomain.flatMap((c, i) => {
                    // FQ's report is organised by macro-area, each with its own
                    // subtotal — so the rubric reads the same way.
                    const newArea = c.area && c.area !== inDomain[i - 1]?.area;
                    const areaItems = inDomain.filter((x) => x.area === c.area);
                    const rows = [];
                    if (newArea) {
                      rows.push(
                        <tr key={`a-${c.area}`} className="bg-ink-50">
                          <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-ink-600">
                            {c.area}
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs font-semibold tabular-nums text-ink-600">
                            {areaItems.reduce((n, x) => n + x.maxScore * x.weight, 0)}
                          </td>
                        </tr>,
                      );
                    }
                    rows.push(
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-xs text-ink-400">{c.code}</td>
                      <td className="px-3 py-2">
                        <span className="text-ink-800">{c.title}</span>
                        {c.evidenceProvisional && (
                          <span className="ml-2">
                            <Badge tone="warn">Wording provisional</Badge>
                          </span>
                        )}
                        {c.description && (
                          <p className="text-xs text-ink-500">{c.description}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-ink-500">
                        {c.tiers.map((t) => t.code).join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-600">
                        {c._count.subCriteria}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-600">
                        {c.oneStarAt} / {c.twoStarAt} / {c.threeStarAt}
                        {c.fourStarAt != null && ` / ${c.fourStarAt}`}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <span className="tabular-nums text-ink-700">
                          {c.maxScore} × {c.weight}
                        </span>
                        <span className="ml-1 text-ink-400">= {c.maxScore * c.weight}</span>
                      </td>
                    </tr>);
                    return rows;
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 bg-ink-50 text-xs text-ink-600">
                    <td className="px-4 py-2" colSpan={5}>
                      {inDomain.length} line items
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      Σ {inDomain.reduce((n, c) => n + c.maxScore * c.weight, 0)} points
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}

      <section>
        <h2 className="section-title mb-3">Non-Negotiables</h2>
        <div className="card divide-y divide-ink-200">
          {nonNegotiables.map((n) => (
            <div key={n.id} className="px-5 py-3">
              <p className="text-sm font-medium text-ink-900">
                {n.code} — {n.title}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">{n.description}</p>
              {n.evidenceHint && (
                <p className="mt-1 text-xs text-ink-500">
                  <span className="font-medium">Evidence:</span> {n.evidenceHint}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
