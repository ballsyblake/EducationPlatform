import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { NavLinks, type NavLink } from "@/components/nav";
import { homePathFor, isAdmin, requireUser } from "@/lib/auth";
import { displayName, initials } from "@/lib/format";

const COACH_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/courses", label: "Courses" },
  { href: "/grades", label: "Grades & Feedback" },
];

const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Manage" },
  { href: "/admin/grading", label: "Grading" },
  { href: "/admin/progress", label: "Progress" },
  { href: "/admin/people", label: "Staff" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // A club administrator or an assessor has a valid account for the other
  // product in this instance, not this one. Sending them on beats showing them
  // a coach dashboard with nothing on it.
  const home = homePathFor(user);
  if (home !== "/dashboard") redirect(home);

  const links = isAdmin(user) ? [...COACH_LINKS, ...ADMIN_LINKS] : COACH_LINKS;

  return (
    <div className="min-h-screen">
      <header className="bg-maroon-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/dashboard" className="flex items-center">
            {/* Deep Maroon background, so the mono white logo is the permitted
                version here — the master gradient is for white or images. */}
            <BrandLogo variant="light" />
          </Link>

          <div className="order-3 flex w-full items-center gap-2 md:order-2 md:w-auto md:flex-1">
            <div className="min-w-0 flex-1">
              <NavLinks links={links} />
            </div>

            {/* The only way into the club development portal from this side, so
                it sits with the navigation and is never hidden at any width.
                Outlined rather than filled: it leaves this product entirely
                rather than moving between pages within it. */}
            {isAdmin(user) && (
              <Link
                href="/cda"
                className="shrink-0 rounded-lg border border-white/40 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-maroon-700"
              >
                Club Development →
              </Link>
            )}
          </div>

          <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
            <Link href="/account" className="flex items-center gap-3 hover:opacity-90">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{displayName(user)}</p>
                <p className="text-xs text-white/70">
                  {user.title ?? (isAdmin(user) ? "Program admin" : "Coach")}
                </p>
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

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
