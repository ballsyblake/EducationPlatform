"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };

/** Whether a path sits under a link, exactly or as one of its sub-routes. */
function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  // The longest matching href wins, and only that one lights up.
  //
  // Marking every match highlighted two tabs at once wherever one section's
  // path is a prefix of another's, which is most of this app: /cda/cdu is a
  // prefix of /cda/cdu/rubric, /admin of /admin/grading, /cda/club of
  // /cda/club/staff. The section a page belongs to is the most specific link
  // that contains it, so the deepest match is the answer — and a page with no
  // link of its own, like an assessment under /cda/cdu/assessments/[id], still
  // correctly lights up the section above it.
  const activeHref = links
    .filter((l) => matches(pathname, l.href))
    .reduce<string | null>((best, l) => (best && best.length >= l.href.length ? best : l.href), null);

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {links.map((link) => {
        const active = link.href === activeHref;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-maroon-700 text-white"
                : "text-white/80 hover:bg-maroon-700 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
