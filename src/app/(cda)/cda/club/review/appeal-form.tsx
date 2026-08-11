"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { APPEAL_RESPONSE_WORKING_DAYS } from "@/lib/cda/review";
import { submitAppeal, type ClubFormState } from "../actions";

const initialState: ClubFormState = { status: "idle" };

/**
 * The last step Football Queensland's process offers.
 *
 * Stated plainly, because it is: after the CEO rules there is nowhere further
 * to go, and a club that appeals without knowing that has spent its final move
 * on a first draft.
 */
export function AppealForm() {
  const [state, formAction] = useActionState(submitAppeal, initialState);
  const [appeal, setAppeal] = useState("");

  if (state.status === "ok") return <FormSuccess message={state.message} />;

  return (
    <form action={formAction} className="mt-6 card card-pad space-y-3">
      <div>
        <h2 className="font-semibold text-ink-900">Appeal to the CEO</h2>
        <p className="mt-1 text-sm text-ink-600">
          If you disagree with the outcome of your review, you can appeal to the Chief Executive of
          Football Queensland. The CEO has {APPEAL_RESPONSE_WORKING_DAYS} working days to respond
          and either revise or preserve the score. That decision is final — it exhausts every review
          opportunity in the process.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="appeal">
          Grounds for your appeal
        </label>
        <textarea
          id="appeal"
          name="appeal"
          rows={5}
          className="input"
          value={appeal}
          onChange={(e) => setAppeal(e.target.value)}
          placeholder="Which items, and why you believe the Unit's response didn't address the evidence you provided."
        />
      </div>

      {state.status === "error" && <FormError message={state.message} />}

      <SubmitButton
        className="btn-primary"
        pendingLabel="Sending…"
        confirm="Send this appeal to the CEO? The decision is final and ends the review process."
      >
        Send appeal
      </SubmitButton>
    </form>
  );
}
