import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDateTime } from "@/lib/format";
import { formatBytes } from "@/lib/uploads";
import { returnForRevision } from "../actions/grading";
import { GradeSubmissionForm, ReviewAttemptForm, type ReviewableAnswer } from "./grading-forms";

export const metadata = { title: "Grading" };

export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ assignment?: string; show?: string }>;
}) {
  await requireAdmin();
  const { assignment: assignmentFilter, show } = await searchParams;
  const includeGraded = show === "all";

  const [submissions, attempts] = await Promise.all([
    prisma.submission.findMany({
      where: {
        status: includeGraded ? { in: ["SUBMITTED", "GRADED"] } : "SUBMITTED",
        ...(assignmentFilter ? { assignmentId: assignmentFilter } : {}),
      },
      include: {
        user: true,
        files: true,
        assignment: { include: { course: true } },
      },
      orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
    }),
    prisma.quizAttempt.findMany({
      where: { status: "AWAITING_REVIEW" },
      include: {
        user: true,
        quiz: { include: { course: true } },
        answers: { include: { question: true } },
      },
      orderBy: { submittedAt: "asc" },
    }),
  ]);

  const pendingSubmissions = submissions.filter((s) => s.status === "SUBMITTED");

  return (
    <>
      <PageHeader
        title="Grading"
        subtitle={
          `${pendingSubmissions.length} submission${pendingSubmissions.length === 1 ? "" : "s"} and ` +
          `${attempts.length} quiz attempt${attempts.length === 1 ? "" : "s"} waiting on feedback`
        }
        action={
          <Link
            href={includeGraded ? "/admin/grading" : "/admin/grading?show=all"}
            className="btn-secondary btn-sm"
          >
            {includeGraded ? "Show only pending" : "Include graded"}
          </Link>
        }
      />

      {attempts.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-chalk-900">Quiz attempts to review</h2>
          <div className="space-y-4">
            {attempts.map((attempt) => {
              const shortAnswers: ReviewableAnswer[] = attempt.answers
                .filter((a) => a.question.kind === "SHORT_ANSWER")
                .map((a) => ({
                  id: a.id,
                  prompt: a.question.prompt,
                  text: a.text,
                  maxPoints: a.question.points,
                  pointsAwarded: a.pointsAwarded,
                  graderComment: a.graderComment,
                }));

              return (
                <div key={attempt.id} className="card card-pad">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-chalk-900">{displayName(attempt.user)}</p>
                      <p className="text-xs text-chalk-500">
                        {attempt.quiz.course.title} · {attempt.quiz.title} · attempt{" "}
                        {attempt.attemptNo} · submitted {formatDateTime(attempt.submittedAt)}
                      </p>
                    </div>
                    <Badge tone="ok">
                      Auto-scored {attempt.score ?? 0}/{attempt.maxScore ?? 0}
                    </Badge>
                  </div>

                  <ReviewAttemptForm
                    attemptId={attempt.id}
                    answers={shortAnswers}
                    defaultFeedback={attempt.feedback}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-chalk-900">Assignment submissions</h2>
        {submissions.length ? (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <div key={submission.id} className="card card-pad">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-chalk-900">{displayName(submission.user)}</p>
                    <p className="text-xs text-chalk-500">
                      {submission.assignment.course.title} · {submission.assignment.title} ·
                      submitted {formatDateTime(submission.submittedAt)}
                    </p>
                  </div>
                  {submission.status === "GRADED" ? (
                    <Badge tone="good">
                      Graded {submission.score}/{submission.assignment.points}
                    </Badge>
                  ) : (
                    <Badge tone="warn">Needs feedback</Badge>
                  )}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="section-title mb-2">Submission</p>
                    {submission.text ? (
                      <p className="prose-note rounded-lg bg-chalk-50 px-3 py-2">
                        {submission.text}
                      </p>
                    ) : (
                      <p className="text-sm text-chalk-400">No written response.</p>
                    )}

                    {submission.files.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {submission.files.map((file) => (
                          <li key={file.id} className="text-sm">
                            <a
                              href={`/api/files/${file.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-field-700 hover:underline"
                            >
                              {file.filename}
                            </a>
                            <span className="ml-2 text-xs text-chalk-500">
                              {formatBytes(file.size)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <GradeSubmissionForm
                      submissionId={submission.id}
                      points={submission.assignment.points}
                      defaultScore={submission.score}
                      defaultFeedback={submission.feedback}
                    />

                    {submission.status === "SUBMITTED" && (
                      <details className="mt-4 border-t border-chalk-200 pt-3">
                        <summary className="cursor-pointer text-sm font-medium text-chalk-600">
                          Return for revision instead
                        </summary>
                        <form action={returnForRevision} className="mt-3 space-y-2">
                          <input type="hidden" name="submissionId" value={submission.id} />
                          <textarea
                            name="feedback"
                            rows={2}
                            defaultValue={submission.feedback ?? ""}
                            placeholder="What needs fixing before they turn it in again."
                            className="input"
                          />
                          <SubmitButton
                            className="btn-secondary btn-sm"
                            pendingLabel="Returning…"
                            confirm="Send this back so the coach can revise and resubmit?"
                          >
                            Return for revision
                          </SubmitButton>
                        </form>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing waiting"
            description="Every submission has been graded. New turn-ins land here automatically."
          />
        )}
      </section>
    </>
  );
}
