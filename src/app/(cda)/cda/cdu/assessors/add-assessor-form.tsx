"use client";

import { useActionState, useState } from "react";
import { InviteCallout } from "@/app/(app)/admin/people/invite-callout";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
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

        <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
          Add assessor
        </SubmitButton>
      </form>

      {state.status === "ok" && state.invite && (
        <InviteCallout invite={state.invite} message={state.message} />
      )}
    </div>
  );
}
