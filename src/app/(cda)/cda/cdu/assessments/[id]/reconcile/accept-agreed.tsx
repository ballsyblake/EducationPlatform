"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { acceptAgreed, type CduFormState } from "../../../actions";

const initialState: CduFormState = { status: "idle" };

export function AcceptAgreed({
  assessmentId,
  count,
  partial,
}: {
  assessmentId: string;
  count: number;
  /** Criteria only one assessor has scored, which this deliberately skips. */
  partial: number;
}) {
  const [state, formAction] = useActionState(acceptAgreed, initialState);

  return (
    <div className="card card-pad">
      <h2 className="mb-1 font-semibold text-ink-900">Accept what&apos;s agreed</h2>
      <p className="mb-3 text-sm text-ink-600">
        {count > 0
          ? `${count} criteri${count === 1 ? "on has" : "a have"} the same rating from every assessor. Accepting them leaves you with only the ones that are actually split.`
          : "Every criterion the assessors agreed on has already been resolved."}
      </p>

      {partial > 0 && (
        <p className="mb-3 text-sm text-ink-600">
          {partial} more {partial === 1 ? "is" : "are"} still waiting on another assessor&apos;s
          score. One rating on its own reads as agreed because there is nothing to disagree with,
          so {partial === 1 ? "it is" : "they are"} left for you to resolve one at a time.
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <SubmitButton className="btn-primary w-full" pendingLabel="Accepting…" disabled={count === 0}>
          Accept {count} agreed
        </SubmitButton>
      </form>

      <div className="mt-3 space-y-2">
        {state.status === "error" && <FormError message={state.message} />}
        {state.status === "ok" && <FormSuccess message={state.message} />}
      </div>
    </div>
  );
}
