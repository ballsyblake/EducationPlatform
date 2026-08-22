"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { allocateRemaining, type CduFormState } from "../../actions";

const initialState: CduFormState = { status: "idle" };

/**
 * Fills every line item in this pool that nobody holds.
 *
 * Offered only while there is a gap. It is a shortcut for work the row-by-row
 * dropdowns below already do — a hundred-odd selections across three pools
 * otherwise — and everything it does is visible and removable in those same
 * rows afterwards.
 */
export function FillGaps({ poolId, missing }: { poolId: string; missing: number }) {
  const [state, formAction] = useActionState(allocateRemaining, initialState);

  if (missing <= 0 && state.status !== "ok") return null;

  return (
    <div className="mb-6 card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink-900">
            {missing > 0
              ? `${missing} line item${missing === 1 ? "" : "s"} in this pool have no assessor`
              : "Every line item in this pool has an assessor"}
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Filling them gives each one two independent assessors, chosen by who is carrying the
            least — first in this pool, then across the cycle. That spreads the load; it is not a
            judgement about who suits an item, so change any of them in the rows below.
          </p>
        </div>

        {missing > 0 && (
          <form action={formAction} className="shrink-0">
            <input type="hidden" name="poolId" value={poolId} />
            <SubmitButton
              className="btn-primary btn-sm"
              pendingLabel="Allocating…"
              confirm={`Give all ${missing} unallocated line items two assessors each? You can remove any of them afterwards.`}
            >
              Allocate the rest
            </SubmitButton>
          </form>
        )}
      </div>

      {state.status === "error" && (
        <div className="mt-3">
          <FormError message={state.message} />
        </div>
      )}
      {state.status === "ok" && (
        <p className="mt-3 rounded-lg bg-status-green-bg px-3 py-2 text-sm text-status-green-fg">
          {state.message}
        </p>
      )}
    </div>
  );
}
