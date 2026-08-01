"use server";

import { revalidatePath } from "next/cache";
import { requireCourseAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUpload, storeUpload, UploadError } from "@/lib/uploads";

export type SubmissionFormState = {
  status: "idle" | "saved" | "submitted" | "error";
  message?: string;
};

async function loadAssignment(assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { course: true },
  });
  if (!assignment) throw new Error("Assignment not found.");
  return assignment;
}

async function upsertSubmission(
  assignmentId: string,
  userId: string,
  formData: FormData,
  finalize: boolean,
): Promise<SubmissionFormState> {
  const user = await requireUser();
  const assignment = await loadAssignment(assignmentId);
  await requireCourseAccess(user, assignment.courseId);

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_userId: { assignmentId, userId } },
    include: { files: true },
  });

  if (existing && (existing.status === "SUBMITTED" || existing.status === "GRADED")) {
    return { status: "error", message: "This assignment has already been turned in." };
  }

  const text = assignment.allowText ? String(formData.get("text") ?? "").trim() : "";

  const submission =
    existing ??
    (await prisma.submission.create({
      data: { assignmentId, userId, status: "DRAFT" },
      include: { files: true },
    }));

  // Attach any new files before validating, so a failed submit doesn't lose them.
  if (assignment.allowFiles) {
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    try {
      for (const file of files) {
        await storeUpload(file, { submissionId: submission.id });
      }
    } catch (error) {
      const message =
        error instanceof UploadError ? error.message : "That file couldn't be uploaded.";
      await prisma.submission.update({ where: { id: submission.id }, data: { text } });
      return { status: "error", message };
    }
  }

  const fileCount = await prisma.upload.count({ where: { submissionId: submission.id } });

  if (finalize && !text && fileCount === 0) {
    await prisma.submission.update({ where: { id: submission.id }, data: { text } });
    return {
      status: "error",
      message: "Add a written response or attach a file before turning this in.",
    };
  }

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      text,
      status: finalize ? "SUBMITTED" : "DRAFT",
      submittedAt: finalize ? new Date() : null,
    },
  });

  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/dashboard");
  revalidatePath("/grades");

  return finalize
    ? { status: "submitted", message: "Turned in. Your coordinator will review it." }
    : { status: "saved", message: "Draft saved." };
}

export async function saveDraft(
  _prev: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const user = await requireUser();
  const assignmentId = String(formData.get("assignmentId"));
  const intent = String(formData.get("intent") ?? "save");
  return upsertSubmission(assignmentId, user.id, formData, intent === "submit");
}

export async function removeAttachment(formData: FormData) {
  const user = await requireUser();
  const uploadId = String(formData.get("uploadId"));
  const assignmentId = String(formData.get("assignmentId"));

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { submissionFileOf: true },
  });

  // Only the author of an un-submitted draft can detach a file.
  if (
    upload?.submissionFileOf &&
    upload.submissionFileOf.userId === user.id &&
    upload.submissionFileOf.status === "DRAFT"
  ) {
    await deleteUpload(uploadId);
  }

  revalidatePath(`/assignments/${assignmentId}`);
}
