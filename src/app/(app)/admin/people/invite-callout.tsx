"use client";

import { useState } from "react";

export type Invite = {
  url: string;
  qrSvg: string;
  email: string;
  expiresAt: string;
};

/**
 * Shows a freshly issued sign-in link once, with a QR code so a coach standing
 * in front of you can scan it. The token is single-use and never stored in
 * readable form — navigate away and you simply issue another.
 */
export function InviteCallout({ invite, message }: { invite: Invite; message?: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the link is selectable on screen.
    }
  }

  const expires = new Date(invite.expiresAt);

  return (
    <div className="space-y-3 rounded-lg border border-maroon-200 bg-maroon-50 px-3 py-3">
      {message && <p className="text-sm text-maroon-800">{message}</p>}

      <div className="rounded bg-white px-2 py-2">
        <p className="font-mono text-xs break-all text-ink-800">{invite.url}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn-secondary btn-sm">
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="btn-secondary btn-sm"
        >
          {showQr ? "Hide QR code" : "Show QR code"}
        </button>
      </div>

      {showQr && (
        <div
          className="w-fit rounded bg-white p-2 [&>svg]:h-44 [&>svg]:w-44"
          // Generated server-side by the qrcode package from a URL we just built.
          dangerouslySetInnerHTML={{ __html: invite.qrSvg }}
        />
      )}

      <p className="text-xs text-maroon-700">
        Send it to {invite.email} however you like — text, Slack, or hold up the QR code. Works
        once, and expires{" "}
        {expires.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
      </p>
    </div>
  );
}
