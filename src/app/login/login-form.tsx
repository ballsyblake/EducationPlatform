"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { sendLoginLink, signIn, type LoginFormState } from "./actions";

const initialState: LoginFormState = { status: "idle" };

export function LoginForm({ magicLinkEnabled }: { magicLinkEnabled: boolean }) {
  const [mode, setMode] = useState<"password" | "link">("password");

  return mode === "password" ? (
    <PasswordForm onSwitch={magicLinkEnabled ? () => setMode("link") : undefined} />
  ) : (
    <MagicLinkForm onSwitch={() => setMode("password")} />
  );
}

function PasswordForm({ onSwitch }: { onSwitch?: () => void }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
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
          autoComplete="username"
          autoFocus
          placeholder="coach@yourprogram.com"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
        <p className="hint">Your coordinator gives you this when they set up your account.</p>
      </div>

      {state.status === "error" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>
      )}

      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>

      {onSwitch && (
        <button
          type="button"
          onClick={onSwitch}
          className="w-full text-center text-sm font-medium text-field-700 hover:underline"
        >
          Email me a sign-in link instead
        </button>
      )}
    </form>
  );
}

function MagicLinkForm({ onSwitch }: { onSwitch: () => void }) {
  const [state, formAction] = useActionState(sendLoginLink, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="link-email">
            Staff email address
          </label>
          <input
            id="link-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="coach@yourprogram.com"
            className="input"
          />
          <p className="hint">We&apos;ll send a link that signs you in for 30 days.</p>
        </div>

        <SubmitButton className="btn-primary w-full" pendingLabel="Sending…">
          Email me a sign-in link
        </SubmitButton>
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

      <button
        type="button"
        onClick={onSwitch}
        className="w-full text-center text-sm font-medium text-field-700 hover:underline"
      >
        Use a password instead
      </button>
    </div>
  );
}
