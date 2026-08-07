"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { sendLoginLink, type LoginFormState } from "./actions";

const initialState: LoginFormState = { status: "idle" };

export function LoginForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, formAction] = useActionState(sendLoginLink, initialState);

  // With no mail server there is nothing this form can do for a coach: the link
  // would only reach the server log. Say so instead of pretending to send.
  if (!emailEnabled) {
    return (
      <div className="space-y-3 text-sm text-ink-600">
        <p className="font-medium text-ink-800">Ask your coordinator for a sign-in link.</p>
        <p>
          This program hands out sign-in links directly rather than by email. Your coordinator can
          send you one from the staff page — it opens the app on any device and keeps you signed in.
        </p>
      </div>
    );
  }

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
            No password needed. We&apos;ll send a link that signs you in and keeps you signed in.
          </p>
        </div>

        <SubmitButton className="btn-primary w-full" pendingLabel="Sending…">
          Email me a sign-in link
        </SubmitButton>
      </form>

      {state.status === "error" && (
        <p className="rounded-lg bg-maroon-50 px-3 py-2 text-sm text-maroon-700">{state.message}</p>
      )}

      {state.status === "sent" && (
        <div className="space-y-3 rounded-lg bg-maroon-50 px-3 py-3 text-sm text-maroon-800">
          <p>{state.message}</p>
          {state.devLink && (
            <div className="space-y-2 border-t border-maroon-200 pt-3">
              <p className="text-xs font-semibold tracking-wide text-maroon-700 uppercase">
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
