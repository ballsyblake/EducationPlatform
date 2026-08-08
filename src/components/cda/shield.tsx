import { SHIELD_COLOURS, SHIELD_LABELS } from "@/lib/cda/rubric";
import type { Shield } from "@prisma-client";

/**
 * The shield chip.
 *
 * Shields carry metal colours rather than FQ's palette, which is a deliberate
 * departure: a Gold shield has to look gold, and there is nothing in the brand
 * palette that would read as one. The colour is confined to this chip — the
 * page around it stays entirely in Maroon and black tints — which follows the
 * precedent the guidelines already set for the competition palettes, where a
 * sub-brand keeps its own identifying colour inside the FQ system.
 */
export function ShieldBadge({
  shield,
  size = "md",
}: {
  shield: Shield | null;
  size?: "sm" | "md" | "lg";
}) {
  if (shield === null) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-maroon-300 bg-maroon-50 font-semibold text-maroon-800 ${
          size === "lg" ? "px-4 py-1.5 text-base" : size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
        }`}
      >
        Not eligible
      </span>
    );
  }

  const colours = SHIELD_COLOURS[shield];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${
        size === "lg" ? "px-4 py-1.5 text-base" : size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
      style={{
        backgroundColor: colours.bg,
        color: colours.fg,
        boxShadow: `inset 0 0 0 1px ${colours.ring}`,
      }}
    >
      <ShieldGlyph className={size === "lg" ? "h-4 w-4" : "h-3 w-3"} />
      {SHIELD_LABELS[shield]}
    </span>
  );
}

/** A shield outline. Generic geometry — nothing here echoes the FQ mark. */
export function ShieldGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 18" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 0 15.5 2.6v7.2c0 3.6-3 6.5-7.5 8.2-4.5-1.7-7.5-4.6-7.5-8.2V2.6L8 0Z" />
    </svg>
  );
}
