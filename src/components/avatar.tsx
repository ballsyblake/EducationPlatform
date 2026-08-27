import { initials } from "@/lib/format";

const SIZES = {
  sm: { box: "h-8 w-8", text: "text-[11px]" },
  md: { box: "h-10 w-10", text: "text-xs" },
  lg: { box: "h-16 w-16", text: "text-lg" },
  xl: { box: "h-28 w-28", text: "text-2xl" },
} as const;

/**
 * A coach's face, or their initials until there is one.
 *
 * Deliberately not a client component and deliberately not `next/image`: the
 * file is served by an authorization-checking route that returns 404 to anyone
 * who shouldn't see it, and putting an optimizer in front of that would mean a
 * second copy of somebody's likeness in a cache that doesn't know the rule.
 */
export function Avatar({
  user,
  size = "md",
  className = "",
}: {
  user: { name: string | null; email: string; photoId?: string | null };
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { box, text } = SIZES[size];
  const shared = `${box} shrink-0 rounded-full object-cover ${className}`;

  if (user.photoId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/${user.photoId}`}
        alt={user.name ?? user.email}
        className={`${shared} bg-ink-100`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${shared} flex items-center justify-center bg-ink-200 font-semibold text-ink-600 ${text}`}
    >
      {initials(user.name, user.email)}
    </span>
  );
}
