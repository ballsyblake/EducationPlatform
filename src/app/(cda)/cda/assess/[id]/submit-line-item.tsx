"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { submitAssignment, type AssessFormState } from "../actions";

const initialState: AssessFormState = { status: "idle" };

export function SubmitLineItem({
  assignmentId,
  code,
  scored,
  total,
  submittedAt,
}: {
  assignmentId: string;
  code: string;
  scored: number;
  total: number;
  submittedAt: Date | null;
}) {
  const [state, formAction] = useActionState(submitAssignment, initialState);

  if (submittedAt) {
    return (
      <div className="card card-pad">
        <h2 className="mb-1 font-semibold text-ink-900">Submitted</h2>
        <p className="text-sm text-ink-600">
          {code} is with the Club Assessment Unit for every club in this pool. Ask them to reopen it
          if something needs changing.
        </p>
      </div>
    );
  }

  const remaining = total - scored;

  return (
    <div className="card card-pad">
      <h2 className="mb-1 font-semibold text-ink-900">Submit {code}</h2>
      <p className="mb-3 text-sm text-ink-600">
        {remaining > 0
          ? `${remaining} club${remaining === 1 ? "" : "s"} still to score.`
          : "Every club in the pool is scored. Submitting sends this line item to the Club Assessment Unit."}
      </p>

      <form action={formAction}>
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <SubmitButton
          className="btn-primary w-full"
          pendingLabel="Submitting…"
          disabled={remaining > 0}
          confirm={`Submit ${code} for all ${total} clubs? You won't be able to change it afterwards.`}
        >
          Submit line item
        </SubmitButton>
      </form>

      <div className="mt-3 space-y-2">
        {state.status === "error" && <FormError message={state.message} />}
        {state.status === "ok" && <FormSuccess message={state.message} />}
      </div>
    </div>
  );
}
