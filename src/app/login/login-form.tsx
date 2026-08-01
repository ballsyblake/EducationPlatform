"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendLoginLink, type LoginFormState } from "./actions";

const initialState: LoginFormState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Sending…" : "Email me a sign-in link"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(sendLoginLink, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Staff email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="coach@yourprogram.com"
            className="input"
          />
          <p className="hint">
            No password needed. We&apos;ll send a link that signs you in for 30 days.
          </p>
        </div>
        <SubmitButton />
      </form>

      {state.status === "error" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>
      )}

      {state.status === "sent" && (
        <div className="space-y-3 rounded-lg bg-field-50 px-3 py-3 text-sm text-field-800">
          <p>{state.message}</p>
          {state.devLink && (
            <div className="space-y-2 border-t border-field-200 pt-3">
              <p className="text-xs font-semibold tracking-wide text-field-700 uppercase">
                Dev mode — no SMTP configured
              </p>
              <Link href={state.devLink} className="btn-secondary btn-sm w-full">
                Open sign-in link
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
