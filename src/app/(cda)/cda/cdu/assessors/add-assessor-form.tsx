"use client";

import { useActionState, useState } from "react";
import { InviteCallout } from "@/app/(app)/admin/people/invite-callout";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { addPortalUser, type CduFormState } from "../actions";

const initialState: CduFormState = { status: "idle" };

export function AddAssessorForm() {
  const [state, formAction] = useActionState(addPortalUser, initialState);
  const [values, setValues] = useState({ name: "", email: "", title: "" });

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="role" value="ASSESSOR" />

        <div>
          <label className="label" htmlFor="assessor-name">
            Name
          </label>
          <input
            id="assessor-name"
            name="name"
            className="input"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            placeholder="Full name"
          />
        </div>

        <div>
          <label className="label" htmlFor="assessor-email">
            Email
          </label>
          <input
            id="assessor-email"
            name="email"
            type="email"
            className="input"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            placeholder="name@fq.com.au"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="assessor-title">
            Title <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id="assessor-title"
            name="title"
            className="input"
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            placeholder="Club Development Assessor"
          />
        </div>

        {state.status === "error" && <FormError message={state.message} />}
        {/* A Club Development Unit account joining the pool gets no sign-in
            link — it already has a way in — so without this the form succeeded
            in silence and looked like it had done nothing. */}
        {state.status === "ok" && !state.invite && <FormSuccess message={state.message} />}

        <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
          Add assessor
        </SubmitButton>

        <p className="hint">
          A Club Development Unit address works here too — it joins the assessor pool and keeps its
          own sign-in.
        </p>
      </form>

      {state.status === "ok" && state.invite && (
        <InviteCallout invite={state.invite} message={state.message} />
      )}
    </div>
  );
}
