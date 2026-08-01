"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recalculateAttemptScore } from "@/lib/grading";

export type GradeState = { status: "idle" | "ok" | "error"; message?: string };

/** Scores an assignment submission and writes the coach's feedback. */
export async function gradeSubmission(_prev: GradeState, formData: FormData): Promise<GradeState> {
  const admin = await requireAdmin();
  const submissionId = String(formData.get("submissionId"));
  const feedback = String(formData.get("feedback") ?? "").trim() || null;
  const rawScore = String(formData.get("score") ?? "").trim();

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!submission) return { status: "error", message: "Submission not found." };

  if (rawScore === "") {
    return { status: "error", message: "Enter a score." };
  }
  const score = Number(rawScore);
  if (!Number.isFinite(score) || score < 0 || score > submission.assignment.points) {
    return {
      status: "error",
      message: `Score must be between 0 and ${submission.assignment.points}.`,
    };
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      score,
      feedback,
      status: "GRADED",
      gradedAt: new Date(),
      gradedById: admin.id,
    },
  });

  revalidatePath("/admin/grading");
  revalidatePath("/admin/progress");
  revalidatePath(`/assignments/${submission.assignmentId}`);
  revalidatePath("/grades");
  return { status: "ok", message: "Feedback sent." };
}

/**
 * Scores the short answers in a quiz attempt and adds overall feedback, then
 * rolls the per-answer points back up into the attempt total.
 */
export async function reviewAttempt(_prev: GradeState, formData: FormData): Promise<GradeState> {
  const admin = await requireAdmin();
  const attemptId = String(formData.get("attemptId"));

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: { include: { question: true } },
      quiz: true,
    },
  });
  if (!attempt) return { status: "error", message: "Attempt not found." };

  for (const answer of attempt.answers) {
    if (answer.question.kind !== "SHORT_ANSWER") continue;

    const raw = String(formData.get(`points_${answer.id}`) ?? "").trim();
    if (raw === "") {
      return { status: "error", message: "Score every written answer before saving." };
    }
    const points = Number(raw);
    if (!Number.isFinite(points) || points < 0 || points > answer.question.points) {
      return {
        status: "error",
        message: `Points for each answer must be between 0 and that question's value (${answer.question.points}).`,
      };
    }

    await prisma.answer.update({
      where: { id: answer.id },
      data: {
        pointsAwarded: points,
        isCorrect: points >= answer.question.points,
        graderComment: String(formData.get(`comment_${answer.id}`) ?? "").trim() || null,
      },
    });
  }

  await prisma.quizAttempt.update({
    where: { id: attemptId },
    data: { feedback: String(formData.get("feedback") ?? "").trim() || null },
  });

  await recalculateAttemptScore(attemptId, admin.id);

  revalidatePath("/admin/grading");
  revalidatePath("/admin/progress");
  revalidatePath(`/quizzes/${attempt.quizId}/attempt/${attemptId}`);
  revalidatePath("/grades");
  return { status: "ok", message: "Review saved." };
}

/** Sends a submission back so the coach can revise and resubmit. */
export async function returnForRevision(formData: FormData) {
  const admin = await requireAdmin();
  const submissionId = String(formData.get("submissionId"));
  const feedback = String(formData.get("feedback") ?? "").trim() || null;

  const submission = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      status: "RETURNED",
      submittedAt: null,
      feedback,
      score: null,
      gradedAt: null,
      gradedById: admin.id,
    },
  });

  revalidatePath("/admin/grading");
  revalidatePath(`/assignments/${submission.assignmentId}`);
  revalidatePath("/grades");
}
