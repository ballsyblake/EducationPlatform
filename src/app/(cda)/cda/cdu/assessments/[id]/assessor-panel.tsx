"use client";

import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui";
import { setClubPool } from "../../actions";

export type PoolSummary = {
  id: string;
  name: string;
  clubs: number;
  /** Line items with at least one assessor allocated. */
  assigned: number;
  submitted: number;
  criteriaTotal: number;
};

export type AssessorSummary = { id: string; name: string; items: number; submitted: number };

/**
 * The club's place in the assessment, from the CDU's side.
 *
 * Deliberately not an assign-an-assessor form any more. Under vertical
 * assessment nobody is allocated to a club — they're allocated a line item
 * across the whole pool — so allocation belongs on the pool, and this panel
 * shows the consequence for this club and links to where the work is done.
 */
export function AssessorPanel({
  assessmentId,
  pool,
  pools,
  assessors,
  locked,
}: {
  assessmentId: string;
  pool: PoolSummary | null;
  pools: { id: string; name: string }[];
  assessors: AssessorSummary[];
  locked: boolean;
}) {
  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink-900">Assessment pool</h2>
        {pool && (
          <span className="text-xs text-ink-500">
            {pool.assigned}/{pool.criteriaTotal} line items allocated
          </span>
        )}
      </div>

      {!pool ? (
        <p className="mb-3 text-sm text-maroon-700">
          This club isn&apos;t in a pool, so no assessor can reach it.
        </p>
      ) : (
        <div className="mb-3 space-y-1 text-sm">
          <p className="text-ink-700">
            <span className="font-medium">Pool {pool.name}</span> · {pool.clubs} club
            {pool.clubs === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-ink-500">
            {pool.submitted} of {pool.criteriaTotal} line items submitted across the pool.
          </p>
        </div>
      )}

      {!locked && (
        <form action={setClubPool} className="mb-4 space-y-2 border-t border-ink-200 pt-3">
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <label className="label" htmlFor={`pool-${assessmentId}`}>
            Move to pool
          </label>
          <select
            id={`pool-${assessmentId}`}
            name="poolId"
            className="input"
            defaultValue={pool?.id ?? ""}
          >
            <option value="">No pool</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                Pool {p.name}
              </option>
            ))}
          </select>
          <SubmitButton className="btn-secondary btn-sm w-full" pendingLabel="Moving…">
            Save pool
          </SubmitButton>
        </form>
      )}

      <div className="border-t border-ink-200 pt-3">
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Assessors on this pool</h3>
        {assessors.length === 0 ? (
          <p className="text-sm text-ink-500">Nobody allocated yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {assessors.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink-700">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-ink-500">
                    {a.submitted}/{a.items}
                  </span>
                  {a.submitted === a.items ? (
                    <Badge tone="good">In</Badge>
                  ) : (
                    <Badge tone="warn">Working</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {pool && (
          <Link href={`/cda/cdu/pools/${pool.id}`} className="btn-secondary btn-sm mt-3 w-full">
            Allocate line items →
          </Link>
        )}
      </div>
    </div>
  );
}
