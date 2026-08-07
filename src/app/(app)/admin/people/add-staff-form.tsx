"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { addStaffMember, type PeopleFormState } from "../actions/people";
import { InviteCallout } from "./invite-callout";

const initialState: PeopleFormState = { status: "idle" };

export function AddStaffForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, formAction] = useActionState(addStaffMember, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="staff-email">
          Email address
        </label>
        <input
          id="staff-email"
          name="email"
          type="email"
          required
          placeholder="coach@yourprogram.com"
          className="input"
        />
        <p className="hint">This identifies their account. No password is ever created.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="staff-name">
            Name
          </label>
          <input id="staff-name" name="name" placeholder="Marcus Webb" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="staff-title">
            Role on staff
          </label>
          <input
            id="staff-title"
            name="title"
            placeholder="Defensive Coordinator"
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="staff-role">
          Permissions
        </label>
        <select id="staff-role" name="role" className="input">
          <option value="COACH">Coach — completes assigned work</option>
          <option value="ADMIN">Admin — creates courses and grades</option>
        </select>
      </div>

      {emailEnabled && (
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="sendEmail" className="accent-maroon-600" />
          Email the link instead of showing it here
        </label>
      )}

      <FormError message={state.status === "error" ? state.message : null} />

      {state.status === "ok" &&
        (state.invite ? (
          <InviteCallout invite={state.invite} message={state.message} />
        ) : (
          <p className="rounded-lg bg-maroon-50 px-3 py-2 text-sm text-maroon-800">{state.message}</p>
        ))}

      <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
        Add to staff
      </SubmitButton>
    </form>
  );
}
