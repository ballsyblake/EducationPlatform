import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { NavLinks, type NavLink } from "@/components/nav";
import {
  coachPortalEnabled,
  isAdmin,
  isCdaRole,
  isCdu,
  isEducator,
  isStaff,
  requireUser,
} from "@/lib/auth";
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

/**
 * Only for somebody who is actually on a course as a coach — and only while the
 * coach portal is unparked. These three are the coach's own view of the app,
 * and with coaches switched off the only accounts that can reach them are staff
 * who happen to be sitting a diploma themselves.
 */
const ENROLLED_LINKS: NavLink[] = [
  { href: "/courses", label: "Courses" },
  { href: "/grades", label: "Grades & Feedback" },
];

const SUPPORT_LINK: NavLink = { href: "/support", label: "Support" };

/**
 * The program's own pages, which are an admin's. Each is still scoped to the
 * viewer's courses, so they work for an educator who opens one by URL — they
 * are simply not the job an educator is given, and the row of them was most of
 * what made that view hard to read.
 */
const COURSE_LINKS: NavLink[] = [
  { href: "/admin/coaches", label: "Coaches" },
  { href: "/admin/grading", label: "Grading" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/make-ups", label: "Make-ups" },
  { href: "/admin/cohorts", label: "Cohorts" },
];

/**
 * An assessor's whole view: one page.
 *
 * It was the program's six tabs scoped by course, then a dashboard and two
 * queues, and it is now the list of coaches assigned to them with what each one
 * needs on the row. There is nothing to navigate between, so there is one tab
 * and no Dashboard beside it — `/dashboard` sends them here.
 *
 * Shown on being an assessor rather than on holding a seat, like every other
 * link here: a tab that appeared the day somebody was rostered and vanished
 * when the course closed would be worse than a quiet one, and the page explains
 * an empty list.
 */
const EDUCATOR_LINKS: NavLink[] = [{ href: "/educator", label: "Your coaches" }];

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
  //
  // Asked as "is this the other product's account", not as "is their home page
  // somewhere else": an educator's home is now `/educator`, which is inside
  // this layout, and testing the path would have redirected them to a page that
  // redirects them again.
  if (isCdaRole(user)) redirect("/cda");

  // Both are the coach's own view of the app, so neither is worth a query while
  // that view is parked.
  const [enrolments, cases] = coachPortalEnabled()
    ? await Promise.all([
        // Matches what /courses actually lists, unpublished courses included in
        // neither — otherwise the tab appears and the page is empty anyway.
        prisma.enrollment.count({ where: { userId: user.id, course: { published: true } } }),
        // A coach only gets a Support tab once they have a case. Most coaches
        // never will, and a permanent tab labelled "Support" reads as an
        // accusation to everyone who doesn't need it.
        isStaff(user)
          ? Promise.resolve(0)
          : prisma.supportCase.count({ where: { userId: user.id } }),
      ])
    : [0, 0];

  const links = [
    // An assessor's one page is their list, so the Dashboard tab would be a
    // second name for it.
    ...(isEducator(user) ? [] : [DASHBOARD]),
    // An admin who has never been enrolled has no courses of their own and no
    // grades of their own, and two tabs that lead to an empty state are two
    // tabs. They appear on their own the day the account is enrolled in
    // something — an educator sitting their own diploma is not unusual.
    ...(enrolments > 0 ? ENROLLED_LINKS : []),
    ...(cases > 0 ? [SUPPORT_LINK] : []),
    // The program's tabs are an admin's. An educator gets the one list instead;
    // Manage, the roster, the coursework queue, the hours ledger, the cohorts
    // roll-up and the support desk all still work and are still scoped — they
    // are just not what an educator is asked to do.
    ...(isAdmin(user) ? [MANAGE, ...COURSE_LINKS] : []),
    ...(isEducator(user) ? EDUCATOR_LINKS : []),
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
                  {/* An educator with no title of their own was being called a
                      coach, which is the one thing they are not on this page. */}
                  {user.title ??
                    (isAdmin(user) ? "Program admin" : isEducator(user) ? "Educator" : "Coach")}
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
