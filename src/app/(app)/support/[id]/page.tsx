import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { displayName, formatDateTime, relativeDue } from "@/lib/format";
import { getSupportCase } from "@/lib/support";
import {
  criteriaByGroup,
  criterionByCode,
  openAttempt,
  PATHWAY_DESCRIPTION,
  PATHWAY_LABEL,
  RATING_LEVELS,
  stageOf,
} from "@/lib/support-rubric";
import { formatBytes } from "@/lib/uploads";
import { removeSupportAttachment } from "../actions";
import { VideoSubmissionForm } from "../video-form";

export const metadata = { title: "Support" };

export default async function CoachSupportCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const supportCase = await getSupportCase(id);
  // A case belonging to someone else is a 404, not a 403 — the same rule the
  // rest of the app follows about revealing that a thing exists.
  if (!supportCase || supportCase.userId !== user.id) notFound();

  const stage = stageOf(supportCase);
  const current = openAttempt(supportCase.attempts);
  const reviewed = supportCase.attempts.filter((a) => a.status === "REVIEWED");

  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/support", label: "Post-course support" }}
        title={supportCase.course.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={stage.tone}>{stage.label}</Badge>
            {current && <span className="text-xs">{PATHWAY_LABEL[current.pathway]}</span>}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="card card-pad">
            <h2 className="mb-2 text-lg font-semibold text-ink-900">Where this is up to</h2>
            <p className="prose-note">{stage.next}</p>
            {supportCase.reason && (
              <>
                <p className="section-title mt-4 mb-1">Why you were referred</p>
                <p className="prose-note rounded-lg bg-ink-50 px-3 py-2">{supportCase.reason}</p>
              </>
            )}
          </section>

          {/* --------------------- The live assessment ---------------------- */}
          {current?.pathway === "LIVE_ASSESSMENT" && (
            <section className="card card-pad">
              <h2 className="mb-2 text-lg font-semibold text-ink-900">Your assessment</h2>
              <p className="text-sm text-ink-600">
                {PATHWAY_DESCRIPTION.LIVE_ASSESSMENT}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">When</dt>
                  <dd className="text-right font-medium text-ink-800">
                    {formatDateTime(current.dueAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Where</dt>
                  <dd className="text-right font-medium text-ink-800">{current.venue ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Educator</dt>
                  <dd className="text-right font-medium text-ink-800">
                    {supportCase.educator ? displayName(supportCase.educator) : "To be confirmed"}
                  </dd>
                </div>
              </dl>
              <p className="hint">
                {relativeDue(current.dueAt).text}. If the session moves, tell your educator — they
                change the booking here.
              </p>
            </section>
          )}

          {/* --------------------- The video submission --------------------- */}
          {current?.pathway === "VIDEO_REVIEW" && (
            <section className="card card-pad">
              <h2 className="mb-2 text-lg font-semibold text-ink-900">
                {current.status === "SUBMITTED" ? "Your submission" : "Submit your session"}
              </h2>
              <p className="mb-4 text-sm text-ink-600">
                {current.status === "SUBMITTED"
                  ? "This is with your educator. You can still change the link or your notes until they write it up."
                  : `${PATHWAY_DESCRIPTION.VIDEO_REVIEW} Due ${formatDateTime(current.dueAt)} — ${relativeDue(current.dueAt).text.toLowerCase()}.`}
              </p>

              {current.files.length > 0 && (
                <div className="mb-4">
                  <p className="label">Attached so far</p>
                  <ul className="space-y-1">
                    {current.files.map((file) => (
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
                        <form action={removeSupportAttachment}>
                          <input type="hidden" name="uploadId" value={file.id} />
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
              )}

              <VideoSubmissionForm
                attemptId={current.id}
                defaultUrl={current.videoUrl ?? ""}
                defaultNotes={current.coachNotes ?? ""}
                resubmitting={current.status === "SUBMITTED"}
              />
            </section>
          )}

          {/* ------------------------- Past assessments --------------------- */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink-900">Feedback</h2>
            {reviewed.length ? (
              <div className="space-y-4">
                {reviewed
                  .slice()
                  .sort((a, b) => b.attemptNo - a.attemptNo)
                  .map((attempt) => (
                    <div key={attempt.id} className="card card-pad">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink-900">
                            Assessment {attempt.attemptNo} — {PATHWAY_LABEL[attempt.pathway]}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {formatDateTime(attempt.reviewedAt)}
                            {attempt.reviewedBy && ` · ${displayName(attempt.reviewedBy)}`}
                          </p>
                        </div>
                        <Badge tone={attempt.outcome === "SUCCESSFUL" ? "good" : "warn"}>
                          {attempt.outcome === "SUCCESSFUL" ? "Successful" : "Not yet successful"}
                        </Badge>
                      </div>

                      {attempt.feedback && (
                        <p className="prose-note mb-3 rounded-lg bg-ink-50 px-3 py-2">
                          {attempt.feedback}
                        </p>
                      )}

                      <ul className="space-y-1.5">
                        {attempt.ratings.map((rating) => {
                          const criterion = criterionByCode(rating.code);
                          const level = RATING_LEVELS.find((l) => l.value === rating.level);
                          return (
                            <li key={rating.id}>
                              <div className="flex items-start justify-between gap-2 text-sm">
                                <span className="text-ink-700">
                                  {criterion?.title ?? rating.code}
                                </span>
                                <Badge tone={level?.tone ?? "muted"}>
                                  {level?.label ?? rating.level}
                                </Badge>
                              </div>
                              {rating.comment && (
                                <p className="mt-0.5 text-xs text-ink-500">{rating.comment}</p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing assessed yet"
                description="Your educator's marks and written feedback land here once your delivery has been reviewed."
              />
            )}
          </section>
        </div>

        {/* ------------------------------ Aside ----------------------------- */}
        <aside className="space-y-6">
          {supportCase.status !== "IN_PROGRESS" && supportCase.closingNote && (
            <section className="card card-pad">
              <h2 className="section-title mb-2">From your educator</h2>
              <p className="prose-note">{supportCase.closingNote}</p>
              <p className="mt-2 text-xs text-ink-500">{formatDateTime(supportCase.closedAt)}</p>
            </section>
          )}

          <section className="card card-pad">
            <h2 className="section-title mb-1">What you&apos;re assessed on</h2>
            <p className="mb-3 text-xs text-ink-500">
              The same eight, whether an educator is on the touchline or watching your film.
            </p>
            <div className="space-y-3">
              {criteriaByGroup().map(({ group, criteria }) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-ink-700">{group}</p>
                  <ul className="mt-1 space-y-1">
                    {criteria.map((criterion) => (
                      <li key={criterion.code} className="text-xs text-ink-600">
                        <span className="font-medium text-ink-800">{criterion.title}</span> —{" "}
                        {criterion.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {supportCase.educator && (
            <section className="card card-pad">
              <h2 className="section-title mb-2">Your educator</h2>
              <p className="font-semibold text-ink-900">{displayName(supportCase.educator)}</p>
              <a
                href={`mailto:${supportCase.educator.email}`}
                className="text-sm font-medium text-maroon-700 hover:underline"
              >
                {supportCase.educator.email}
              </a>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
