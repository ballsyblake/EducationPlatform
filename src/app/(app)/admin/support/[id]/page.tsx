import Link from "next/link";
import { notFound } from "next/navigation";
import { embedUrl } from "@/components/material-list";
import { SubmitButton } from "@/components/submit-button";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDate, formatDateTime, relativeDue } from "@/lib/format";
import { courseResultsFor, getSupportCase } from "@/lib/support";
import {
  bandFor,
  criterionByCode,
  DEFAULT_RATING_THRESHOLD,
  openAttempt,
  PATHWAY_LABEL,
  stageOf,
  VERDICT_LABEL,
} from "@/lib/support-rubric";
import { formatBytes } from "@/lib/uploads";
import { cancelAttempt, reopenCase } from "../../actions/support";
import {
  ArrangeAttemptForm,
  CaseSettingsForm,
  CloseCaseForm,
  RearrangeForm,
  ReviewForm,
} from "../support-forms";

export const metadata = { title: "Support case" };

const CASE_STATUS: Record<string, { label: string; tone: "ok" | "good" | "bad" | "muted" }> = {
  IN_PROGRESS: { label: "In progress", tone: "ok" },
  SUCCESSFUL: { label: "Successful", tone: "good" },
  UNSUCCESSFUL: { label: "Not successful", tone: "bad" },
  WITHDRAWN: { label: "Withdrawn", tone: "muted" },
};

export default async function SupportCasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const supportCase = await getSupportCase(id);
  if (!supportCase) notFound();

  const [educators, results, enrollment] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    courseResultsFor(supportCase.userId),
    // What the coach was rated on during the course. This is the evidence the
    // referral came out of, and the educator writing up the reassessment should
    // not have to go and find it.
    prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: supportCase.userId, courseId: supportCase.courseId },
      },
      include: { deliveries: { orderBy: { deliveryNo: "asc" } } },
    }),
  ]);

  const result = results.find((r) => r.courseId === supportCase.courseId);
  const current = openAttempt(supportCase.attempts);
  const reviewed = supportCase.attempts.filter((a) => a.status === "REVIEWED");
  const stage = stageOf(supportCase);
  const status = CASE_STATUS[supportCase.status];
  const attemptsLeft = supportCase.attemptsAllowed - supportCase.attempts.length;

  const video = current?.videoUrl ? embedUrl(current.videoUrl) : null;

  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/admin/support", label: "Post-course support" }}
        title={displayName(supportCase.user)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{supportCase.course.title}</span>
            {supportCase.status === "IN_PROGRESS" ? (
              <Badge tone={stage.tone}>{stage.label}</Badge>
            ) : (
              <Badge tone={status.tone}>{status.label}</Badge>
            )}
            <span className="text-xs">
              opened {formatDate(supportCase.openedAt)}
              {supportCase.referredBy && ` by ${displayName(supportCase.referredBy)}`}
            </span>
          </span>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Course rating"
          value={result?.rating == null ? "—" : result.rating.toFixed(1)}
          hint={
            result?.threshold != null
              ? `${VERDICT_LABEL[result.verdict].label} · pass mark ${result.threshold}`
              : "This course isn't rated"
          }
          tone={result?.verdict === "needs_support" ? "bad" : "muted"}
        />
        <StatTile
          label="At referral"
          value={
            supportCase.referredRating === null ? "—" : supportCase.referredRating.toFixed(1)
          }
          hint={bandFor(supportCase.referredRating)?.faRating ?? "Frozen when the case opened"}
        />
        <StatTile
          label="Assessments used"
          value={`${supportCase.attempts.length} of ${supportCase.attemptsAllowed}`}
          tone={attemptsLeft <= 0 ? "warn" : "muted"}
        />
        <StatTile
          label="Educator"
          value={
            <span className="text-base">
              {supportCase.educator ? displayName(supportCase.educator) : "Unassigned"}
            </span>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {supportCase.reason && (
            <section className="card card-pad">
              <h2 className="section-title mb-2">Why they were referred</h2>
              <p className="prose-note">{supportCase.reason}</p>
            </section>
          )}

          {enrollment && enrollment.deliveries.length > 0 && (
            <section className="card card-pad">
              <h2 className="mb-1 text-lg font-semibold text-ink-900">On the course</h2>
              <p className="mb-3 text-sm text-ink-500">
                What was written up during {supportCase.course.title}.
              </p>
              <div className="space-y-3">
                {enrollment.deliveries.map((delivery) => (
                  <details key={delivery.id} className="rounded-lg border border-ink-200 p-3">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-900">
                        Delivery {delivery.deliveryNo}
                        {delivery.topic ? ` — ${delivery.topic}` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-ink-500">
                          {[delivery.block, delivery.component, delivery.assessor]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {delivery.rating !== null && (
                          <Badge tone={bandFor(delivery.rating)?.tone ?? "muted"}>
                            {delivery.rating.toFixed(1)}
                          </Badge>
                        )}
                      </span>
                    </summary>
                    {delivery.comment && (
                      <p className="prose-note mt-3 rounded-lg bg-ink-50 px-3 py-2">
                        {delivery.comment}
                      </p>
                    )}
                    {delivery.actionPlan && (
                      <>
                        <p className="section-title mt-3 mb-1">Action plan</p>
                        <p className="prose-note">{delivery.actionPlan}</p>
                      </>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* ------------------------ The open assessment ------------------- */}
          {current && (
            <section className="card card-pad">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink-900">
                    Assessment {current.attemptNo} — {PATHWAY_LABEL[current.pathway]}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {current.pathway === "LIVE_ASSESSMENT"
                      ? `${formatDateTime(current.dueAt)}${current.venue ? ` · ${current.venue}` : ""}`
                      : current.status === "SUBMITTED"
                        ? `Film submitted ${formatDateTime(current.submittedAt)}`
                        : `Film due ${formatDateTime(current.dueAt)}`}
                  </p>
                </div>
                <Badge tone={stage.tone}>{stage.label}</Badge>
              </div>

              {current.status === "AWAITING_VIDEO" ? (
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
                  Waiting on {displayName(supportCase.user)} to submit their footage.{" "}
                  {relativeDue(current.dueAt).text}.
                </p>
              ) : (
                <div className="space-y-4">
                  {current.videoUrl && (
                    <div className="space-y-2">
                      {video && (
                        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                          <iframe
                            src={video}
                            title="Session delivery"
                            className="h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}
                      <a
                        href={current.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs font-medium text-maroon-700 hover:underline"
                      >
                        {current.videoUrl}
                      </a>
                    </div>
                  )}

                  {current.coachNotes && (
                    <div>
                      <p className="section-title mb-1">From the coach</p>
                      <p className="prose-note rounded-lg bg-ink-50 px-3 py-2">
                        {current.coachNotes}
                      </p>
                    </div>
                  )}

                  {current.files.length > 0 && (
                    <div>
                      <p className="section-title mb-1">Attached</p>
                      <ul className="space-y-1">
                        {current.files.map((file) => (
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
                    </div>
                  )}

                  <div className="border-t border-ink-200 pt-4">
                    <h3 className="mb-3 font-semibold text-ink-900">Write up the assessment</h3>
                    <ReviewForm
                      attemptId={current.id}
                      ratings={current.ratings}
                      defaultFeedback={current.feedback}
                      threshold={
                        supportCase.course.ratingThreshold ?? DEFAULT_RATING_THRESHOLD
                      }
                    />
                  </div>
                </div>
              )}

              <details className="mt-4 border-t border-ink-200 pt-3">
                <summary className="cursor-pointer text-sm font-medium text-ink-600">
                  Change the arrangements
                </summary>
                <div className="mt-3 space-y-4">
                  <RearrangeForm attempt={current} />
                  <form action={cancelAttempt} className="border-t border-ink-200 pt-3">
                    <input type="hidden" name="attemptId" value={current.id} />
                    <SubmitButton
                      className="btn-danger btn-sm"
                      pendingLabel="Cancelling…"
                      confirm="Cancel this assessment? Anything the coach has submitted for it goes with it."
                    >
                      Cancel this assessment
                    </SubmitButton>
                  </form>
                </div>
              </details>
            </section>
          )}

          {/* ------------------------ Arrange the next ---------------------- */}
          {!current && supportCase.status === "IN_PROGRESS" && (
            <section className="card card-pad">
              <h2 className="mb-1 text-lg font-semibold text-ink-900">
                Arrange {supportCase.attempts.length ? "the next assessment" : "an assessment"}
              </h2>
              <p className="mb-4 text-sm text-ink-500">
                {attemptsLeft > 0
                  ? `${attemptsLeft} of ${supportCase.attemptsAllowed} left on this case.`
                  : "Every assessment on this case has been used. Raise the allowance on the right, or close the case."}
              </p>
              {attemptsLeft > 0 && <ArrangeAttemptForm caseId={supportCase.id} />}
            </section>
          )}

          {/* ---------------------------- History --------------------------- */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink-900">Assessments completed</h2>
            {reviewed.length ? (
              <div className="space-y-4">
                {reviewed.map((attempt) => (
                  <div key={attempt.id} className="card card-pad">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink-900">
                          Assessment {attempt.attemptNo} — {PATHWAY_LABEL[attempt.pathway]}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          Reviewed {formatDateTime(attempt.reviewedAt)}
                          {attempt.reviewedBy && ` by ${displayName(attempt.reviewedBy)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {attempt.rating !== null && (
                          <Badge tone={bandFor(attempt.rating)?.tone ?? "muted"}>
                            {attempt.rating.toFixed(1)}
                          </Badge>
                        )}
                        <Badge tone={attempt.outcome === "SUCCESSFUL" ? "good" : "warn"}>
                          {attempt.outcome === "SUCCESSFUL" ? "Successful" : "Not yet successful"}
                        </Badge>
                      </div>
                    </div>

                    {attempt.videoUrl && (
                      <a
                        href={attempt.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-3 block truncate text-xs font-medium text-maroon-700 hover:underline"
                      >
                        {attempt.videoUrl}
                      </a>
                    )}

                    <ul className="mb-3 grid gap-1 sm:grid-cols-2">
                      {attempt.ratings.map((rating) => {
                        const criterion = criterionByCode(rating.code);
                        return (
                          <li key={rating.id} className="flex items-start justify-between gap-2 text-sm">
                            <span className="text-ink-700">{criterion?.title ?? rating.code}</span>
                            <Badge tone={bandFor(rating.rating)?.tone ?? "muted"}>
                              {rating.rating.toFixed(1)}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>

                    {attempt.ratings.some((r) => r.comment) && (
                      <ul className="mb-3 space-y-1">
                        {attempt.ratings
                          .filter((r) => r.comment)
                          .map((r) => (
                            <li key={`c-${r.id}`} className="text-xs text-ink-600">
                              <span className="font-medium">
                                {criterionByCode(r.code)?.title ?? r.code}:
                              </span>{" "}
                              {r.comment}
                            </li>
                          ))}
                      </ul>
                    )}

                    {attempt.feedback && (
                      <p className="prose-note rounded-lg bg-ink-50 px-3 py-2">{attempt.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing assessed yet"
                description="Completed assessments and their marks appear here."
              />
            )}
          </section>
        </div>

        {/* ------------------------------ Aside ----------------------------- */}
        <aside className="space-y-6">
          <section className="card card-pad">
            <h2 className="section-title mb-3">Coach</h2>
            <p className="font-semibold text-ink-900">{displayName(supportCase.user)}</p>
            <p className="text-xs text-ink-500">{supportCase.user.email}</p>
            {supportCase.user.title && (
              <p className="text-xs text-ink-500">{supportCase.user.title}</p>
            )}
            <Link
              href={`/admin/progress?course=${supportCase.courseId}`}
              className="mt-3 inline-block text-sm font-medium text-maroon-700 hover:underline"
            >
              Their coursework →
            </Link>
          </section>

          {supportCase.status !== "IN_PROGRESS" && (
            <section className="card card-pad">
              <h2 className="section-title mb-2">Closed</h2>
              <Badge tone={status.tone}>{status.label}</Badge>
              <p className="mt-2 text-xs text-ink-500">{formatDateTime(supportCase.closedAt)}</p>
              {supportCase.closingNote && (
                <p className="prose-note mt-2">{supportCase.closingNote}</p>
              )}
              <form action={reopenCase} className="mt-3">
                <input type="hidden" name="caseId" value={supportCase.id} />
                <SubmitButton
                  className="btn-secondary btn-sm"
                  pendingLabel="Reopening…"
                  confirm="Reopen this case?"
                >
                  Reopen case
                </SubmitButton>
              </form>
            </section>
          )}

          <section className="card card-pad">
            <h2 className="section-title mb-3">Case settings</h2>
            <CaseSettingsForm
              supportCase={supportCase}
              educators={educators.map((e) => ({ id: e.id, label: displayName(e) }))}
            />
          </section>

          {supportCase.status === "IN_PROGRESS" && (
            <section className="card card-pad">
              <h2 className="section-title mb-3">Close the case</h2>
              <CloseCaseForm caseId={supportCase.id} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
