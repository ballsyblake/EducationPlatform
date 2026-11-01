"use server";

import { redirect } from "next/navigation";
import { homePathFor, requestLoginLink, signInWithPassword } from "@/lib/auth";

export type LoginFormState = {
  status: "idle" | "sent" | "error";
  message?: string;
  /** Only populated outside production, where showing the link is safe. */
  devLink?: string;
};

export async function sendLoginLink(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "");
  const result = await requestLoginLink(email);

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  return {
    status: "sent",
    message: `If ${email.trim().toLowerCase()} is on staff, a sign-in link is on its way.`,
    devLink: result.devLink,
  };
}

/**
 * The initial value lives in the client component, not here: a `"use server"`
 * module may only export async functions, and exporting a plain object from one
 * takes the whole login page down with "found object" at module evaluation.
 */
export type PasswordFormState = {
  status: "idle" | "error";
  message?: string;
  /** Bumped on every settle so the client can remount the password field. */
  attempt: number;
};

/**
 * Signs an admin in with the shared password.
 *
 * The redirect is outside any try/catch on purpose — `redirect` works by
 * throwing, and catching it here would swallow the navigation and leave the
 * form sitting there after a successful sign-in.
 */
export async function signInWithAdminPassword(
  prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const result = await signInWithPassword(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );

  if (!result.ok) {
    return { status: "error", message: result.error, attempt: prev.attempt + 1 };
  }

  redirect(homePathFor(result.user));
}
