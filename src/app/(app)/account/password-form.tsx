"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { changePassword, type AccountState } from "./actions";

const initialState: AccountState = { status: "idle" };

export function PasswordForm({ requireCurrent }: { requireCurrent: boolean }) {
  const [state, formAction] = useActionState(changePassword, initialState);

  // React resets an uncontrolled form once its action settles, which would wipe
  // every field on a rejected attempt and make the coach retype from scratch.
  // Controlling them keeps what was typed and clears only on success.
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (state.status === "ok") {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {requireCurrent && (
        <div>
          <label className="label" htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input"
          />
        </div>
      )}

      <div>
        <label className="label" htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="input"
        />
        <p className="hint">At least 10 characters. A short phrase works well.</p>
      </div>

      <div>
        <label className="label" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
        />
      </div>

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />

      <SubmitButton pendingLabel="Saving…">Update password</SubmitButton>
    </form>
  );
}
