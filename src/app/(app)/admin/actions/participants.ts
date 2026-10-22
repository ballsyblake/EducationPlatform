"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { applyImport, planImport, type ImportPlan } from "@/lib/participants";

/**
 * Importing an FA participant export onto a cohort's register.
 *
 * Two steps on purpose, in one action. A preview reads and writes nothing; the
 * commit is the same button pressed again with the plan in front of you. The
 * file comes back as text on both, which is why the form keeps it in state
 * rather than in the file input — React 19 resets an uncontrolled form once an
 * action settles, and a preview that cleared the chosen file would mean
 * choosing it again to import it.
 *
 * Admin only. An educator marks the register of a course they are on; who is
 * *on* it is the program's to decide, like every other account question.
 */
export type ParticipantImportState = {
  status: "idle" | "previewed" | "ok" | "error";
  message?: string;
  plan?: ImportPlan;
};

const MAX_CHARS = 2_000_000;

export async function importParticipants(
  _prev: ParticipantImportState,
  formData: FormData,
): Promise<ParticipantImportState> {
  await requireAdmin();

  const courseId = String(formData.get("courseId") ?? "");
  const commit = formData.get("mode") === "commit";
  const text = String(formData.get("csv") ?? "");

  if (!courseId) return { status: "error", message: "No course." };
  if (!text.trim()) {
    return { status: "error", message: "Choose an export, or paste one in." };
  }
  if (text.length > MAX_CHARS) {
    return {
      status: "error",
      message: "That file is far larger than a participant export. Check it is the right one.",
    };
  }

  const plan = await planImport(courseId, text);
  if (plan.error) return { status: "error", message: plan.error, plan };

  if (!commit) {
    const { create, enroll, update, unchanged, skip } = plan.counts;
    return {
      status: "previewed",
      message: `${plan.rows.length} row${plan.rows.length === 1 ? "" : "s"}: ${create} new account${
        create === 1 ? "" : "s"
      }, ${enroll} to enrol, ${update} to update, ${unchanged} already right, ${skip} skipped.`,
      plan,
    };
  }

  const result = await applyImport(courseId, text);

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/admin/courses/${courseId}/register`);
  revalidatePath(`/admin/courses/${courseId}/participants`);
  revalidatePath("/admin/cohorts");
  revalidatePath("/admin/coaches");

  return {
    status: "ok",
    message: `Imported. ${result.created} account${result.created === 1 ? "" : "s"} created, ${
      result.enrolled
    } enrolled, ${result.updated} updated, ${result.unchanged} already right, ${
      result.skipped
    } skipped.`,
    plan: await planImport(courseId, text),
  };
}
