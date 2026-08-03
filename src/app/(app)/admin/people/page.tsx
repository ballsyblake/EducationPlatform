import { SubmitButton } from "@/components/submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { isDevMailMode } from "@/lib/mailer";
import { magicLinkAvailable } from "@/lib/auth";
import { resendInvite, updateStaffMember } from "../actions/people";
import { AddStaffForm } from "./add-staff-form";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Staff" };

export default async function PeoplePage() {
  const admin = await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }, { email: "asc" }],
    include: {
      _count: { select: { enrollments: true, submissions: true, quizAttempts: true } },
      sessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
    },
  });

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Everyone with access. Coaches sign in with the email address listed here."
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <div className="card divide-y divide-chalk-200">
            {users.map((user) => (
              <div key={user.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-chalk-900">{user.name ?? user.email}</p>
                      {user.role === "ADMIN" && <Badge tone="info">Admin</Badge>}
                      {!user.active && <Badge tone="bad">Deactivated</Badge>}
                      {user.id === admin.id && <Badge tone="muted">You</Badge>}
                      {user.mustChangePassword && <Badge tone="warn">Temp password</Badge>}
                      {!user.passwordHash && <Badge tone="muted">No password</Badge>}
                      {user.lockedUntil && user.lockedUntil > new Date() && (
                        <Badge tone="bad">Locked out</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-chalk-500">
                      {user.title ? `${user.title} · ` : ""}
                      {user.email}
                    </p>
                    <p className="mt-1 text-xs text-chalk-400">
                      {user._count.enrollments} course{user._count.enrollments === 1 ? "" : "s"} ·{" "}
                      {user._count.submissions} submission
                      {user._count.submissions === 1 ? "" : "s"} · {user._count.quizAttempts} quiz
                      attempt{user._count.quizAttempts === 1 ? "" : "s"}
                      {user.sessions[0]
                        ? ` · last seen ${formatDate(user.sessions[0].lastSeenAt)}`
                        : " · never signed in"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-start gap-2">
                    <ResetPasswordForm userId={user.id} label={user.name ?? user.email} />

                    {magicLinkAvailable() && (
                      <form action={resendInvite}>
                        <input type="hidden" name="email" value={user.email} />
                        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Sending…">
                          Send sign-in link
                        </SubmitButton>
                      </form>
                    )}

                    {user.id !== admin.id && (
                      <>
                        <form action={updateStaffMember}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="action"
                            value={user.role === "ADMIN" ? "make_coach" : "make_admin"}
                          />
                          <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                            {user.role === "ADMIN" ? "Make coach" : "Make admin"}
                          </SubmitButton>
                        </form>

                        <form action={updateStaffMember}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="action"
                            value={user.active ? "deactivate" : "reactivate"}
                          />
                          <SubmitButton
                            className={user.active ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
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
                  <summary className="cursor-pointer text-xs font-medium text-field-700">
                    Edit details
                  </summary>
                  <form action={updateStaffMember} className="mt-2 flex flex-wrap gap-2">
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
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
                      Save
                    </SubmitButton>
                  </form>
                </details>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <div className="card card-pad">
            <h2 className="mb-4 font-semibold text-chalk-900">Add a staff member</h2>
            <AddStaffForm />
          </div>

          {isDevMailMode() && (
            <p className="mt-4 text-xs text-chalk-500">
              No email is configured, so passwords are how your staff signs in. Hand each coach the
              password shown when you add them; they set their own on first use, and you can reset
              it any time from this page.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
