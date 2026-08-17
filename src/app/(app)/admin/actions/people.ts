"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { createInviteLink, normalizeEmail, requestLoginLink, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDevMailMode } from "@/lib/mailer";

export type PeopleFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  /** A sign-in link for the admin to deliver by hand. Shown once. */
  invite?: {
    url: string;
    qrSvg: string;
    email: string;
    expiresAt: string;
  };
};

async function buildInvite(userId: string, email: string) {
  const { url, expiresAt } = await createInviteLink(userId);
  return {
    url,
    // Inline SVG keeps this working under the app's strict asset rules and
    // needs no round trip to an image service.
    qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, width: 180 }),
    email,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function addStaffMember(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  await requireAdmin();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "COACH") === "ADMIN" ? "ADMIN" : "COACH";
  const sendEmail = formData.get("sendEmail") === "on";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Naming the conflict, because "already on staff" is misleading when the
    // address belongs to the other product and the person is looking at a
    // staff list that no longer shows it.
    if (existing.role === "ASSESSOR") {
      return {
        status: "error",
        message: `${email} is a Club Development assessor. Assessors aren't coach-education staff — use a different address.`,
      };
    }
    if (existing.role === "CLUB") {
      return {
        status: "error",
        message: `${email} is a club administrator in Club Development. Use a different address.`,
      };
    }
    return { status: "error", message: `${email} is already on staff.` };
  }

  const user = await prisma.user.create({ data: { email, name, title, role } });

  if (sendEmail && !isDevMailMode()) {
    await requestLoginLink(email);
    revalidatePath("/admin/people");
    return { status: "ok", message: `${email} added and a sign-in link was emailed.` };
  }

  // Default path: hand the link over yourself, no mail server involved.
  const invite = await buildInvite(user.id, email);
  revalidatePath("/admin/people");
  return {
    status: "ok",
    message: `${email} added. Send them this link to sign in.`,
    invite,
  };
}

/** Issues a fresh sign-in link for a coach — the passwordless equivalent of a reset. */
export async function createSignInLink(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { status: "error", message: "That account no longer exists." };
  if (user.role === "CLUB" || user.role === "ASSESSOR") {
    // Mirrors the guard on the portal side, which won't mint a link for an
    // ADMIN. Neither product hands out sign-in links for the other's accounts.
    return {
      status: "error",
      message: "That's a Club Development account. Issue its link from /cda/cdu.",
    };
  }
  if (!user.active) {
    return { status: "error", message: "Reactivate this account before issuing a link." };
  }

  const invite = await buildInvite(user.id, user.email);
  revalidatePath("/admin/people");
  return { status: "ok", invite };
}

export async function updateStaffMember(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const action = String(formData.get("action"));

  if (userId === admin.id && action !== "update") {
    // Guard against an admin locking themselves out.
    return;
  }

  // Coach-education accounts only, checked here and not merely hidden from the
  // page. Club Development's assessors and club administrators belong to the
  // other product: promoting an assessor from here would hand them every
  // club's assessment, and demoting one to COACH would strip the role their
  // line-item allocations depend on. Those accounts are managed at /cda/cdu.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target || target.role === "CLUB" || target.role === "ASSESSOR") return;

  if (action === "deactivate") {
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    await prisma.session.deleteMany({ where: { userId } });
    // Any link already handed out stops working too.
    await prisma.loginToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
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

export async function emailSignInLink(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email"));
  await requestLoginLink(email);
  revalidatePath("/admin/people");
}
