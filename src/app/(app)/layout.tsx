import Link from "next/link";
import { NavLinks, type NavLink } from "@/components/nav";
import { isAdmin, requireUser } from "@/lib/auth";
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
  const links = isAdmin(user) ? [...COACH_LINKS, ...ADMIN_LINKS] : COACH_LINKS;

  return (
    <div className="min-h-screen">
      <header className="bg-field-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-field-800">
              C
            </span>
            <span>Coach LMS</span>
          </Link>

          <div className="order-3 w-full md:order-2 md:w-auto md:flex-1">
            <NavLinks links={links} />
          </div>

          <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
            <Link href="/account" className="flex items-center gap-3 hover:opacity-90">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{displayName(user)}</p>
                <p className="text-xs text-field-200">
                  {user.title ?? (isAdmin(user) ? "Program admin" : "Coach")}
                </p>
              </div>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-field-600 text-sm font-semibold"
                title={`${user.email} — account settings`}
              >
                {initials(user.name, user.email)}
              </span>
            </Link>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded-lg px-2 py-1 text-xs font-medium text-field-100 hover:bg-field-700 hover:text-white"
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
