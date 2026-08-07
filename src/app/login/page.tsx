import { redirect } from "next/navigation";
import { BrandLogoLarge, hasBrandLogo } from "@/components/brand";
import { canRevealMagicLink, getCurrentUser, magicLinkAvailable } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  // White ground, which is where the full-colour master logo belongs (2.A).
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {hasBrandLogo && (
            <div className="mb-4">
              <BrandLogoLarge />
            </div>
          )}
          <h1 className="headline text-lg text-ink-900">Coach education</h1>
          <p className="mt-2 text-sm text-ink-500">
            Courses, assessments and feedback for Football Queensland coaches.
          </p>
        </div>

        <div className="card card-pad">
          <LoginForm emailEnabled={magicLinkAvailable()} />
        </div>

        {canRevealMagicLink() && (
          <p className="mt-6 text-center text-xs text-ink-500">
            Running in dev mail mode — sign-in links are printed to the server console and{" "}
            <code className="rounded bg-ink-200 px-1 py-0.5">.mail-outbox.log</code>. Set{" "}
            <code className="rounded bg-ink-200 px-1 py-0.5">SMTP_HOST</code> to send real email.
          </p>
        )}
      </div>
    </main>
  );
}
