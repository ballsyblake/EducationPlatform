import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireCourseAccess } from "@/lib/access";
import { isAdmin, requireUser } from "@/lib/auth";
import { formatDateTime, relativeDue } from "@/lib/format";
import { prisma } from "@/lib/db";
import { formatBytes } from "@/lib/uploads";
import { removeAttachment } from "./actions";
import { SubmissionForm } from "./submission-form";

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!assignment) notFound();
  await requireCourseAccess(user, assignment.courseId);
  if (!assignment.published && !isAdmin(user)) notFound();

  const submission = await prisma.submission.findUnique({
    where: { assignmentId_userId: { assignmentId: id, userId: user.id } },
    include: { files: true, gradedBy: true },
  });

  const due = relativeDue(assignment.dueAt);
  const locked = submission?.status === "SUBMITTED" || submission?.status === "GRADED";
  const graded = submission?.status === "GRADED" && submission.score !== null;

  return (
    <>
      <PageHeader
        breadcrumb={{ href: `/courses/${assignment.courseId}`, label: assignment.course.title }}
        title={assignment.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="muted">{assignment.points} pts</Badge>
            {assignment.dueAt && (
              <Badge tone={due.overdue && !locked ? "bad" : due.soon ? "warn" : "muted"}>
                Due {formatDateTime(assignment.dueAt)}
              </Badge>
            )}
            {locked && !graded && <Badge tone="ok">Turned in</Badge>}
            {graded && <Badge tone="good">Graded</Badge>}
            {submission?.status === "RETURNED" && <Badge tone="warn">Returned for revision</Badge>}
          </span>
        }
        action={
          isAdmin(user) ? (
            <Link
              href={`/admin/grading?assignment=${assignment.id}`}
              className="btn-secondary btn-sm"
            >
              Grade submissions
            </Link>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {assignment.instructions && (
            <section className="card card-pad">
              <h2 className="mb-2 section-title">Instructions</h2>
              <p className="prose-note">{assignment.instructions}</p>
            </section>
          )}

          <section className="card card-pad">
            <h2 className="mb-4 text-lg font-semibold text-ink-900">
              {locked ? "Your submission" : "Submit your work"}
            </h2>

            {locked ? (
              <div className="space-y-4">
                {submission?.text && <p className="prose-note">{submission.text}</p>}
                {submission?.files.length ? (
                  <ul className="space-y-1">
                    {submission.files.map((file) => (
                      <li key={file.id} className="text-sm">
                        <a
                          href={`/api/files/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-maroon-700 hover:underline"
                        >
                          {file.filename}
                        </a>
                        <span className="ml-2 text-xs text-ink-500">
                          {formatBytes(file.size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-ink-500">
                  Turned in {formatDateTime(submission?.submittedAt)}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {submission?.files.length ? (
                  <div>
                    <p className="label">Attached so far</p>
                    <ul className="space-y-1">
                      {submission.files.map((file) => (
                        <li key={file.id} className="flex items-center gap-3 text-sm">
                          <a
                            href={`/api/files/${file.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-maroon-700 hover:underline"
                          >
                            {file.filename}
                          </a>
                          <span className="text-xs text-ink-500">{formatBytes(file.size)}</span>
                          <form action={removeAttachment}>
                            <input type="hidden" name="uploadId" value={file.id} />
                            <input type="hidden" name="assignmentId" value={assignment.id} />
                            <SubmitButton
                              className="text-xs font-medium text-maroon-700 hover:underline"
                              pendingLabel="Removing…"
                            >
                              Remove
                            </SubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <SubmissionForm
                  assignmentId={assignment.id}
                  allowText={assignment.allowText}
                  allowFiles={assignment.allowFiles}
                  defaultText={submission?.text ?? ""}
                />
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card card-pad">
            <h2 className="mb-3 section-title">Feedback</h2>
            {graded ? (
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-maroon-700">{submission.score}</span>
                  <span className="text-sm text-ink-500">/ {assignment.points}</span>
                </div>
                {submission.feedback ? (
                  <p className="prose-note">{submission.feedback}</p>
                ) : (
                  <p className="text-sm text-ink-500">No written comments.</p>
                )}
                <p className="text-xs text-ink-500">
                  Graded {formatDateTime(submission.gradedAt)}
                  {submission.gradedBy && ` by ${submission.gradedBy.name ?? submission.gradedBy.email}`}
                </p>
              </div>
            ) : submission?.status === "RETURNED" ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-status-orange-fg">
                  Sent back for revision — update your work and turn it in again.
                </p>
                {submission.feedback && <p className="prose-note">{submission.feedback}</p>}
              </div>
            ) : locked ? (
              <p className="text-sm text-ink-500">
                Turned in and waiting on your coordinator&apos;s review.
              </p>
            ) : (
              <p className="text-sm text-ink-500">
                Feedback appears here once your work has been reviewed.
              </p>
            )}
          </section>

          <section className="card card-pad">
            <h2 className="mb-2 section-title">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Course</dt>
                <dd className="text-right font-medium text-ink-800">
                  {assignment.course.title}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Points</dt>
                <dd className="font-medium text-ink-800">{assignment.points}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Due</dt>
                <dd className="text-right font-medium text-ink-800">
                  {formatDateTime(assignment.dueAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Accepts</dt>
                <dd className="text-right font-medium text-ink-800">
                  {[assignment.allowText && "Text", assignment.allowFiles && "Files"]
                    .filter(Boolean)
                    .join(" + ") || "—"}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
