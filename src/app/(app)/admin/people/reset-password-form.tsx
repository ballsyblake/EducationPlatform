"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { resetPassword, type PeopleFormState } from "../actions/people";
import { TempPasswordCallout } from "./temp-password-callout";

const initialState: PeopleFormState = { status: "idle" };

export function ResetPasswordForm({ userId, label }: { userId: string; label: string }) {
  const [state, formAction] = useActionState(resetPassword, initialState);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton
          className="btn-secondary btn-sm"
          pendingLabel="Resetting…"
          confirm={`Issue a new password for ${label}? They'll be signed out everywhere.`}
        >
          Reset password
        </SubmitButton>
      </form>

      {state.status === "error" && <p className="text-xs text-red-700">{state.message}</p>}
      {state.status === "ok" && state.tempPassword && (
        <TempPasswordCallout
          password={state.tempPassword}
          email={state.tempPasswordFor ?? label}
          message={state.message}
        />
      )}
    </div>
  );
}
