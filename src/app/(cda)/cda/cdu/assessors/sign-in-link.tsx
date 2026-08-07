"use client";

import { useActionState } from "react";
import { InviteCallout } from "@/app/(app)/admin/people/invite-callout";
import { SubmitButton } from "@/components/submit-button";
import { issueSignInLink, type CduFormState } from "../actions";

const initialState: CduFormState = { status: "idle" };

/**
 * Issues a fresh sign-in link for a portal account, shown once with a QR code.
 *
 * Same shape as the coach-education staff page: no passwords anywhere, so a
 * club administrator who has lost their link gets a new one handed over rather
 * than a reset flow that would need a working mail server.
 */
export function SignInLink({ userId, disabled }: { userId: string; disabled?: boolean }) {
  const [state, formAction] = useActionState(issueSignInLink, initialState);

  return (
    <span className="inline-block">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="…" disabled={disabled}>
          Sign-in link
        </SubmitButton>
      </form>

      {state.status === "error" && <p className="text-xs text-maroon-700">{state.message}</p>}
      {state.status === "ok" && state.invite && (
        <div className="mt-2 w-full max-w-md">
          <InviteCallout invite={state.invite} />
        </div>
      )}
    </span>
  );
}
