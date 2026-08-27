import { PhotoCapture } from "@/components/photo-capture";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDateTime } from "@/lib/format";
import { signOutEverywhere } from "./actions";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();

  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Your account" subtitle={displayName(user)} />

      <section className="card card-pad">
        <h2 className="mb-3 section-title">Your photo</h2>
        <PhotoCapture user={user} />
      </section>

      <section className="card card-pad mt-6">
        <h2 className="mb-2 section-title">Account details</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Email</dt>
            <dd className="font-medium text-ink-800">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Name</dt>
            <dd className="font-medium text-ink-800">{user.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Role on staff</dt>
            <dd className="font-medium text-ink-800">{user.title ?? "—"}</dd>
          </div>
        </dl>
        <p className="hint mt-3">Your coordinator can update these from the Staff page.</p>
      </section>

      <section className="card card-pad mt-6">
        <h2 className="mb-2 section-title">Signed-in devices</h2>
        <p className="mb-3 text-sm text-ink-600">
          There&apos;s no password on this account — you stay signed in on each device you&apos;ve
          opened a sign-in link on. Sign the others out if you&apos;ve used a shared or borrowed
          one.
        </p>

        <ul className="mb-4 space-y-1 text-sm text-ink-700">
          {sessions.map((session, index) => (
            <li key={session.id} className="flex justify-between gap-3">
              <span>{index === 0 ? "This device" : `Device ${index + 1}`}</span>
              <span className="text-xs text-ink-500">
                last used {formatDateTime(session.lastSeenAt)}
              </span>
            </li>
          ))}
        </ul>

        {sessions.length > 1 && (
          <form action={signOutEverywhere}>
            <SubmitButton
              className="btn-secondary btn-sm"
              pendingLabel="Signing out…"
              confirm="Sign out every other device? You'll stay signed in here."
            >
              Sign out other devices
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
