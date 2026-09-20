import { PageHeader } from "@/components/ui";

/**
 * What stands in for the board while it is being built.
 *
 * This covers arriving at the leaderboard, not changing a filter on it: Next
 * re-renders the page rather than remounting it when only the search
 * parameters change, so this boundary fires once and the filters have to
 * report their own progress. `PendingLink` does that.
 *
 * It earns its place twice over, though. A route with a loading boundary is
 * one Next will prefetch as far as the boundary, so the skeleton is already in
 * the browser when the nav link is clicked rather than being fetched after it.
 *
 * Shaped like the real thing — four tiles, a filter row, a table — because a
 * skeleton that doesn't match is a second layout shift a moment after the
 * first.
 */
export default function LoadingBoard() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the leaderboard</span>
      <PageHeader title="Leaderboard" subtitle="Working out where every club stands…" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card card-pad">
            <Bar className="h-3 w-24" />
            <Bar className="mt-3 h-7 w-16" />
            <Bar className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[64, 88, 72, 80].map((w, i) => (
          <Bar key={i} className="h-8 rounded-lg" style={{ width: w }} />
        ))}
      </div>

      <div className="card divide-y divide-ink-100">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Bar className="h-4 w-4" />
            <Bar className="h-4 flex-1 max-w-56" />
            <Bar className="hidden h-4 w-20 sm:block" />
            <Bar className="hidden h-4 w-16 md:block" />
            <Bar className="hidden h-4 w-16 lg:block" />
            <Bar className="hidden h-4 w-16 lg:block" />
            <Bar className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One grey block. `animate-pulse` rather than a spinner: there are many. */
function Bar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded bg-ink-200 ${className}`} style={style} />;
}
