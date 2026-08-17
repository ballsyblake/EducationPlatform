"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { setAssesses, type CduFormState } from "../actions";

const initial: CduFormState = { status: "idle" };

/**
 * Takes a Club Development Unit account out of the assessor pool.
 *
 * Its own control rather than the Deactivate button the other rows carry: that
 * button switches off an account, and switching off a colleague's CDU login
 * from the assessors list would be an unpleasant surprise. This ends only their
 * standing to hold line items.
 */
export function RemoveFromPool({ userId, name }: { userId: string; name: string }) {
  const [state, formAction] = useActionState(setAssesses, initial);

  return (
    <div className="text-right">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="assesses" value="false" />
        <SubmitButton
          className="btn-secondary btn-sm"
          pendingLabel="…"
          confirm={`Take ${name} out of the assessor pool? Their Club Development Unit account is untouched.`}
        >
          Remove from pool
        </SubmitButton>
      </form>
      {state.status === "error" && (
        <div className="mt-2 max-w-xs">
          <FormError message={state.message} />
        </div>
      )}
    </div>
  );
}
