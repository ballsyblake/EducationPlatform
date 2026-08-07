import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireCourseAccess } from "@/lib/access";
import { isAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, relativeDue } from "@/lib/format";
import { band, percentage } from "@/lib/grading";
import { startAttempt } from "./actions";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { course: true, questions: { select: { points: true, kind: true } } },
  });
  if (!quiz) notFound();
  await requireCourseAccess(user, quiz.courseId);
  if (!quiz.published && !isAdmin(user)) notFound();

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: id, userId: user.id },
    orderBy: { attemptNo: "desc" },
  });

  const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
  const inProgress = attempts.find((a) => a.status === "IN_PROGRESS");
  const attemptsUsed = attempts.length;
  const canStart =
    quiz.questions.length > 0 &&
    (quiz.maxAttempts === null || attemptsUsed < quiz.maxAttempts || Boolean(inProgress));
  const due = relativeDue(quiz.dueAt);

  return (
    <>
      <PageHeader
        breadcrumb={{ href: `/courses/${quiz.courseId}`, label: quiz.course.title }}
        title={quiz.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Quiz</Badge>
            <Badge tone="muted">
              {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} ·{" "}
              {totalPoints} pts
            </Badge>
            {quiz.dueAt && (
              <Badge tone={due.overdue ? "bad" : due.soon ? "warn" : "muted"}>
                Due {formatDateTime(quiz.dueAt)}
              </Badge>
            )}
            <Badge tone="muted">
              {quiz.maxAttempts === null
                ? "Unlimited attempts"
                : `${attemptsUsed} of ${quiz.maxAttempts} attempt${quiz.maxAttempts === 1 ? "" : "s"} used`}
            </Badge>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="card card-pad">
            {quiz.description && <p className="prose-note mb-4">{quiz.description}</p>}

            {quiz.questions.length === 0 ? (
              <p className="text-sm text-ink-500">
                No questions have been added to this quiz yet.
              </p>
            ) : canStart ? (
              <form action={startAttempt}>
                <input type="hidden" name="quizId" value={quiz.id} />
                <SubmitButton pendingLabel="Opening…">
                  {inProgress ? "Resume attempt" : attemptsUsed ? "Start a retake" : "Start quiz"}
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-ink-500">
                You&apos;ve used all {quiz.maxAttempts} attempt
                {quiz.maxAttempts === 1 ? "" : "s"} for this quiz.
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink-900">Your attempts</h2>
            {attempts.length ? (
              <div className="card divide-y divide-ink-200">
                {attempts.map((attempt) => {
                  const pct = percentage(attempt.score, attempt.maxScore);
                  const performance = band(pct);
                  return (
                    <Link
                      key={attempt.id}
                      href={`/quizzes/${quiz.id}/attempt/${attempt.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-ink-50"
                    >
                      <div>
                        <p className="font-medium text-ink-900">Attempt {attempt.attemptNo}</p>
                        <p className="text-xs text-ink-500">
                          {attempt.submittedAt
                            ? `Submitted ${formatDateTime(attempt.submittedAt)}`
                            : `Started ${formatDateTime(attempt.startedAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {attempt.status === "IN_PROGRESS" && <Badge tone="info">In progress</Badge>}
                        {attempt.status === "AWAITING_REVIEW" && (
                          <Badge tone="ok">Awaiting review</Badge>
                        )}
                        {attempt.status === "GRADED" && (
                          <>
                            <Badge tone={performance.tone}>{performance.label}</Badge>
                            <Badge tone="good">
                              {attempt.score}/{attempt.maxScore} ({pct}%)
                            </Badge>
                          </>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="card card-pad text-sm text-ink-500">
                You haven&apos;t taken this quiz yet.
              </div>
            )}
          </section>
        </div>

        <aside className="card card-pad h-fit">
          <h2 className="mb-2 section-title">How grading works</h2>
          <ul className="space-y-2 text-sm text-ink-600">
            <li>Multiple-choice and true/false questions are scored the moment you submit.</li>
            <li>
              Written answers are read by a coordinator, so your score may be marked{" "}
              <em>awaiting review</em> for a bit.
            </li>
            <li>Feedback shows up on this page and under Grades &amp; Feedback.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
