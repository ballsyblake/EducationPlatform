import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { NavLinks, type NavLink } from "@/components/nav";
import { mayAssess, requireCdaUser } from "@/lib/cda/access";
import { displayName, initials } from "@/lib/format";

const CLUB_LINKS: NavLink[] = [
  { href: "/cda/club", label: "Overview" },
  { href: "/cda/club/staff", label: "Staff register" },
  { href: "/cda/club/structure", label: "Structure" },
  { href: "/cda/club/non-negotiables", label: "Non-Negotiables" },
  { href: "/cda/club/participation", label: "Participation" },
  { href: "/cda/club/rating", label: "Our rating" },
  // In the nav rather than only linked from the rating page: the window is 8
  // days and a club that doesn't find this in time has lost the right, which
  // is not a discoverability problem anyone should be asked to solve twice.
  { href: "/cda/club/review", label: "Review" },
];

// An assessor's three screens, and deliberately only these three. Running the
// cycle — opening it, allocating line items, managing the assessor pool, editing
// the rubric — is the Club Development Unit's, and every one of those pages
// turns a non-admin away server-side rather than merely staying out of this
// list. What an assessor gets is their own work: the items they hold, their own
// progress through them, and the clubs they look after.
const ASSESSOR_LINKS: NavLink[] = [
  { href: "/cda/assess", label: "My line items" },
  { href: "/cda/progress", label: "My progress" },
  { href: "/cda/clubs", label: "My clubs" },
  // Locked ratings only, for the clubs they already reach — the page itself
  // enforces that. An assessor seeing a live standing for a club they are
  // still scoring is the anchor the evidence screens exist to avoid.
  { href: "/cda/leaderboard", label: "Leaderboard" },
];

const CDU_LINKS: NavLink[] = [
  { href: "/cda/cdu", label: "Cycle" },
  { href: "/cda/leaderboard", label: "Leaderboard" },
  { href: "/cda/cdu/progress", label: "Progress" },
  { href: "/cda/cdu/clubs", label: "Clubs" },
  { href: "/cda/cdu/assessors", label: "Assessors" },
  { href: "/cda/cdu/rubric", label: "Rubric" },
];

const ROLE_TITLES = {
  CLUB: "Club administrator",
  ASSESSOR: "FQ assessor",
  ADMIN: "Club Development Unit",
} as const;

export default async function CdaLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCdaUser();

  // A Club Development Unit account in the assessor pool keeps the whole CDU
  // navigation and gains the assessor's one screen. Last, because running the
  // cycle is still the larger part of the job.
  const cduLinks = mayAssess(user) ? [...CDU_LINKS, ...ASSESSOR_LINKS] : CDU_LINKS;

  const links =
    user.cda === "CLUB" ? CLUB_LINKS : user.cda === "ASSESSOR" ? ASSESSOR_LINKS : cduLinks;

  return (
    <div className="min-h-screen">
      <header className="bg-maroon-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/cda" className="flex items-center gap-3">
            {/* Deep Maroon ground, so the mono white logo is the permitted
                version — the master gradient is for white or images. */}
            <BrandLogo variant="light" name="Football Queensland" />
            <span className="headline border-l border-white/25 pl-3 text-xs text-white/90">
              Club Development
            </span>
          </Link>

          <div className="order-3 flex w-full items-center gap-2 md:order-2 md:w-auto md:flex-1">
            <div className="min-w-0 flex-1">
              <NavLinks links={links} />
            </div>

            {/* An ADMIN works in both products, so the way back sits with the
                navigation and is never hidden at any width. Nobody else ever
                sees this link. */}
            {user.cda === "ADMIN" && (
              <Link
                href="/dashboard"
                className="shrink-0 rounded-lg border border-white/40 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-maroon-700"
              >
                Coach Education →
              </Link>
            )}
          </div>

          <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
            <Link href="/account" className="flex items-center gap-3 hover:opacity-90">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{displayName(user)}</p>
                <p className="text-xs text-white/70">{ROLE_TITLES[user.cda]}</p>
              </div>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-maroon-600 text-sm font-semibold"
                title={`${user.email} — account settings`}
              >
                {initials(user.name, user.email)}
              </span>
            </Link>

            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded-lg px-2 py-1 text-xs font-medium text-white/80 hover:bg-maroon-700 hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
