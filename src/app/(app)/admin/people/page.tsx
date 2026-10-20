import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import {
  coachPortalEnabled,
  magicLinkAvailable,
  requireAdmin,
} from "@/lib/auth";
import { shortCourseTitle } from "@/lib/coaches";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { emailSignInLink, updateStaffMember } from "../actions/people";
import { AddStaffForm } from "./add-staff-form";
import { SignInLinkForm } from "./sign-in-link-form";

export const metadata = { title: "Staff" };

/**
 * The roles somebody can be moved to, and what each of them means.
 *
 * An educator marks registers and rates deliveries on the courses they are
 * rostered onto. An admin does that everywhere and also owns the courses and
 * the accounts. Neither is the Club Development Unit — that is a separate
 * grant, offered below on an admin only.
 */
const ROLE_MOVES = [
  {
    from: "COACH",
    action: "make_coach",
    label: "Make coach",
    confirm: undefined,
  },
  {
    from: "EDUCATOR",
    action: "make_educator",
    label: "Make educator",
    confirm: undefined,
  },
  {
    from: "ADMIN",
    action: "make_admin",
    label: "Make admin",
    confirm:
      "Make this account an admin? They'll be able to create and delete courses and manage every account.",
  },
] as const;

/** What the role filter offers, in the order the list sorts them. */
const ROLE_FILTERS = [
  { value: "ADMIN", label: "Admins" },
  { value: "EDUCATOR", label: "Educators" },
  { value: "COACH", label: "Coaches" },
] as const;

/**
 * The account states worth picking out of a staff list.
 *
 * "Never signed in" is the badge's own test — no session and still active —
 * because whoever filters for it is looking for a link that was handed out and
 * never used, and a deactivated account is not that.
 */
const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
  { value: "never", label: "Never signed in" },
] as const;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    course?: string;
  }>;
}) {
  const admin = await requireAdmin();
  const emailEnabled = magicLinkAvailable();
  const { q, role, status, course: courseId } = await searchParams;

  // Coach-education accounts only. This page listed every account in the
  // instance, so Club Development's assessors and club administrators appeared
  // among the coaches — with a "Make admin" button beside each of them, one
  // click from handing an assessor the whole Club Development Unit, and a
  // "Make coach" that would strip their role and lock them out of the portal
  // while their line-item allocations stayed pointing at them.
  //
  // The two products share an account system and nothing else. Portal accounts
  // are managed at /cda/cdu, where deactivating one also ends its session.
  const users = await prisma.user.findMany({
    where: { role: { in: ["COACH", "EDUCATOR", "ADMIN"] } },
    orderBy: [
      { active: "desc" },
      { role: "asc" },
      { name: "asc" },
      { email: "asc" },
    ],
    include: {
      _count: {
        select: { enrollments: true, submissions: true, quizAttempts: true },
      },
      sessions: {
        select: { lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
        take: 1,
      },
      // The seats somebody holds on a register, which is what "assigned to a
      // course" means here — an assessor gets their coaches because an admin
      // put them on the course team, not from a coach-to-educator table.
      courseStaffRoles: {
        select: { courseId: true, course: { select: { title: true } } },
      },
    },
  });

  // Only the cohorts somebody on this page actually sits on, so the filter row
  // is the courses with a staff team rather than every course ever run.
  const courses = await prisma.course.findMany({
    where: { staff: { some: { userId: { not: null } } } },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  // Matched here rather than in the query: Prisma has no case-insensitive
  // `contains` on SQLite, and this is one page of staff accounts rather than a
  // roster, so it matches the way /admin/coaches matches.
  const query = q?.trim().toLowerCase() ?? "";
  const visible = users.filter((user) => {
    if (role && user.role !== role) return false;
    if (status === "active" && !user.active) return false;
    if (status === "deactivated" && user.active) return false;
    if (status === "never" && (user.sessions[0] || !user.active)) return false;
    if (
      courseId &&
      !user.courseStaffRoles.some((seat) => seat.courseId === courseId)
    )
      return false;
    if (query) {
      const haystack = [user.name, user.email, user.title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  // Filter links keep whatever else is set, so picking a role doesn't throw
  // away the search you typed to get there.
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q,
      role,
      status,
      course: courseId,
      ...patch,
    })) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/admin/people?${qs}` : "/admin/people";
  };

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle={
          <>
            Coach education staff. Nobody has a password &mdash; they sign in
            with a link. Club Development&apos;s assessors and club
            administrators are separate accounts, managed under{" "}
            <Link
              href="/cda/cdu/assessors"
              className="text-maroon-700 hover:underline"
            >
              Club Development
            </Link>
            .
          </>
        }
      />

      <form
        action="/admin/people"
        className="mb-3 flex flex-wrap items-center gap-2"
      >
        {role && <input type="hidden" name="role" value={role} />}
        {status && <input type="hidden" name="status" value={status} />}
        {courseId && <input type="hidden" name="course" value={courseId} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search a name, an email, a role on staff…"
          aria-label="Search staff"
          className="input w-full max-w-sm px-3 py-1.5 text-sm"
        />
        <button type="submit" className="btn-secondary btn-sm">
          Search
        </button>
        {q && (
          <Link
            href={href({ q: undefined })}
            className="text-xs text-ink-500 underline"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mb-2 flex flex-wrap gap-2">
        <Link
          href={href({ role: undefined })}
          className={role ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        >
          Every role
        </Link>
        {ROLE_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={href({ role: option.value })}
            className={
              role === option.value
                ? "btn-primary btn-sm"
                : "btn-secondary btn-sm"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <Link
          href={href({ status: undefined })}
          className={status ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        >
          Any status
        </Link>
        {STATUS_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={href({ status: option.value })}
            className={
              status === option.value
                ? "btn-primary btn-sm"
                : "btn-secondary btn-sm"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      {courses.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href={href({ course: undefined })}
            className={courseId ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
          >
            All courses
          </Link>
          {courses.map((course) => (
            <Link
              key={course.id}
              href={href({ course: course.id })}
              className={
                courseId === course.id
                  ? "btn-primary btn-sm"
                  : "btn-secondary btn-sm"
              }
            >
              {shortCourseTitle(course.title)}
            </Link>
          ))}
        </div>
      )}

      <p className="mb-4 text-xs text-ink-500">
        {visible.length === users.length
          ? `${users.length} account${users.length === 1 ? "" : "s"}`
          : `${visible.length} of ${users.length} accounts`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          {visible.length === 0 ? (
            <EmptyState
              title="Nobody matches that"
              description="Try a different role, status, course or search term."
              action={
                <Link href="/admin/people" className="btn-primary btn-sm">
                  Clear the filters
                </Link>
              }
            />
          ) : (
            <div className="card divide-y divide-ink-200">
              {visible.map((user) => (
                <div key={user.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink-900">
                          {user.name ?? user.email}
                        </p>
                        {user.role === "ADMIN" && (
                          <Badge tone="info">Admin</Badge>
                        )}
                        {user.role === "EDUCATOR" && (
                          <Badge tone="ok">Educator</Badge>
                        )}
                        {user.cdu && (
                          <Badge tone="muted">Club Development Unit</Badge>
                        )}
                        {!user.active && <Badge tone="bad">Deactivated</Badge>}
                        {user.id === admin.id && (
                          <Badge tone="muted">You</Badge>
                        )}
                        {!user.sessions[0] && user.active && (
                          <Badge tone="warn">Never signed in</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {user.title ? `${user.title} · ` : ""}
                        {user.email}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        {user._count.enrollments} course
                        {user._count.enrollments === 1 ? "" : "s"} ·{" "}
                        {user._count.submissions} submission
                        {user._count.submissions === 1 ? "" : "s"} ·{" "}
                        {user._count.quizAttempts} quiz attempt
                        {user._count.quizAttempts === 1 ? "" : "s"}
                        {user.sessions[0]
                          ? ` · last seen ${formatDate(user.sessions[0].lastSeenAt)}`
                          : " · never signed in"}
                      </p>
                      {user.courseStaffRoles.length > 0 && (
                        <p className="mt-1 text-xs text-ink-400">
                          Rostered on{" "}
                          {[
                            ...new Set(
                              user.courseStaffRoles.map((seat) =>
                                shortCourseTitle(seat.course.title),
                              ),
                            ),
                          ].join(", ")}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-start gap-2">
                      <SignInLinkForm
                        userId={user.id}
                        disabled={!user.active}
                      />

                      {emailEnabled && user.active && (
                        <form action={emailSignInLink}>
                          <input
                            type="hidden"
                            name="email"
                            value={user.email}
                          />
                          <SubmitButton
                            className="btn-secondary btn-sm"
                            pendingLabel="Sending…"
                          >
                            Email it instead
                          </SubmitButton>
                        </form>
                      )}

                      {user.id !== admin.id && (
                        <>
                          {/* Three roles, so a toggle no longer says it. Each
                            button names the role it moves them to, and the one
                            they already hold isn't offered. */}
                          {ROLE_MOVES.filter((m) => m.from !== user.role).map(
                            (move) => (
                              <form
                                key={move.action}
                                action={updateStaffMember}
                              >
                                <input
                                  type="hidden"
                                  name="userId"
                                  value={user.id}
                                />
                                <input
                                  type="hidden"
                                  name="action"
                                  value={move.action}
                                />
                                <SubmitButton
                                  className="btn-secondary btn-sm"
                                  pendingLabel="…"
                                  confirm={move.confirm}
                                >
                                  {move.label}
                                </SubmitButton>
                              </form>
                            ),
                          )}

                          {/* The Club Development Unit, granted on purpose rather
                            than inherited from being an admin. Offered only on
                            an admin, because nobody else can hold it. */}
                          {user.role === "ADMIN" && (
                            <form action={updateStaffMember}>
                              <input
                                type="hidden"
                                name="userId"
                                value={user.id}
                              />
                              <input
                                type="hidden"
                                name="action"
                                value={user.cdu ? "revoke_cdu" : "grant_cdu"}
                              />
                              <SubmitButton
                                className="btn-secondary btn-sm"
                                pendingLabel="…"
                                confirm={
                                  user.cdu
                                    ? "Take this account out of the Club Development Unit? They'll be signed out, and lose every club's assessment and evidence."
                                    : undefined
                                }
                              >
                                {user.cdu
                                  ? "Remove from the Unit"
                                  : "Add to the Unit"}
                              </SubmitButton>
                            </form>
                          )}

                          <form action={updateStaffMember}>
                            <input
                              type="hidden"
                              name="userId"
                              value={user.id}
                            />
                            <input
                              type="hidden"
                              name="action"
                              value={user.active ? "deactivate" : "reactivate"}
                            />
                            <SubmitButton
                              className={
                                user.active
                                  ? "btn-danger btn-sm"
                                  : "btn-secondary btn-sm"
                              }
                              pendingLabel="…"
                              confirm={
                                user.active
                                  ? "Deactivate this account? They'll be signed out and can't sign back in."
                                  : undefined
                              }
                            >
                              {user.active ? "Deactivate" : "Reactivate"}
                            </SubmitButton>
                          </form>
                        </>
                      )}
                    </div>
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-maroon-700">
                      Edit details
                    </summary>
                    <form
                      action={updateStaffMember}
                      className="mt-2 flex flex-wrap gap-2"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="action" value="update" />
                      <input
                        name="name"
                        defaultValue={user.name ?? ""}
                        placeholder="Name"
                        className="input max-w-56"
                      />
                      <input
                        name="title"
                        defaultValue={user.title ?? ""}
                        placeholder="Role on staff"
                        className="input max-w-56"
                      />
                      <SubmitButton
                        className="btn-secondary btn-sm"
                        pendingLabel="Saving…"
                      >
                        Save
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside>
          <div className="card card-pad">
            <h2 className="mb-4 font-semibold text-ink-900">
              Add a staff member
            </h2>
            <AddStaffForm
              emailEnabled={emailEnabled}
              coachPortalEnabled={coachPortalEnabled()}
            />
          </div>

          {!emailEnabled && (
            <p className="mt-4 text-xs text-ink-500">
              No email is configured, so sign-in links are handed out from this
              page. Give each coach the link shown when you add them — copy it,
              or hold up the QR code for them to scan. Once they use it they
              stay signed in, and you can issue a new link any time.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
