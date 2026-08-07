/**
 * Football Queensland logo slot.
 *
 * The brand guidelines (2.A) are explicit: only official master artwork may be
 * used, and the logo must never be altered, re-drawn, re-created, or typeset
 * from a font. So nothing here draws a logo — it renders the official file when
 * one has been supplied, and otherwise falls back to the product's own name set
 * in brand type, which is not a stand-in for the mark.
 *
 * To supply the artwork, drop the files from the FQ Marketing team into
 * `public/brand/` and set the paths in the environment:
 *
 *   NEXT_PUBLIC_FQ_LOGO="/brand/FQ_RGB_HORIZ_Maroon_Grad.svg"
 *   NEXT_PUBLIC_FQ_LOGO_LIGHT="/brand/FQ_RGB_HORIZ_White_Solid.svg"
 *
 * The light version is the one for the Deep Maroon header: the master logo is
 * only permitted on white or on images, and the mono white version exists for
 * exactly this case.
 */

const COLOUR_LOGO = process.env.NEXT_PUBLIC_FQ_LOGO;
const LIGHT_LOGO = process.env.NEXT_PUBLIC_FQ_LOGO_LIGHT;

/** Minimum size for horizontal logos on digital applications (2.A). */
const MIN_HEIGHT_PX = 23;

export function BrandLogo({
  variant = "colour",
  className = "",
  name = "Coach Education",
}: {
  variant?: "colour" | "light";
  className?: string;
  /**
   * The product name shown when no official artwork is supplied. One instance
   * serves two products, and the header has to say which one you're in.
   */
  name?: string;
}) {
  const src = variant === "light" ? (LIGHT_LOGO ?? COLOUR_LOGO) : COLOUR_LOGO;

  if (!src) {
    // No artwork supplied — the product name, deliberately not logo-like.
    return (
      <span
        className={`headline text-sm ${
          variant === "light" ? "text-white" : "text-maroon-600"
        } ${className}`}
      >
        {name}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Football Queensland"
      // Clear space for horizontal logos is 40% of the logo height (2.A).
      className={`w-auto ${className}`}
      style={{ height: `${Math.max(MIN_HEIGHT_PX, 28)}px`, padding: "0 40%" }}
    />
  );
}

/** True once official artwork has been supplied. */
export const hasBrandLogo = Boolean(COLOUR_LOGO);

/**
 * Larger lock-up for the sign-in page, which sits on white.
 *
 * Renders nothing without artwork rather than substituting a wordmark — the
 * page's own heading carries the name, and inventing a mark is exactly what the
 * guidelines rule out.
 */
export function BrandLogoLarge() {
  if (!COLOUR_LOGO) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={COLOUR_LOGO}
      alt="Football Queensland"
      className="mx-auto h-14 w-auto"
    />
  );
}
