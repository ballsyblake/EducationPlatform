import Link from "next/link";
import { NavLinks, type NavLink } from "@/components/nav";
import { isAdmin, requireUser } from "@/lib/auth";
import { displayName, initials } from "@/lib/format";
import { PasswordForm } from "./account/password-form";

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

          {/* Nothing is reachable until a temporary password is replaced, so the
              nav would just be a row of links back to the same screen. */}
          <div className="order-3 w-full md:order-2 md:w-auto md:flex-1">
            {!user.mustChangePassword && <NavLinks links={links} />}
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

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* A temporary password unlocks nothing but this screen. Blocking here
            rather than redirecting means no route can slip past it. */}
        {user.mustChangePassword ? <ForcedPasswordChange /> : children}
      </main>
    </div>
  );
}

function ForcedPasswordChange() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-chalk-900">Choose your password</h1>
      <p className="mt-1 mb-6 text-sm text-chalk-500">
        You signed in with a temporary password. Pick your own to finish setting up — after this
        you won&apos;t need your coordinator to get back in.
      </p>
      <div className="card card-pad">
        <PasswordForm requireCurrent={false} />
      </div>
    </div>
  );
}
