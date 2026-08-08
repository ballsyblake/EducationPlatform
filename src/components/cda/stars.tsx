import { MAX_STARS, starLabel } from "@/lib/cda/rubric";

/**
 * A 0–3 star rating, for display.
 *
 * Never interactive: assessors don't award stars directly, they tick evidence
 * points and the count decides the band. Making these clickable anywhere would
 * quietly reintroduce the gut-feel scoring the rubric exists to replace.
 */
export function Stars({
  value,
  size = "md",
  showLabel = false,
}: {
  value: number | null;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  if (value === null) {
    return <span className="text-xs text-ink-400">Not scored</span>;
  }

  const dimension = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${value} of ${MAX_STARS} — ${starLabel(value)}`}
    >
      <span className="inline-flex gap-0.5" role="img" aria-label={`${value} of ${MAX_STARS} stars`}>
        {Array.from({ length: MAX_STARS }, (_, i) => (
          <StarGlyph key={i} filled={i < value} className={dimension} />
        ))}
      </span>
      {showLabel && (
        <span className={`${size === "sm" ? "text-xs" : "text-sm"} text-ink-600`}>
          {starLabel(value)}
        </span>
      )}
    </span>
  );
}

function StarGlyph({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`${className} ${filled ? "text-maroon-600" : "text-ink-200"}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5Z" />
    </svg>
  );
}

/**
 * The star bands for a criterion, shown to assessors so the threshold they are
 * working towards is never a mystery.
 */
export function StarScale({
  oneStarAt,
  twoStarAt,
  threeStarAt,
  total,
  met,
}: {
  oneStarAt: number;
  twoStarAt: number;
  threeStarAt: number;
  total: number;
  met: number;
}) {
  const bands = [
    { stars: 1, at: oneStarAt },
    { stars: 2, at: twoStarAt },
    { stars: 3, at: threeStarAt },
  ];

  return (
    <p className="text-xs text-ink-500">
      {met} of {total} evidence points met.{" "}
      {bands
        .map((b) => `${b.at}+ → ${b.stars} star${b.stars === 1 ? "" : "s"}`)
        .join(" · ")}
    </p>
  );
}
