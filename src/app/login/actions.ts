"use server";

import { redirect } from "next/navigation";
import { requestLoginLink, signInWithPassword } from "@/lib/auth";

export type LoginFormState = {
  status: "idle" | "sent" | "error";
  message?: string;
  /** Only populated when running without SMTP configured. */
  devLink?: string;
};

export async function signIn(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await signInWithPassword(email, password);
  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  // A temporary password only gets you as far as choosing a real one.
  redirect(result.mustChangePassword ? "/account?first=1" : "/dashboard");
}

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
