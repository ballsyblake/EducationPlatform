"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { setRefreshedCriteria, type CduFormState } from "../../actions";

const initial: CduFormState = { status: "idle" };

export type RefreshableItem = {
  id: string;
  code: string;
  title: string;
  domain: string;
  /** Points this item is worth — what comes out of the pooling if it's ticked. */
  points: number;
  refreshed: boolean;
};

/**
 * The "+5": items a retained pool read again from scratch.
 *
 * Football Queensland's cycle table says "Retained +5", not "Retained". A
 * retained pool still has a handful of items assessed properly, and those carry
 * a finding that replaces last season's rather than one to be averaged with it
 * — averaging them would hold a club to evidence its own re-assessment has
 * already superseded, which is the one outcome harmonisation exists to avoid.
 *
 * The whole set posts at once and replaces what was there, because an unticked
 * box has to be able to mean "not this one".
 */
export function RefreshedItems({
  poolId,
  items,
  priorYear,
}: {
  poolId: string;
  items: RefreshableItem[];
  priorYear?: number;
}) {
  const [state, formAction] = useActionState(setRefreshedCriteria, initial);
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.refreshed).map((i) => i.id)),
  );

  const points = items.filter((i) => ticked.has(i.id)).reduce((n, i) => n + i.points, 0);
  const total = items.reduce((n, i) => n + i.points, 0);

  return (
    <form action={formAction} className="card card-pad">
      <input type="hidden" name="poolId" value={poolId} />

      <h2 className="mb-1 font-semibold text-ink-900">Read again anyway</h2>
      <p className="mb-3 text-sm text-ink-600">
        The items this pool assessed from scratch despite carrying the rest over. These count at
        what they scored this season — they are held out of the pooling on both sides, so a club
        that fixed one of them is not averaged back towards
        {priorYear ? ` ${priorYear}` : " last season"}.
      </p>

      <p className="mb-3 text-xs text-ink-500">
        {ticked.size} of {items.length} items · {points} of {total}{" "}
        points counted at this season&apos;s score
      </p>

      <ul className="mb-3 max-h-80 space-y-1 overflow-y-auto pr-1">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-50">
              <input
                type="checkbox"
                name="criterionId"
                value={i.id}
                checked={ticked.has(i.id)}
                onChange={(e) =>
                  setTicked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(i.id);
                    else next.delete(i.id);
                    return next;
                  })
                }
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="text-xs font-semibold tracking-wide text-ink-400">{i.code}</span>{" "}
                <span className="text-ink-800">{i.title}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink-400">{i.points}</span>
            </label>
          </li>
        ))}
      </ul>

      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
        Save what was read again
      </SubmitButton>

      <div className="mt-3 space-y-2">
        {state.status === "error" && <FormError message={state.message} />}
        {state.status === "ok" && <FormSuccess message={state.message} />}
      </div>
    </form>
  );
}
