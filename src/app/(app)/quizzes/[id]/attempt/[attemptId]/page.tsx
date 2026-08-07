import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { requireCourseAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { band, percentage } from "@/lib/grading";
import { QuizForm, type QuizQuestion } from "./quiz-form";

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id, attemptId } = await params;
  const user = await requireUser();

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      gradedBy: true,
      answers: true,
      quiz: {
        include: {
          course: true,
          questions: {
            orderBy: { position: "asc" },
            include: { choices: { orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });

  if (!attempt || attempt.quizId !== id || attempt.userId !== user.id) notFound();
  await requireCourseAccess(user, attempt.quiz.courseId);

  const breadcrumb = { href: `/quizzes/${attempt.quizId}`, label: attempt.quiz.title };

  /* ----------------------------- Taking the quiz ---------------------------- */

  if (attempt.status === "IN_PROGRESS") {
    const questions: QuizQuestion[] = attempt.quiz.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      points: q.points,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
    }));

    return (
      <>
        <PageHeader
          breadcrumb={breadcrumb}
          title={`${attempt.quiz.title} — attempt ${attempt.attemptNo}`}
          subtitle="Answer every question, then submit. Written answers are reviewed by a coordinator."
        />
        <QuizForm attemptId={attempt.id} questions={questions} />
      </>
    );
  }

  /* -------------------------------- Results -------------------------------- */

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const pct = percentage(attempt.score, attempt.maxScore);
  const performance = band(pct);
  const awaiting = attempt.status === "AWAITING_REVIEW";

  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb}
        title={`${attempt.quiz.title} — attempt ${attempt.attemptNo}`}
        subtitle={`Submitted ${formatDateTime(attempt.submittedAt)}`}
      />

      <div className="card card-pad mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-title">{awaiting ? "Score so far" : "Score"}</p>
            <p className="mt-1 text-3xl font-bold text-maroon-700">
              {attempt.score ?? 0}
              <span className="text-lg font-normal text-ink-500"> / {attempt.maxScore ?? 0}</span>
              {/* A percentage would understate the result while points are still unawarded. */}
              {!awaiting && pct !== null && (
                <span className="ml-3 text-lg font-semibold text-ink-600">{pct}%</span>
              )}
            </p>
            {awaiting && (
              <p className="mt-1 text-xs text-ink-500">
                Auto-graded questions only — written answers are still being read.
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {awaiting ? (
              <Badge tone="ok">Written answers awaiting review</Badge>
            ) : (
              <Badge tone={performance.tone}>{performance.label}</Badge>
            )}
            {attempt.gradedBy && (
              <span className="text-xs text-ink-500">
                Reviewed by {attempt.gradedBy.name ?? attempt.gradedBy.email}
              </span>
            )}
          </div>
        </div>

        {attempt.feedback && (
          <div className="mt-4 rounded-lg bg-maroon-50 px-4 py-3">
            <p className="mb-1 text-xs font-semibold tracking-wide text-maroon-700 uppercase">
              Coordinator feedback
            </p>
            <p className="prose-note text-maroon-900">{attempt.feedback}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {attempt.quiz.questions.map((question, index) => {
          const answer = answersByQuestion.get(question.id);
          const pending = answer?.pointsAwarded === null || answer?.pointsAwarded === undefined;
          const correctChoiceId = question.choices.find((c) => c.isCorrect)?.id;

          return (
            <section key={question.id} className="card card-pad">
              <div className="mb-3 flex items-start justify-between gap-4">
                <p className="font-medium text-ink-900">
                  <span className="mr-2 text-ink-400">{index + 1}.</span>
                  {question.prompt}
                </p>
                <span className="shrink-0">
                  {pending ? (
                    <Badge tone="ok">Awaiting review</Badge>
                  ) : (
                    <Badge tone={answer?.isCorrect ? "good" : "bad"}>
                      {answer?.pointsAwarded ?? 0} / {question.points}
                    </Badge>
                  )}
                </span>
              </div>

              {question.kind === "SHORT_ANSWER" ? (
                <div className="rounded-lg bg-ink-50 px-3 py-2">
                  <p className="prose-note">
                    {answer?.text?.trim() || <em className="text-ink-400">No answer given</em>}
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {question.choices.map((choice) => {
                    const chosen = answer?.choiceId === choice.id;
                    const correct = choice.id === correctChoiceId;
                    return (
                      <li
                        key={choice.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                          correct
                            ? "border-maroon-300 bg-maroon-50 text-maroon-900"
                            : chosen
                              ? "border-maroon-200 bg-maroon-50 text-maroon-900"
                              : "border-ink-200 text-ink-700"
                        }`}
                      >
                        <span>{choice.text}</span>
                        <span className="shrink-0 text-xs font-medium">
                          {correct && "Correct answer"}
                          {chosen && !correct && "Your answer"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {answer?.graderComment && (
                <p className="mt-3 rounded-lg bg-status-blue-bg px-3 py-2 text-sm text-status-blue-fg">
                  <span className="font-semibold">Note: </span>
                  {answer.graderComment}
                </p>
              )}

              {question.rationale && !pending && (
                <p className="mt-3 text-sm text-ink-600">
                  <span className="font-semibold">Why: </span>
                  {question.rationale}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
