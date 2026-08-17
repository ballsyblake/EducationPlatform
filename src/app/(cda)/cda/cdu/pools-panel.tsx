"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { createPool, type CduFormState } from "./actions";

const initial: CduFormState = { status: "idle" };

export type PoolSummary = { id: string; name: string; clubs: number; items: number };

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
                {p.clubs} club{p.clubs === 1 ? "" : "s"} · {p.items} allocated
              </span>
            </li>
          ))}
        </ul>
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
