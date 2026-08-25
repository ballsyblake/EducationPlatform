"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storeUpload, UploadError } from "@/lib/uploads";

export type SubmitVideoState = { status: "idle" | "ok" | "error"; message?: string };

/** Only http(s): a link is rendered on an educator's page, so no other scheme. */
function normalizeVideoUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Finds an attempt the signed-in coach is allowed to act on.
 *
 * Their own case, still open, and not yet written up. A coach who is handed an
 * attempt id belonging to someone else gets nothing back.
 */
async function ownAttempt(userId: string, attemptId: string) {
  const attempt = await prisma.supportAttempt.findUnique({
    where: { id: attemptId },
    include: { case: true },
  });
  if (!attempt) return null;
  if (attempt.case.userId !== userId) return null;
  if (attempt.case.status !== "IN_PROGRESS") return null;
  if (attempt.status === "REVIEWED") return null;
  return attempt;
}

/**
 * Submits the coach's session footage for review.
 *
 * Unlike an assignment, this stays editable right up until the educator writes
 * it up. The most likely thing to go wrong with a video submission is the link
 * — private rather than unlisted, or the wrong one pasted — and there is no
 * other channel to fix it through.
 */
export async function submitVideo(
  _prev: SubmitVideoState,
  formData: FormData,
): Promise<SubmitVideoState> {
  const user = await requireUser();
  const attemptId = String(formData.get("attemptId") ?? "");

  const attempt = await ownAttempt(user.id, attemptId);
  if (!attempt) return { status: "error", message: "That assessment isn't open to you." };
  if (attempt.pathway !== "VIDEO_REVIEW") {
    return { status: "error", message: "This assessment is being done live, not on film." };
  }

  const url = normalizeVideoUrl(String(formData.get("videoUrl") ?? "").trim());
  if (!url) {
    return {
      status: "error",
      message: "Paste the full link to your video, starting with https://",
    };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    for (const file of files) {
      await storeUpload(file, { supportAttemptId: attempt.id });
    }
  } catch (error) {
    if (error instanceof UploadError) return { status: "error", message: error.message };
    throw error;
  }

  await prisma.supportAttempt.update({
    where: { id: attempt.id },
    data: {
      videoUrl: url,
      coachNotes: String(formData.get("coachNotes") ?? "").trim() || null,
      status: "SUBMITTED",
      submittedAt: attempt.submittedAt ?? new Date(),
    },
  });

  revalidatePath("/support");
  revalidatePath(`/support/${attempt.caseId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${attempt.caseId}`);
  revalidatePath("/dashboard");

  return {
    status: "ok",
    message: attempt.videoUrl
      ? "Updated. Your educator sees the new link."
      : "Sent. Your educator will review it and their feedback lands here.",
  };
}

/** Removes something the coach attached, while the review is still open. */
export async function removeSupportAttachment(formData: FormData) {
  const user = await requireUser();
  const uploadId = String(formData.get("uploadId") ?? "");

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, supportAttemptOf: { select: { id: true, status: true, caseId: true, case: { select: { userId: true, status: true } } } } },
  });

  const attempt = upload?.supportAttemptOf;
  if (!attempt) return;
  if (attempt.case.userId !== user.id) return;
  if (attempt.case.status !== "IN_PROGRESS" || attempt.status === "REVIEWED") return;

  await prisma.upload.delete({ where: { id: uploadId } });

  revalidatePath(`/support/${attempt.caseId}`);
  revalidatePath(`/admin/support/${attempt.caseId}`);
}
