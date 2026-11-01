"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  sendLoginLink,
  signInWithAdminPassword,
  type LoginFormState,
  type PasswordFormState,
} from "./actions";

// Both initial states are declared here rather than alongside the actions: a
// `"use server"` module may only export async functions, and a plain object
// exported from one fails at module evaluation and takes this page with it.
const initialState: LoginFormState = { status: "idle" };
const initialPasswordState: PasswordFormState = { status: "idle", attempt: 0 };

export function LoginForm({
  emailEnabled,
  passwordEnabled,
}: {
  emailEnabled: boolean;
  passwordEnabled: boolean;
}) {
  // With no mail server and no admin password there is nothing either form can
  // do: a link would only reach the server log. Say so instead of pretending.
  if (!emailEnabled && !passwordEnabled) {
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
    <div className="space-y-6">
      {passwordEnabled && <PasswordForm />}

      {passwordEnabled && emailEnabled && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-200" />
          <span className="text-xs tracking-wide text-ink-500 uppercase">or</span>
          <span className="h-px flex-1 bg-ink-200" />
        </div>
      )}

      {emailEnabled && <MagicLinkForm compact={passwordEnabled} />}
    </div>
  );
}

function PasswordForm() {
  const [state, formAction] = useActionState(signInWithAdminPassword, initialPasswordState);

  // Controlled, because React 19 resets an uncontrolled form once the action
  // settles and a refused sign-in would otherwise clear the address too — which
  // means retyping it on every typo in the password. See the note in CLAUDE.md.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="admin-email">
          Email address
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          placeholder="you@yourprogram.com"
          className="input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="admin-password">
          Password
        </label>
        {/*
          Keyed on the attempt count so the field is a fresh node after every
          refused sign-in. The password is deliberately *not* controlled — it
          should be cleared on a failure — and remounting is what guarantees the
          DOM is actually empty rather than holding a value React has forgotten.
        */}
        <input
          key={state.attempt}
          id="admin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>

      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>

      {state.status === "error" && (
        <p className="rounded-lg bg-maroon-50 px-3 py-2 text-sm text-maroon-700">{state.message}</p>
      )}
    </form>
  );
}

function MagicLinkForm({ compact }: { compact: boolean }) {
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
            autoFocus={!compact}
            placeholder="coach@yourprogram.com"
            className="input"
          />
          <p className="hint">
            No password needed. We&apos;ll send a link that signs you in and keeps you signed in.
          </p>
        </div>

        <SubmitButton
          className={compact ? "btn-secondary w-full" : "btn-primary w-full"}
          pendingLabel="Sending…"
        >
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
