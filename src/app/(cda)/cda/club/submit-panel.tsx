"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { submitAssessment, type ClubFormState } from "./actions";

const initialState: ClubFormState = { status: "idle" };

export function SubmitPanel({
  canSubmit,
  ready,
  outstanding,
}: {
  canSubmit: boolean;
  ready: boolean;
  outstanding: number;
}) {
  const [state, formAction] = useActionState(submitAssessment, initialState);

  if (!canSubmit) {
    return (
      <div className="card card-pad">
        <h2 className="mb-1 font-semibold text-ink-900">Submitted</h2>
        <p className="text-sm text-ink-600">
          Your submission is with Football Queensland. If something needs correcting, contact the
          Club Development Unit and they can reopen it.
        </p>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h2 className="mb-1 font-semibold text-ink-900">Submit to Football Queensland</h2>
      <p className="mb-3 text-sm text-ink-600">
        Once submitted, your staff register and declarations are locked and assessors begin their
        review.
      </p>

      {!ready && (
        <p className="mb-3 text-sm text-ink-500">
          {outstanding > 0
            ? `${outstanding} Non-Negotiable${outstanding === 1 ? "" : "s"} still to answer.`
            : "Add your technical staff first."}
        </p>
      )}

      <form action={formAction}>
        <SubmitButton
          className="btn-primary w-full"
          pendingLabel="Submitting…"
          disabled={!ready}
          confirm="Submit to Football Queensland? You won't be able to edit afterwards."
        >
          Submit assessment
        </SubmitButton>
      </form>

      <div className="mt-3 space-y-2">
        {state.status === "error" && <FormError message={state.message} />}
        {state.status === "ok" && <FormSuccess message={state.message} />}
      </div>
    </div>
  );
}
