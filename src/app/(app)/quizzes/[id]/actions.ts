"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCourseAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { autoGradeAttempt } from "@/lib/grading";

/** Starts a fresh attempt, respecting the quiz's attempt limit. */
export async function startAttempt(formData: FormData) {
  const user = await requireUser();
  const quizId = String(formData.get("quizId"));

  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } });
  await requireCourseAccess(user, quiz.courseId);

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId, userId: user.id },
    orderBy: { attemptNo: "desc" },
  });

  const inProgress = attempts.find((a) => a.status === "IN_PROGRESS");
  if (inProgress) redirect(`/quizzes/${quizId}/attempt/${inProgress.id}`);

  if (quiz.maxAttempts !== null && attempts.length >= quiz.maxAttempts) {
    redirect(`/quizzes/${quizId}`);
  }

  const attempt = await prisma.quizAttempt.create({
    data: { quizId, userId: user.id, attemptNo: (attempts[0]?.attemptNo ?? 0) + 1 },
  });

  redirect(`/quizzes/${quizId}/attempt/${attempt.id}`);
}

export type QuizSubmitState = { status: "idle" | "error"; message?: string };

export async function submitAttempt(
  _prev: QuizSubmitState,
  formData: FormData,
): Promise<QuizSubmitState> {
  const user = await requireUser();
  const attemptId = String(formData.get("attemptId"));

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { include: { questions: true } } },
  });

  if (!attempt || attempt.userId !== user.id) {
    return { status: "error", message: "That attempt isn't available." };
  }
  if (attempt.status !== "IN_PROGRESS") {
    return { status: "error", message: "This attempt has already been submitted." };
  }
  await requireCourseAccess(user, attempt.quiz.courseId);

  for (const question of attempt.quiz.questions) {
    const raw = formData.get(`q_${question.id}`);
    const value = raw === null ? null : String(raw);

    const data =
      question.kind === "SHORT_ANSWER"
        ? { text: value?.trim() || null, choiceId: null }
        : { choiceId: value || null, text: null };

    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: question.id } },
      create: { attemptId, questionId: question.id, ...data },
      update: data,
    });
  }

  await autoGradeAttempt(attemptId);

  revalidatePath("/dashboard");
  revalidatePath("/grades");
  redirect(`/quizzes/${attempt.quizId}/attempt/${attemptId}`);
}
