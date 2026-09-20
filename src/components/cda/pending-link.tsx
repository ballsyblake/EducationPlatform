"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * A link that says it is working.
 *
 * Every control on the leaderboard — the cycle, the score basis, the view, the
 * tier and zone filters, the sortable column heads — is a link to the same page
 * with different search parameters, and each one costs a server round trip:
 * the board reads eleven tables and recomputes every club's rating before it
 * can answer. On a hosted database that is long enough for a click to feel
 * ignored, and the second click that follows is a second round trip for a
 * result the first one was already fetching.
 *
 * Next re-renders the page rather than remounting it when only the search
 * parameters change, so the route's own loading boundary — which does cover
 * arriving at the board — never fires for a filter. The feedback has to come
 * from the control that was clicked, which is what `useLinkStatus` is for.
 */
export function PendingLink({
  children,
  className = "",
  ...rest
}: ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link {...rest} className={`relative ${className}`}>
      <Pending>{children}</Pending>
    </Link>
  );
}

/**
 * The label, swapped for a spinner while its own link is in flight.
 *
 * `useLinkStatus` only reports the link it is rendered inside, which is the
 * behaviour wanted here: clicking Tier 2 should spin Tier 2, not every chip in
 * the row. It has to be its own component because the hook reads the Link above
 * it in the tree.
 *
 * The label is hidden rather than removed and the spinner is laid over it, so
 * the chip keeps its width. A row of filters that reflows the instant one is
 * clicked moves the next chip out from under the cursor.
 */
function Pending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span className={pending ? "invisible" : undefined}>{children}</span>
      {pending && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <Spinner />
          <span className="sr-only">Loading</span>
        </span>
      )}
    </>
  );
}

/** Deliberately currentColor: this rides on chips of several backgrounds. */
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
