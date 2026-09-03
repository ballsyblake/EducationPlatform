/**
 * A year-on-year change, in the one form it should always take.
 *
 * Three rules, and they are the reason this is a component rather than a
 * template repeated down a table:
 *
 *   1. A change of nothing is not an improvement. Zero reads grey and flat, not
 *      green with a plus sign in front of it.
 *   2. No comparison is not a change of zero. A club with no result last season
 *      gets an em dash, never "0.0" — the two mean opposite things and a board
 *      full of confident zeroes would be read as "nobody moved".
 *   3. Direction is carried by the arrow as well as the colour, so it survives
 *      being printed, and read by anyone who doesn't separate red from green.
 */
export function Delta({
  value,
  digits = 1,
  suffix = "",
  size = "sm",
}: {
  /** Null when there is nothing to compare against. */
  value: number | null;
  digits?: number;
  suffix?: string;
  size?: "sm" | "md";
}) {
  const text = size === "sm" ? "text-xs" : "text-sm";

  if (value === null) {
    return (
      <span className={`${text} text-ink-300`} title="No comparable result last cycle">
        —
      </span>
    );
  }

  // Rounded before it is judged, so a change of +0.04 doesn't render as a green
  // "+0.0". What the reader sees and what the colour claims have to agree.
  const shown = Number(value.toFixed(digits));

  if (shown === 0) {
    return <span className={`${text} tabular-nums text-ink-400`}>0{suffix}</span>;
  }

  const up = shown > 0;

  return (
    <span
      className={`${text} font-medium tabular-nums whitespace-nowrap ${
        up ? "text-status-green-fg" : "text-maroon-700"
      }`}
    >
      {up ? "▲" : "▼"} {up ? "+" : "−"}
      {Math.abs(shown).toFixed(digits)}
      {suffix}
    </span>
  );
}

/**
 * Places gained or lost on the board.
 *
 * Separate from `Delta` because the sign convention is inverted in the data and
 * would be inverted again in the reader's head: rank 8 to rank 3 is an
 * improvement, and it has to read as one.
 */
export function RankDelta({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="text-xs text-ink-300" title="Not ranked last cycle">
        —
      </span>
    );
  }
  if (value === 0) return <span className="text-xs text-ink-400">held</span>;

  const up = value > 0;
  return (
    <span
      className={`text-xs font-medium tabular-nums whitespace-nowrap ${
        up ? "text-status-green-fg" : "text-maroon-700"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}
