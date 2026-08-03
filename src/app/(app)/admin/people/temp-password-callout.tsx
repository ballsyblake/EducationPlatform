"use client";

import { useState } from "react";

/**
 * Shows a freshly issued password once. It's only ever held in this component's
 * props — nothing plain-text is stored, so if the admin navigates away it can't
 * be recovered and they have to issue a new one.
 */
export function TempPasswordCallout({
  password,
  email,
  message,
}: {
  password: string;
  email: string;
  message?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the password is on screen regardless.
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-field-200 bg-field-50 px-3 py-3">
      {message && <p className="text-sm text-field-800">{message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-white px-2 py-1 font-mono text-sm font-semibold text-chalk-900">
          {password}
        </code>
        <button type="button" onClick={copy} className="btn-secondary btn-sm">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="text-xs text-field-700">
        Shown once. Send it to {email} however you like — text, Slack, or in person.
      </p>
    </div>
  );
}
