"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { setPoolRetained, type CduFormState } from "../../actions";

const initial: CduFormState = { status: "idle" };

/**
 * How this pool was assessed, which is the one thing about harmonisation the
 * portal cannot work out for itself.
 *
 * A retained Planning score and a freshly assessed one are identical in the
 * data — same criteria, same stars, same reconciliation — so the only way the
 * board can know which it is looking at is for the Unit to say. Everything
 * that follows from it is arithmetic.
 *
 * Deliberately a statement of fact rather than a switch labelled "harmonise":
 * the Unit is recording how the season ran, not choosing a scoring method for
 * a pool it likes the look of.
 */
export function RetainedToggle({
  poolId,
  retained,
  published,
}: {
  poolId: string;
  retained: boolean;
  /** Clubs here whose rating is already out — their board place would move. */
  published: number;
}) {
  const [state, formAction] = useActionState(setPoolRetained, initial);

  return (
    <div className="card card-pad">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-ink-900">How this pool was assessed</h2>
        <Badge tone={retained ? "warn" : "muted"}>
          {retained ? "Evidence retained" : "Assessed fresh"}
        </Badge>
      </div>

      <p className="mb-3 text-sm text-ink-600">
        {retained
          ? "Planning was carried over from last season rather than read again, so these clubs are placed on a score pooled across both seasons — every point scored across the two over every point available."
          : "Everything was assessed this season, so these clubs are placed on this season's score alone."}
      </p>

      <form action={formAction}>
        <input type="hidden" name="poolId" value={poolId} />
        <input type="hidden" name="retained" value={retained ? "false" : "true"} />
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
          {retained ? "Assessed fresh this season" : "Planning retained from last season"}
        </SubmitButton>
      </form>

      {/* Changeable after a rating is published, unlike most things here,
          because it changes no rating: the percentage, shield and report are
          the same either way and only the board placement moves. Saying which
          clubs that touches is the honest version of the warning a refusal
          would have been. */}
      {published > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          {published} club{published === 1 ? "" : "s"} here {published === 1 ? "has" : "have"} a
          published rating. Changing this leaves those ratings exactly as issued — it moves where
          they sit on the leaderboard, and so which league band their rank falls in.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {state.status === "error" && <FormError message={state.message} />}
        {state.status === "ok" && <FormSuccess message={state.message} />}
      </div>
    </div>
  );
}
