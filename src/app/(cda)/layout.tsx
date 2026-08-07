import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { NavLinks, type NavLink } from "@/components/nav";
import { requireCdaUser } from "@/lib/cda/access";
import { displayName, initials } from "@/lib/format";

const CLUB_LINKS: NavLink[] = [
  { href: "/cda/club", label: "Overview" },
  { href: "/cda/club/staff", label: "Staff register" },
  { href: "/cda/club/non-negotiables", label: "Non-Negotiables" },
  { href: "/cda/club/participation", label: "Participation" },
  { href: "/cda/club/rating", label: "Our rating" },
];

const ASSESSOR_LINKS: NavLink[] = [{ href: "/cda/assess", label: "My clubs" }];

const CDU_LINKS: NavLink[] = [
  { href: "/cda/cdu", label: "Cycle" },
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

  const links =
    user.cda === "CLUB" ? CLUB_LINKS : user.cda === "ASSESSOR" ? ASSESSOR_LINKS : CDU_LINKS;

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

          <div className="order-3 w-full md:order-2 md:w-auto md:flex-1">
            <NavLinks links={links} />
          </div>

          <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
            {/* An ADMIN works in both products, so the way back is always
                visible. Nobody else ever sees this link. */}
            {user.cda === "ADMIN" && (
              <Link
                href="/dashboard"
                className="hidden rounded-lg px-2 py-1 text-xs font-medium text-white/70 hover:bg-maroon-700 hover:text-white lg:block"
              >
                Coach Education →
              </Link>
            )}

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
