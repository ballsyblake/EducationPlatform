import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { magicLinkAvailable, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { emailSignInLink, updateStaffMember } from "../actions/people";
import { AddStaffForm } from "./add-staff-form";
import { SignInLinkForm } from "./sign-in-link-form";

export const metadata = { title: "Staff" };

export default async function PeoplePage() {
  const admin = await requireAdmin();
  const emailEnabled = magicLinkAvailable();

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
    where: { role: { in: ["COACH", "ADMIN"] } },
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
        subtitle={
          <>
            Coach education staff. Nobody has a password &mdash; they sign in with a link. Club
            Development&apos;s assessors and club administrators are separate accounts, managed
            under{" "}
            <Link href="/cda/cdu/assessors" className="text-maroon-700 hover:underline">
              Club Development
            </Link>
            .
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <div className="card divide-y divide-ink-200">
            {users.map((user) => (
              <div key={user.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink-900">{user.name ?? user.email}</p>
                      {user.role === "ADMIN" && <Badge tone="info">Admin</Badge>}
                      {!user.active && <Badge tone="bad">Deactivated</Badge>}
                      {user.id === admin.id && <Badge tone="muted">You</Badge>}
                      {!user.sessions[0] && user.active && (
                        <Badge tone="warn">Never signed in</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {user.title ? `${user.title} · ` : ""}
                      {user.email}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
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
                    <SignInLinkForm userId={user.id} disabled={!user.active} />

                    {emailEnabled && user.active && (
                      <form action={emailSignInLink}>
                        <input type="hidden" name="email" value={user.email} />
                        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Sending…">
                          Email it instead
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
                  <summary className="cursor-pointer text-xs font-medium text-maroon-700">
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
            <h2 className="mb-4 font-semibold text-ink-900">Add a staff member</h2>
            <AddStaffForm emailEnabled={emailEnabled} />
          </div>

          {!emailEnabled && (
            <p className="mt-4 text-xs text-ink-500">
              No email is configured, so sign-in links are handed out from this page. Give each
              coach the link shown when you add them — copy it, or hold up the QR code for them to
              scan. Once they use it they stay signed in, and you can issue a new link any time.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
