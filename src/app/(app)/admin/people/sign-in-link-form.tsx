"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createSignInLink, type PeopleFormState } from "../actions/people";
import { InviteCallout } from "./invite-callout";

const initialState: PeopleFormState = { status: "idle" };

export function SignInLinkForm({ userId, disabled }: { userId: string; disabled?: boolean }) {
  const [state, formAction] = useActionState(createSignInLink, initialState);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Creating…" disabled={disabled}>
          Get sign-in link
        </SubmitButton>
      </form>

      {state.status === "error" && <p className="text-xs text-maroon-700">{state.message}</p>}
      {state.status === "ok" && state.invite && (
        <div className="w-full max-w-md">
          <InviteCallout invite={state.invite} />
        </div>
      )}
    </div>
  );
}
