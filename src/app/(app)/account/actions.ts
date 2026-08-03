"use server";

import { revalidatePath } from "next/cache";
import { requireUser, revokeOtherSessions } from "@/lib/auth";

export async function signOutEverywhere() {
  const user = await requireUser();
  await revokeOtherSessions(user.id);
  revalidatePath("/account");
}
