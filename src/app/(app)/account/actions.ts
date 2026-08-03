"use server";

import { revalidatePath } from "next/cache";
import { requireUser, revokeOtherSessions, setUserPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validatePassword, verifyPassword } from "@/lib/password";

export type AccountState = { status: "idle" | "ok" | "error"; message?: string };

export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const problem = validatePassword(next);
  if (problem) return { status: "error", message: problem };

  if (next !== confirm) {
    return { status: "error", message: "The two new passwords don't match." };
  }

  // A coach finishing a temporary password just authenticated with it, so the
  // current password is only re-checked for someone changing one voluntarily.
  if (!user.mustChangePassword) {
    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(current, record.passwordHash))) {
      return { status: "error", message: "Your current password isn't right." };
    }
  }

  if (await verifyPassword(next, user.passwordHash)) {
    return { status: "error", message: "Choose a password you haven't used here before." };
  }

  await setUserPassword(user.id, next);

  // Anyone else holding a session for this account — including whoever handed
  // over the temporary password — is signed out.
  await revokeOtherSessions(user.id);

  revalidatePath("/account");
  return { status: "ok", message: "Password updated." };
}
