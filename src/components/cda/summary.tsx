import { ProgressBar } from "@/components/ui";
import { DOMAIN_LABELS } from "@/lib/cda/rubric";
import { pct, type RatingResult } from "@/lib/cda/scoring";
import type { Domain } from "@prisma-client";

const DOMAIN_ORDER: Domain[] = ["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"];

/**
 * The four domains and what each contributes to the total.
 *
 * The contribution column is the one that matters and the one most rating
 * systems omit: a club looking at "Delivery 83%" can't tell whether improving
 * it is worth the effort until they can see it's carrying 24.9 of the 30 points
 * available to it.
 */
export function DomainBreakdown({
  rating,
  provisional,
}: {
  rating: RatingResult;
  provisional?: boolean;
}) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 px-5 py-3">
        <h2 className="font-semibold text-ink-900">Domain scores</h2>
        {provisional && (
          <p className="text-xs text-ink-500">
            Provisional — based on the median of the assessors, before reconciliation.
          </p>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            <th className="px-5 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Domain
            </th>
            <th className="w-40 px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Score
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Weight
            </th>
            <th className="px-5 py-2 text-right text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Contributes
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {DOMAIN_ORDER.map((domain) => (
            <tr key={domain}>
              <td className="px-5 py-3 font-medium text-ink-800">{DOMAIN_LABELS[domain]}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-20">
                    <ProgressBar value={rating.domains[domain]} />
                  </div>
                  <span className="tabular-nums text-ink-700">
                    {pct(rating.domains[domain], 0)}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-ink-500">
                {rating.weights[domain]}%
              </td>
              <td className="px-5 py-3 text-right font-medium tabular-nums text-ink-900">
                {rating.contributions[domain].toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-200 bg-ink-50">
            <td className="px-5 py-3 font-semibold text-ink-900" colSpan={3}>
              Weighted total
            </td>
            <td className="px-5 py-3 text-right text-lg font-bold tabular-nums text-maroon-700">
              {pct(rating.percent)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
