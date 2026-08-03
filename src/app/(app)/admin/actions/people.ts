"use server";

import { revalidatePath } from "next/cache";
import { normalizeEmail, requestLoginLink, requireAdmin, setUserPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateTempPassword, validatePassword } from "@/lib/password";

export type PeopleFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  devLink?: string;
  /** Shown once, so the admin can pass it on. Never stored in plain text. */
  tempPassword?: string;
  tempPasswordFor?: string;
};

export async function addStaffMember(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  await requireAdmin();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "COACH") === "ADMIN" ? "ADMIN" : "COACH";
  const sendInvite = formData.get("sendInvite") === "on";
  const typedPassword = String(formData.get("password") ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (typedPassword) {
    const problem = validatePassword(typedPassword);
    if (problem) return { status: "error", message: problem };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { status: "error", message: `${email} is already on staff.` };
  }

  const user = await prisma.user.create({ data: { email, name, title, role } });

  // Every new account gets a password, so nobody depends on email to get in.
  const password = typedPassword || generateTempPassword();
  await setUserPassword(user.id, password, { temporary: true });

  let devLink: string | undefined;
  if (sendInvite) {
    const result = await requestLoginLink(email);
    if (result.ok) devLink = result.devLink;
  }

  revalidatePath("/admin/people");
  return {
    status: "ok",
    message: `${email} added. Give them this password — they'll be asked to change it on first sign-in.`,
    tempPassword: password,
    tempPasswordFor: email,
    devLink,
  };
}

/** Issues a fresh temporary password, e.g. when a coach is locked out. */
export async function resetPassword(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { status: "error", message: "That account no longer exists." };

  const password = generateTempPassword();
  await setUserPassword(user.id, password, { temporary: true });

  // Force them back through the new password on every device.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  revalidatePath("/admin/people");
  return {
    status: "ok",
    message: `New password for ${user.email}. They'll change it when they sign in.`,
    tempPassword: password,
    tempPasswordFor: user.email,
  };
}

export async function updateStaffMember(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const action = String(formData.get("action"));

  if (userId === admin.id && action !== "update") {
    // Guard against an admin locking themselves out.
    return;
  }

  if (action === "deactivate") {
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    await prisma.session.deleteMany({ where: { userId } });
  } else if (action === "reactivate") {
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
  } else if (action === "make_admin") {
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
  } else if (action === "make_coach") {
    await prisma.user.update({ where: { id: userId }, data: { role: "COACH" } });
  } else if (action === "update") {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: String(formData.get("name") ?? "").trim() || null,
        title: String(formData.get("title") ?? "").trim() || null,
      },
    });
  }

  revalidatePath("/admin/people");
}

export async function resendInvite(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email"));
  await requestLoginLink(email);
  revalidatePath("/admin/people");
}
