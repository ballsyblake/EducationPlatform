"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { addStaffMember, type PeopleFormState } from "../actions/people";

const initialState: PeopleFormState = { status: "idle" };

export function AddStaffForm() {
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
        <p className="hint">This is how they sign in — no password is ever created.</p>
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

      <label className="flex items-center gap-2 text-sm text-chalk-700">
        <input type="checkbox" name="sendInvite" defaultChecked className="accent-field-600" />
        Email them a sign-in link now
      </label>

      <FormError message={state.status === "error" ? state.message : null} />

      {state.status === "ok" && (
        <div className="space-y-2 rounded-lg bg-field-50 px-3 py-3 text-sm text-field-800">
          <p>{state.message}</p>
          {state.devLink && (
            <>
              <p className="text-xs font-semibold tracking-wide text-field-700 uppercase">
                Dev mode — no SMTP configured
              </p>
              <Link href={state.devLink} className="block truncate text-xs underline">
                {state.devLink}
              </Link>
            </>
          )}
        </div>
      )}

      <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
        Add to staff
      </SubmitButton>
    </form>
  );
}
