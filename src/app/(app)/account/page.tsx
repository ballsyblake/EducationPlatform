import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Your account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const user = await requireUser();
  const { first } = await searchParams;
  const forced = user.mustChangePassword;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={forced ? "Choose your password" : "Your account"}
        subtitle={
          forced
            ? "You signed in with a temporary password. Pick your own to finish setting up."
            : displayName(user)
        }
      />

      {first && forced && (
        <p className="mb-6 rounded-lg bg-field-50 px-4 py-3 text-sm text-field-800">
          Welcome aboard. Once you set this, you won&apos;t need your coordinator to get back in.
        </p>
      )}

      <section className="card card-pad">
        <h2 className="mb-4 text-lg font-semibold text-chalk-900">
          {forced ? "Set a password" : "Change password"}
        </h2>
        <PasswordForm requireCurrent={!forced} />
      </section>

      {!forced && (
        <section className="card card-pad mt-6">
          <h2 className="mb-2 section-title">Account details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-chalk-500">Email</dt>
              <dd className="font-medium text-chalk-800">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-chalk-500">Name</dt>
              <dd className="font-medium text-chalk-800">{user.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-chalk-500">Role on staff</dt>
              <dd className="font-medium text-chalk-800">{user.title ?? "—"}</dd>
            </div>
          </dl>
          <p className="hint mt-3">
            Your coordinator can update these from the Staff page.
          </p>
        </section>
      )}
    </div>
  );
}
