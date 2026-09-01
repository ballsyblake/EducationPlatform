import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { NavLinks, type NavLink } from "@/components/nav";
import { homePathFor, isAdmin, isCdu, isStaff, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, initials } from "@/lib/format";

/**
 * The bar is built from what an account *is*, not from what happens to be in
 * each page today.
 *
 * A tab that vanished whenever its queue emptied would be worse than a quiet
 * one: an educator would learn where Grading lives, come back on a clear
 * morning, and find it gone. So the conditions here are stable properties —
 * enrolled on a course, rostered onto one, in the Unit — and never a count of
 * outstanding work.
 */
const DASHBOARD: NavLink = { href: "/dashboard", label: "Dashboard" };

/** Only for somebody who is actually on a course as a coach. */
const ENROLLED_LINKS: NavLink[] = [
  { href: "/courses", label: "Courses" },
  { href: "/grades", label: "Grades & Feedback" },
];

const SUPPORT_LINK: NavLink = { href: "/support", label: "Support" };

/**
 * Where staff work. Every one of these is scoped to the viewer's courses, so
 * for an educator with no seat on any course they are six empty pages.
 */
const COURSE_LINKS: NavLink[] = [
  { href: "/admin/coaches", label: "Coaches" },
  { href: "/admin/grading", label: "Grading" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/make-ups", label: "Hours" },
  { href: "/admin/progress", label: "Progress" },
];

/**
 * Manage, which every staff account keeps even with no courses.
 *
 * The one tab that explains itself when it is empty — "you aren't rostered onto
 * a course yet" — so a new educator lands somewhere that tells them what is
 * missing rather than on a Dashboard with no way forward.
 */
const MANAGE: NavLink = { href: "/admin", label: "Manage" };

const STAFF_LINK: NavLink = { href: "/admin/people", label: "Staff" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // A club administrator or an assessor has a valid account for the other
  // product in this instance, not this one. Sending them on beats showing them
  // a coach dashboard with nothing on it.
  const home = homePathFor(user);
  if (home !== "/dashboard") redirect(home);

  const [enrolments, seats, cases] = await Promise.all([
    // Matches what /courses actually lists, unpublished courses included in
    // neither — otherwise the tab appears and the page is empty anyway.
    prisma.enrollment.count({ where: { userId: user.id, course: { published: true } } }),
    // A seat on a course team. Admins run every course and need no seat.
    isAdmin(user)
      ? Promise.resolve(1)
      : isStaff(user)
        ? prisma.courseStaff.count({ where: { userId: user.id } })
        : Promise.resolve(0),
    // A coach only gets a Support tab once they have a case. Most coaches never
    // will, and a permanent tab labelled "Support" reads as an accusation to
    // everyone who doesn't need it.
    isStaff(user) ? Promise.resolve(0) : prisma.supportCase.count({ where: { userId: user.id } }),
  ]);

  const links = [
    DASHBOARD,
    // An admin who has never been enrolled has no courses of their own and no
    // grades of their own, and two tabs that lead to an empty state are two
    // tabs. They appear on their own the day the account is enrolled in
    // something — an educator sitting their own diploma is not unusual.
    ...(enrolments > 0 ? ENROLLED_LINKS : []),
    ...(cases > 0 ? [SUPPORT_LINK] : []),
    ...(isStaff(user) ? [MANAGE] : []),
    ...(seats > 0 ? COURSE_LINKS : []),
    ...(isAdmin(user) ? [STAFF_LINK] : []),
  ];

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
                rather than moving between pages within it.

                Shown on the Club Development Unit grant, not on being an admin.
                An admin who runs coach education and was never put in the Unit
                has no business there and is not offered the door. */}
            {isCdu(user) && (
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
