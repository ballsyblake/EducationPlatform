"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { allocateEveryPool, createPool, type CduFormState } from "./actions";

const initial: CduFormState = { status: "idle" };

export type PoolSummary = {
  id: string;
  name: string;
  clubs: number;
  items: number;
  /** Line items this pool's clubs are assessed on. */
  applicable: number;
  /** Of those, how many nobody holds. */
  missing: number;
  /** Carried its retained-evidence domains over from last season. */
  retained: boolean;
};

/**
 * The pools in this cycle, and the way to make one.
 *
 * `createPool` existed from the start and had no button anywhere, which made a
 * fresh instance a dead end one step past the one already fixed: you could
 * open a cycle and add clubs, then find every club stuck on "No pool" with
 * nothing on any screen able to create one — and a club with no pool has no
 * assessors, so nothing could be assessed at all.
 */
export function PoolsPanel({ cycleId, pools }: { cycleId: string; pools: PoolSummary[] }) {
  const [state, formAction] = useActionState(
    async (prev: CduFormState, formData: FormData) => {
      const result = await createPool(prev, formData);
      if (result.status === "ok") setName("");
      return result;
    },
    initial,
  );
  const [name, setName] = useState("");
  const [fillState, fillAction] = useActionState(allocateEveryPool, initial);

  const gaps = pools.reduce((n, p) => n + p.missing, 0);
  const poolsWithGaps = pools.filter((p) => p.missing > 0).length;

  return (
    <div className="card card-pad">
      <h2 className="mb-1 font-semibold text-ink-900">Pools</h2>
      <p className="mb-3 text-xs text-ink-600">
        A pool is a group of clubs assessed together. Assessors hold a line item across a whole
        pool, so clubs must be in one before anyone can score them.
      </p>

      {pools.length > 0 && (
        <ul className="mb-3 space-y-1">
          {pools.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/cda/cdu/pools/${p.id}`} className="font-medium text-maroon-700 hover:underline">
                Pool {p.name}
              </Link>
              <span className="text-xs text-ink-500">
                {p.clubs} club{p.clubs === 1 ? "" : "s"} · {p.items}/{p.applicable} allocated
                {/* Said here as well as on the pool's own page: it changes how
                    every club in the pool is placed, and the cycle board is
                    where someone would notice it was set wrongly. */}
                {p.retained && " · evidence retained"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* One action for the whole cycle. Each pool's own page has the same
          control for that pool alone, and every allocation it makes is listed
          and removable there — this only saves visiting each in turn. */}
      {(gaps > 0 || fillState.status === "ok") && (
        <div className="mb-3 border-t border-ink-200 pt-3">
          {gaps > 0 && (
            <>
              <p className="mb-2 text-xs text-ink-600">
                {gaps} line item{gaps === 1 ? "" : "s"} across {poolsWithGaps} pool
                {poolsWithGaps === 1 ? "" : "s"} have no assessor. Filling them gives each two,
                chosen by who is carrying the least.
              </p>
              <form action={fillAction}>
                <input type="hidden" name="cycleId" value={cycleId} />
                <SubmitButton
                  className="btn-secondary btn-sm"
                  pendingLabel="Allocating…"
                  confirm={`Give all ${gaps} unallocated line items two assessors each, across every pool? You can remove any of them from the pool pages.`}
                >
                  Allocate every pool
                </SubmitButton>
              </form>
            </>
          )}
          {fillState.status === "error" && (
            <div className="mt-2">
              <FormError message={fillState.message} />
            </div>
          )}
          {fillState.status === "ok" && (
            <p className="rounded-lg bg-status-green-bg px-3 py-2 text-xs text-status-green-fg">
              {fillState.message}
            </p>
          )}
        </div>
      )}

      <form action={formAction} className="flex items-end gap-2">
        <input type="hidden" name="cycleId" value={cycleId} />
        <div className="flex-1">
          <label className="label text-xs" htmlFor="pool-name">
            New pool
          </label>
          <input
            id="pool-name"
            name="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="A"
            maxLength={12}
          />
        </div>
        <SubmitButton className="btn-secondary" pendingLabel="…">
          Add
        </SubmitButton>
      </form>
      {state.status === "error" && (
        <div className="mt-2">
          <FormError message={state.message} />
        </div>
      )}
    </div>
  );
}
