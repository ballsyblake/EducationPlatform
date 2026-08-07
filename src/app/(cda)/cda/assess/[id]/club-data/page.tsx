import { Badge, PageHeader, StatTile } from "@/components/ui";
import { requireAssessmentAccess, requireAssessor } from "@/lib/cda/access";
import {
  EMPLOYMENT_LABELS,
  METRIC_SPECS,
  STAFF_ROLE_ORDER,
  STAFF_ROLE_SPECS,
  metricChange,
} from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";

export const metadata = { title: "Club evidence" };

/**
 * Everything the club submitted, read-only.
 *
 * An assessor scoring the Outcomes criteria needs the club's own numbers in
 * front of them, and scoring Technical Qualifications means reading the staff
 * register. What they deliberately don't get is any computed score: their job
 * is to judge the evidence, and showing them the Technical percentage the
 * register already produces would anchor how they score everything else.
 */
export default async function ClubDataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assessor = await requireAssessor();
  const assessment = await requireAssessmentAccess(assessor, id);

  const [staff, metrics, nonNegotiables] = await Promise.all([
    prisma.staffMember.findMany({
      where: { assessmentId: id },
      include: { qualification: true, certificates: true },
      orderBy: { name: "asc" },
    }),
    prisma.clubMetric.findMany({ where: { assessmentId: id } }),
    prisma.nonNegotiableResult.findMany({
      where: { assessmentId: id },
      include: { nonNegotiable: true, evidence: true },
      orderBy: { nonNegotiable: { position: "asc" } },
    }),
  ]);

  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const missingBlueCards = staff.filter((s) => !s.blueCard).length;
  const femaleTechnical = staff.filter((s) => s.gender === "FEMALE").length;

  return (
    <>
      <PageHeader
        title={`${assessment.club.name} — submitted evidence`}
        subtitle="Everything the club declared for this cycle."
        breadcrumb={{ href: `/cda/assess/${id}`, label: "Back to scoring" }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Staff declared" value={staff.length} />
        <StatTile
          label="Without a Blue Card"
          value={missingBlueCards}
          tone={missingBlueCards > 0 ? "bad" : "good"}
        />
        <StatTile
          label="Female technical staff"
          value={femaleTechnical}
          tone={femaleTechnical > 0 ? "good" : "bad"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="section-title mb-3">Technical staff register</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">Name</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">
                    Qualification
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-500 uppercase">Engaged</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                    Yrs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {STAFF_ROLE_ORDER.flatMap((role) => {
                  const inRole = staff.filter((s) => s.staffRole === role);
                  if (!inRole.length) return [];
                  return [
                    <tr key={`h-${role}`} className="bg-ink-50">
                      <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold text-ink-600">
                        {STAFF_ROLE_SPECS[role].label}
                      </td>
                    </tr>,
                    ...inRole.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2">
                          <span className="font-medium text-ink-900">{s.name}</span>
                          {!s.blueCard && (
                            <span className="ml-2">
                              <Badge tone="bad">No Blue Card</Badge>
                            </span>
                          )}
                          {s.certificates.map((c) => (
                            <a
                              key={c.id}
                              href={`/api/files/${c.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-xs text-maroon-700 underline"
                            >
                              certificate
                            </a>
                          ))}
                          {s.notes && <p className="mt-0.5 text-xs text-ink-500">{s.notes}</p>}
                        </td>
                        <td className="px-3 py-2 text-ink-700">
                          {s.qualification?.label ?? (
                            <span className="text-ink-400">Not recorded</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-ink-700">
                          {EMPLOYMENT_LABELS[s.employment]}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-ink-700">
                          {s.yearsExperience}
                        </td>
                      </tr>
                    )),
                  ];
                })}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-ink-500">
                      The club hasn&apos;t entered any staff.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="section-title mb-3">Participation figures</h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left">
                    <th className="px-4 py-2 text-xs font-semibold text-ink-500 uppercase">
                      Measure
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                      Last
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                      This
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500 uppercase">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {METRIC_SPECS.map((spec) => {
                    const row = byKey.get(spec.key);
                    const change = metricChange(row?.value ?? null, row?.priorValue ?? null);
                    return (
                      <tr key={spec.key}>
                        <td className="px-4 py-2 text-ink-700">{spec.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-500">
                          {row?.priorValue ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-ink-900">
                          {row?.value ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {change === null ? (
                            <span className="text-ink-300">—</span>
                          ) : (
                            <span
                              className={
                                change < 0 ? "text-maroon-700" : "text-status-green-fg"
                              }
                            >
                              {change > 0 ? "+" : ""}
                              {change.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="section-title mb-3">Non-Negotiable declarations</h2>
            <div className="card divide-y divide-ink-200">
              {nonNegotiables.map((n) => (
                <div key={n.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink-900">
                      {n.nonNegotiable.code} — {n.nonNegotiable.title}
                    </p>
                    <Badge
                      tone={
                        n.verdict === "PASS"
                          ? "good"
                          : n.verdict === "FAIL"
                            ? "bad"
                            : n.clubDeclared === null
                              ? "warn"
                              : "muted"
                      }
                    >
                      {n.verdict !== "PENDING"
                        ? n.verdict === "PASS"
                          ? "Verified"
                          : "Failed"
                        : n.clubDeclared === null
                          ? "Not answered"
                          : n.clubDeclared
                            ? "Club says yes"
                            : "Club says not yet"}
                    </Badge>
                  </div>
                  {n.clubNote && <p className="mt-1 text-xs text-ink-600">{n.clubNote}</p>}
                  {n.evidence.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-2 text-xs">
                      {n.evidence.map((e) => (
                        <a
                          key={e.id}
                          href={`/api/files/${e.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-maroon-700 underline"
                        >
                          {e.filename}
                        </a>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
