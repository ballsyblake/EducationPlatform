import { ProgressBar } from "@/components/ui";
import { DOMAIN_LABELS } from "@/lib/cda/rubric";
import { pct, type AreaResult } from "@/lib/cda/scoring";
import type { Domain } from "@prisma-client";

const DOMAIN_ORDER: Domain[] = ["PLANNING", "DELIVERY", "OUTCOMES"];

/**
 * Each assessed domain broken into its macro-areas.
 *
 * This is the shape of the report Football Queensland actually sends: a club is
 * told it scored 67% on Program Management & Monitoring and 48% on Training
 * Program Observations, not 63% on Delivery. The domain figure averages two
 * different problems into one number nobody can act on.
 *
 * Technical Qualifications has no areas — it isn't built from line items — so
 * it is deliberately absent here and shown by its role breakdown instead.
 */
export function AreaBreakdown({
  areas,
  notes,
  provisional,
}: {
  areas: AreaResult[];
  /** Keyed by areaKey(domain, area). */
  notes?: Map<string, string>;
  provisional?: boolean;
}) {
  return (
    <div className="space-y-6">
      {DOMAIN_ORDER.map((domain) => {
        const inDomain = areas.filter((a) => a.domain === domain);
        if (inDomain.length === 0) return null;

        const earned = inDomain.reduce((n, a) => n + a.earned, 0);
        const available = inDomain.reduce((n, a) => n + a.available, 0);

        return (
          <section key={domain}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="section-title">{DOMAIN_LABELS[domain]}</h3>
              <p className="text-xs text-ink-500">
                <span className="tabular-nums">
                  {earned} / {available}
                </span>{" "}
                points · {available === 0 ? "—" : pct((earned / available) * 100, 0)}
                {provisional && " · provisional"}
              </p>
            </div>

            <div className="card divide-y divide-ink-200">
              {inDomain.map((area) => {
                const note = notes?.get(`${area.domain}|${area.area ?? ""}`);

                return (
                  <div key={`${area.domain}-${area.area}`} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <p className="min-w-0 font-medium text-ink-900">
                        {area.area ?? "Ungrouped"}
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs tabular-nums text-ink-500">
                          {area.earned} / {area.available}
                        </span>
                        <div className="w-20">
                          <ProgressBar value={area.percent} />
                        </div>
                        <span className="w-11 text-right font-semibold tabular-nums text-ink-900">
                          {pct(area.percent, 0)}
                        </span>
                      </div>
                    </div>

                    <p className="mt-0.5 text-xs text-ink-400">
                      {area.total} line item{area.total === 1 ? "" : "s"}
                      {area.scored < area.total && ` · ${area.total - area.scored} unscored`}
                    </p>

                    {note && <p className="mt-2 prose-note">{note}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
