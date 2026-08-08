"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { submitScoring, type AssessFormState } from "../actions";

const initialState: AssessFormState = { status: "idle" };

export function SubmitScoring({
  assessmentId,
  scored,
  total,
  submittedAt,
  editable,
}: {
  assessmentId: string;
  scored: number;
  total: number;
  submittedAt: Date | null;
  editable: boolean;
}) {
  const [state, formAction] = useActionState(submitScoring, initialState);

  if (submittedAt) {
    return (
      <div className="card card-pad">
        <h2 className="mb-1 font-semibold text-ink-900">Submitted</h2>
        <p className="text-sm text-ink-600">
          Your scoring is with the Club Development Unit. If something needs changing, ask them to
          reopen it.
        </p>
      </div>
    );
  }

  const remaining = total - scored;

  return (
    <div className="card card-pad">
      <h2 className="mb-1 font-semibold text-ink-900">Submit your scoring</h2>
      <p className="mb-3 text-sm text-ink-600">
        {remaining > 0
          ? `${remaining} criteri${remaining === 1 ? "on" : "a"} still to score.`
          : "Every criterion is scored. Submitting sends your assessment to the Club Development Unit."}
      </p>

      <form action={formAction}>
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <SubmitButton
          className="btn-primary w-full"
          pendingLabel="Submitting…"
          disabled={!editable || remaining > 0}
          confirm="Submit your scoring? You won't be able to change it afterwards."
        >
          Submit scoring
        </SubmitButton>
      </form>

      <div className="mt-3 space-y-2">
        {state.status === "error" && <FormError message={state.message} />}
        {state.status === "ok" && <FormSuccess message={state.message} />}
      </div>
    </div>
  );
}
