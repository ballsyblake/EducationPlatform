import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDateTime, toDateTimeLocal } from "@/lib/format";
import { percentage } from "@/lib/grading";
import { deleteQuestion, deleteQuiz } from "../../../../actions/courses";
import { QuestionForm, QuizSettingsForm } from "../../course-forms";

const KIND_LABEL = {
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE: "True / false",
  SHORT_ANSWER: "Written answer",
} as const;

export default async function QuizBuilderPage({
  params,
}: {
  params: Promise<{ id: string; quizId: string }>;
}) {
  await requireAdmin();
  const { id: courseId, quizId } = await params;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      course: true,
      questions: {
        orderBy: { position: "asc" },
        include: { choices: { orderBy: { position: "asc" } } },
      },
      attempts: {
        orderBy: { submittedAt: "desc" },
        include: { user: true },
      },
    },
  });
  if (!quiz || quiz.courseId !== courseId) notFound();

  const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);

  return (
    <>
      <PageHeader
        breadcrumb={{ href: `/admin/courses/${courseId}`, label: quiz.course.title }}
        title={quiz.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Quiz</Badge>
            <span>
              {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} ·{" "}
              {totalPoints} pts · {quiz.attempts.length} attempt
              {quiz.attempts.length === 1 ? "" : "s"}
            </span>
            {!quiz.published && <Badge tone="warn">Hidden</Badge>}
          </span>
        }
        action={
          <Link href={`/quizzes/${quiz.id}`} className="btn-secondary btn-sm">
            View as coach
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-chalk-900">Questions</h2>
            {quiz.questions.length ? (
              <ol className="space-y-3">
                {quiz.questions.map((question, index) => (
                  <li key={question.id} className="card card-pad">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-chalk-900">
                        <span className="mr-2 text-chalk-400">{index + 1}.</span>
                        {question.prompt}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone="muted">{question.points} pt</Badge>
                        <form action={deleteQuestion}>
                          <input type="hidden" name="questionId" value={question.id} />
                          <input type="hidden" name="quizId" value={quiz.id} />
                          <input type="hidden" name="courseId" value={courseId} />
                          <SubmitButton
                            className="text-xs font-medium text-red-700 hover:underline"
                            pendingLabel="…"
                            confirm="Delete this question? Answers already recorded for it are removed too."
                          >
                            Delete
                          </SubmitButton>
                        </form>
                      </div>
                    </div>

                    <p className="mt-1 text-xs text-chalk-500">{KIND_LABEL[question.kind]}</p>

                    {question.choices.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {question.choices.map((choice) => (
                          <li
                            key={choice.id}
                            className={`rounded px-2 py-1 text-sm ${
                              choice.isCorrect
                                ? "bg-field-50 font-medium text-field-800"
                                : "text-chalk-600"
                            }`}
                          >
                            {choice.text}
                            {choice.isCorrect && (
                              <span className="ml-2 text-xs font-normal">✓ correct</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {question.rationale && (
                      <p className="mt-2 text-xs text-chalk-500">
                        <span className="font-semibold">Explanation:</span> {question.rationale}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="card card-pad text-sm text-chalk-500">
                No questions yet — add the first one on the right.
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-chalk-900">Attempts</h2>
            {quiz.attempts.length ? (
              <div className="card divide-y divide-chalk-200">
                {quiz.attempts.map((attempt) => {
                  const pct = percentage(attempt.score, attempt.maxScore);
                  return (
                    <div
                      key={attempt.id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-chalk-900">
                          {displayName(attempt.user)}
                        </p>
                        <p className="text-xs text-chalk-500">
                          Attempt {attempt.attemptNo} ·{" "}
                          {attempt.submittedAt
                            ? formatDateTime(attempt.submittedAt)
                            : "in progress"}
                        </p>
                      </div>
                      {attempt.status === "AWAITING_REVIEW" ? (
                        <Link href="/admin/grading" className="btn-secondary btn-sm">
                          Review
                        </Link>
                      ) : attempt.status === "GRADED" ? (
                        <Badge tone="good">
                          {attempt.score}/{attempt.maxScore} ({pct}%)
                        </Badge>
                      ) : (
                        <Badge tone="info">In progress</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card card-pad text-sm text-chalk-500">No attempts yet.</div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card card-pad">
            <h2 className="mb-4 font-semibold text-chalk-900">Add a question</h2>
            <QuestionForm quizId={quiz.id} courseId={courseId} />
          </section>

          <section className="card card-pad">
            <h2 className="mb-4 font-semibold text-chalk-900">Quiz settings</h2>
            <QuizSettingsForm
              courseId={courseId}
              quiz={{
                id: quiz.id,
                title: quiz.title,
                description: quiz.description,
                dueAt: toDateTimeLocal(quiz.dueAt),
                maxAttempts: quiz.maxAttempts,
                published: quiz.published,
              }}
            />
            <form action={deleteQuiz} className="mt-4 border-t border-chalk-200 pt-4">
              <input type="hidden" name="quizId" value={quiz.id} />
              <input type="hidden" name="courseId" value={courseId} />
              <SubmitButton
                className="btn-danger btn-sm"
                pendingLabel="Deleting…"
                confirm="Delete this quiz and every attempt on it?"
              >
                Delete quiz
              </SubmitButton>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
