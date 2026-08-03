import { redirect } from "next/navigation";
import { canRevealMagicLink, getCurrentUser, magicLinkAvailable } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-chalk-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-field-600 text-xl font-black text-white">
            C
          </div>
          <h1 className="text-2xl font-bold text-chalk-900">Coach LMS</h1>
          <p className="mt-1 text-sm text-chalk-500">
            Install work, assessments, and film study for the staff.
          </p>
        </div>

        <div className="card card-pad">
          <LoginForm emailEnabled={magicLinkAvailable()} />
        </div>

        {canRevealMagicLink() && (
          <p className="mt-6 text-center text-xs text-chalk-500">
            Running in dev mail mode — sign-in links are printed to the server console and{" "}
            <code className="rounded bg-chalk-200 px-1 py-0.5">.mail-outbox.log</code>. Set{" "}
            <code className="rounded bg-chalk-200 px-1 py-0.5">SMTP_HOST</code> to send real email.
          </p>
        )}
      </div>
    </main>
  );
}
