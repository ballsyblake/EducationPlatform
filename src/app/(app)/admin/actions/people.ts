"use server";

import { revalidatePath } from "next/cache";
import { normalizeEmail, requestLoginLink, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type PeopleFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  devLink?: string;
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

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { status: "error", message: `${email} is already on staff.` };
  }

  await prisma.user.create({ data: { email, name, title, role } });

  let devLink: string | undefined;
  if (sendInvite) {
    const result = await requestLoginLink(email);
    if (result.ok) devLink = result.devLink;
  }

  revalidatePath("/admin/people");
  return {
    status: "ok",
    message: sendInvite
      ? `${email} added and a sign-in link was sent.`
      : `${email} added. They can request a sign-in link from the login page.`,
    devLink,
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
