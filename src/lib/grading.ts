import "server-only";

import { prisma } from "@/lib/db";

/**
 * Grades every answer in an attempt that can be graded without a human.
 *
 * Multiple-choice and true/false are scored against the correct choice. Short
 * answers are left with `pointsAwarded: null` and push the attempt into
 * AWAITING_REVIEW so a coordinator reads them.
 */
export async function autoGradeAttempt(attemptId: string) {
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      answers: true,
      quiz: { include: { questions: { include: { choices: true } } } },
    },
  });

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const maxScore = attempt.quiz.questions.reduce((sum, q) => sum + q.points, 0);

  let autoScore = 0;
  let needsReview = false;

  for (const question of attempt.quiz.questions) {
    const answer = answersByQuestion.get(question.id);

    if (question.kind === "SHORT_ANSWER") {
      const hasContent = Boolean(answer?.text?.trim());
      if (hasContent) {
        needsReview = true;
        continue; // A grader assigns the points.
      }
      // Nothing written: zero, no review needed.
      if (answer) {
        await prisma.answer.update({
          where: { id: answer.id },
          data: { isCorrect: false, pointsAwarded: 0 },
        });
      }
      continue;
    }

    const correctChoiceId = question.choices.find((c) => c.isCorrect)?.id;
    const isCorrect = Boolean(answer?.choiceId && answer.choiceId === correctChoiceId);
    const points = isCorrect ? question.points : 0;
    autoScore += points;

    if (answer) {
      await prisma.answer.update({
        where: { id: answer.id },
        data: { isCorrect, pointsAwarded: points },
      });
    } else {
      await prisma.answer.create({
        data: {
          attemptId: attempt.id,
          questionId: question.id,
          isCorrect: false,
          pointsAwarded: 0,
        },
      });
    }
  }

  return prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      status: needsReview ? "AWAITING_REVIEW" : "GRADED",
      submittedAt: attempt.submittedAt ?? new Date(),
      score: autoScore,
      maxScore,
      gradedAt: needsReview ? null : new Date(),
    },
  });
}

/** Recomputes an attempt's total from its answers after manual review. */
export async function recalculateAttemptScore(attemptId: string, graderId: string) {
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      answers: true,
      quiz: { include: { questions: true } },
    },
  });

  const maxScore = attempt.quiz.questions.reduce((sum, q) => sum + q.points, 0);
  const stillUngraded = attempt.answers.some((a) => a.pointsAwarded === null);
  const score = attempt.answers.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0);

  return prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      score,
      maxScore,
      status: stillUngraded ? "AWAITING_REVIEW" : "GRADED",
      gradedAt: stillUngraded ? null : new Date(),
      gradedById: graderId,
    },
  });
}

export function percentage(score: number | null, max: number | null) {
  if (score === null || !max) return null;
  return Math.round((score / max) * 100);
}

/** Letter-free performance band — coaching staffs care about the gist. */
export function band(pct: number | null) {
  if (pct === null) return { label: "—", tone: "muted" as const };
  if (pct >= 90) return { label: "Excellent", tone: "good" as const };
  if (pct >= 75) return { label: "Solid", tone: "ok" as const };
  if (pct >= 60) return { label: "Needs work", tone: "warn" as const };
  return { label: "Re-teach", tone: "bad" as const };
}
