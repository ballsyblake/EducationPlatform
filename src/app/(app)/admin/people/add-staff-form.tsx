"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { addStaffMember, type PeopleFormState } from "../actions/people";
import { TempPasswordCallout } from "./temp-password-callout";

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
        <p className="hint">This is the address they&apos;ll sign in with.</p>
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

      <div>
        <label className="label" htmlFor="staff-password">
          Starting password
        </label>
        <input
          id="staff-password"
          name="password"
          type="text"
          autoComplete="off"
          placeholder="Leave blank to generate one"
          className="input"
        />
        <p className="hint">
          They&apos;ll be asked to change it the first time they sign in.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-chalk-700">
        <input type="checkbox" name="sendInvite" className="accent-field-600" />
        Also email them a sign-in link
      </label>

      <FormError message={state.status === "error" ? state.message : null} />

      {state.status === "ok" && state.tempPassword && (
        <TempPasswordCallout
          password={state.tempPassword}
          email={state.tempPasswordFor ?? "them"}
          message={state.message}
        />
      )}

      {state.status === "ok" && state.devLink && (
        <div className="space-y-1 rounded-lg bg-chalk-100 px-3 py-2">
          <p className="text-xs font-semibold tracking-wide text-chalk-600 uppercase">
            Dev mode — no SMTP configured
          </p>
          <Link href={state.devLink} className="block truncate text-xs underline">
            {state.devLink}
          </Link>
        </div>
      )}

      <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
        Add to staff
      </SubmitButton>
    </form>
  );
}
