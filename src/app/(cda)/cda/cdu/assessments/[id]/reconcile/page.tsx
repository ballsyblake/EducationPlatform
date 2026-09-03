import Link from "next/link";
import { DomainBreakdown } from "@/components/cda/summary";
import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireCdu } from "@/lib/cda/access";
import { loadAssessment } from "@/lib/cda/assessment";
import { ASSESSED_DOMAINS, DOMAIN_LABELS } from "@/lib/cda/rubric";
import { AcceptAgreed } from "./accept-agreed";
import { ResolveRow, type ResolveRowData } from "./resolve-row";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Reconcile" };

const FILTERS = [
  { value: "unresolved", label: "Unresolved" },
  { value: "split", label: "Split only" },
  // A one-sided criterion looks settled and isn't, so it gets its own view
  // rather than sitting unremarked among the rest of the unresolved.
  { value: "partial", label: "Waiting on a score" },
  { value: "all", label: "All" },
] as const;

/**
 * Where the CDU turns three independent opinions into one score.
 *
 * Defaults to the unresolved criteria rather than all forty. The job here is to
 * get through the disagreements, and opening on a full list of mostly-settled
 * rows is how the two that matter get lost.
 */
export default async function ReconcilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; domain?: string }>;
}) {
  await requireCdu();
  const { id } = await params;
  const { filter = "unresolved", domain: domainParam } = await searchParams;

  const overview = await loadAssessment(id);
  const { assessment, agreements, rating, frozen } = overview;

  const locked = assessment.lockedAt !== null;

  const rows: ResolveRowData[] = agreements.map((a) => {
    const stored = assessment.finalScores.find((f) => f.criterionId === a.criterion.id);
    return {
      criterionId: a.criterion.id,
      code: a.criterion.code,
      title: a.criterion.title,
      weight: a.criterion.weight,
      maxScore: a.criterion.maxScore,
      area: a.criterion.area,
      level: a.level,
      spread: a.spread,
      suggested: a.suggested,
      final: a.final,
      rationale: stored?.rationale ?? "",
      entries: a.entries,
    };
  });

  const domain = ASSESSED_DOMAINS.includes(domainParam as never)
    ? (domainParam as Domain)
    : undefined;

  const visible = rows.filter((r) => {
    if (domain && !r.code.startsWith(domainPrefix(domain))) return false;
    if (filter === "unresolved") return r.final === null;
    if (filter === "split") return r.level === "MINOR" || r.level === "MAJOR";
    if (filter === "partial") return r.level === "PARTIAL";
    return true;
  });

  const agreedUnresolved = rows.filter((r) => r.level === "AGREED" && r.final === null).length;
  // Held back from the bulk accept because only one assessor's score stands
  // behind them. Counted here so the panel can say why they were left.
  const partial = rows.filter((r) => r.level === "PARTIAL" && r.final === null).length;
  const major = rows.filter((r) => r.level === "MAJOR").length;
  const minor = rows.filter((r) => r.level === "MINOR").length;
  const unresolved = rows.filter((r) => r.final === null).length;

  return (
    <>
      <PageHeader
        title={`Reconcile — ${assessment.club.name}`}
        subtitle={`${overview.assessors.length} assessors · ${assessment.cycle.name}`}
        breadcrumb={{ href: `/cda/cdu/assessments/${id}`, label: "Assessment" }}
      />

      {locked && (
        <div className="mb-6 card card-pad">
          <p className="text-sm text-ink-700">
            This assessment is locked, so scores are read-only. Unlock it from the assessment page
            to make changes.
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile
          label="Unresolved"
          value={unresolved}
          tone={unresolved === 0 ? "good" : "warn"}
        />
        <StatTile label="2+ stars apart" value={major} tone={major > 0 ? "bad" : "good"} />
        <StatTile label="1 star apart" value={minor} tone={minor > 0 ? "warn" : "good"} />
        <StatTile
          label={frozen ? "Final score" : "Provisional"}
          value={`${rating.percent.toFixed(1)}%`}
          hint={frozen ? "Frozen at lock" : "Updates as you resolve"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={`/cda/cdu/assessments/${id}/reconcile?filter=${f.value}${
                  domain ? `&domain=${domain}` : ""
                }`}
                aria-current={filter === f.value ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  filter === f.value
                    ? "bg-maroon-600 text-white"
                    : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                }`}
              >
                {f.label}
              </Link>
            ))}

            <span className="mx-1 w-px bg-ink-200" aria-hidden="true" />

            <Link
              href={`/cda/cdu/assessments/${id}/reconcile?filter=${filter}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                !domain
                  ? "bg-ink-800 text-white"
                  : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
              }`}
            >
              All domains
            </Link>
            {ASSESSED_DOMAINS.map((d) => (
              <Link
                key={d}
                href={`/cda/cdu/assessments/${id}/reconcile?filter=${filter}&domain=${d}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  domain === d
                    ? "bg-ink-800 text-white"
                    : "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                }`}
              >
                {DOMAIN_LABELS[d]}
              </Link>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="Nothing here"
              description={
                filter === "unresolved"
                  ? "Every criterion in this view has been resolved."
                  : filter === "partial"
                    ? "Nothing here is waiting on another assessor's score."
                    : "No criteria match this filter."
              }
            />
          ) : (
            <div className="card divide-y divide-ink-200">
              {visible.map((row, i) => (
                <div key={row.criterionId}>
                  {/* An area heading whenever the group changes, so a split is
                      read next to the other items it is being weighed against. */}
                  {row.area !== visible[i - 1]?.area && (
                    <p className="bg-ink-50 px-4 py-1.5 text-xs font-semibold text-ink-600">
                      {row.area ?? "Ungrouped"}
                    </p>
                  )}
                  <ResolveRow assessmentId={id} row={row} locked={locked} />
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {!locked && (
            <AcceptAgreed assessmentId={id} count={agreedUnresolved} partial={partial} />
          )}
          <DomainBreakdown rating={rating} provisional={!frozen} />
        </aside>
      </div>
    </>
  );
}

/** Criterion codes are domain-prefixed, which is what makes this filter cheap. */
function domainPrefix(domain: Domain) {
  return domain === "PLANNING" ? "PL-" : domain === "DELIVERY" ? "DL-" : "OU-";
}
