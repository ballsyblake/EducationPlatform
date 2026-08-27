import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDate, relativeDue } from "@/lib/format";
import {
  getOverdueVideos,
  getReferralCandidates,
  getSupportQueue,
} from "@/lib/support";
import { PATHWAY_LABEL, stageOf } from "@/lib/support-rubric";
import { ReferralForm } from "./support-forms";

export const metadata = { title: "Post-course support" };

const CASE_STATUS: Record<string, { label: string; tone: "ok" | "good" | "bad" | "muted" }> = {
  IN_PROGRESS: { label: "In progress", tone: "ok" },
  SUCCESSFUL: { label: "Successful", tone: "good" },
  UNSUCCESSFUL: { label: "Not successful", tone: "bad" },
  WITHDRAWN: { label: "Withdrawn", tone: "muted" },
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const admin = await requireAdmin();
  const { show } = await searchParams;
  const includeClosed = show === "all";

  const [queue, overdue, candidates, cases, educators, coaches, courses] = await Promise.all([
    getSupportQueue(),
    getOverdueVideos(),
    getReferralCandidates(),
    prisma.supportCase.findMany({
      where: includeClosed ? {} : { status: "IN_PROGRESS" },
      include: {
        user: true,
        course: true,
        educator: true,
        attempts: { orderBy: { attemptNo: "asc" } },
      },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.user.findMany({
      where: { role: "COACH", active: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.course.findMany({ orderBy: { title: "asc" } }),
  ]);

  const educatorOptions = educators.map((e) => ({ id: e.id, label: displayName(e) }));
  const openCases = cases.filter((c) => c.status === "IN_PROGRESS");

  return (
    <>
      <PageHeader
        title="Post-course support"
        subtitle="Coaches being reassessed on a session they deliver — live, or on film."
        action={
          <Link
            href={includeClosed ? "/admin/support" : "/admin/support?show=all"}
            className="btn-secondary btn-sm"
          >
            {includeClosed ? "Show only open" : "Include closed"}
          </Link>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Open cases" value={openCases.length} />
        <StatTile
          label="Waiting on you"
          value={queue.length}
          tone={queue.length ? "warn" : "good"}
          hint="Film in, or an observation to write up"
        />
        <StatTile
          label="Video overdue"
          value={overdue.length}
          tone={overdue.length ? "bad" : "good"}
          hint="Coaches to chase"
        />
        <StatTile
          label="Not passed, no case"
          value={candidates.length}
          tone={candidates.length ? "warn" : "good"}
        />
      </div>

      {/* --------------------------- The queue ---------------------------- */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Waiting on an educator</h2>
        {queue.length ? (
          <div className="card divide-y divide-ink-200">
            {queue.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/admin/support/${attempt.caseId}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{displayName(attempt.case.user)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {attempt.case.course.title} · {PATHWAY_LABEL[attempt.pathway]} · assessment{" "}
                    {attempt.attemptNo}
                    {attempt.case.educator && ` · ${displayName(attempt.case.educator)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={attempt.status === "SUBMITTED" ? "ok" : "warn"}>
                    {attempt.status === "SUBMITTED"
                      ? attempt.pathway === "VIDEO_REVIEW"
                        ? `Film in ${formatDate(attempt.submittedAt)}`
                        : "Ready to write up"
                      : `Observed ${formatDate(attempt.dueAt)}`}
                  </Badge>
                  <span className="text-sm font-medium text-maroon-700">Review →</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing waiting"
            description="Film that comes in, and observations whose date has passed, land here."
          />
        )}
      </section>

      {/* ------------------------- Overdue video -------------------------- */}
      {overdue.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-ink-900">Video overdue</h2>
          <div className="card divide-y divide-ink-200">
            {overdue.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/admin/support/${attempt.caseId}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{displayName(attempt.case.user)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{attempt.case.course.title}</p>
                </div>
                <Badge tone="bad">{relativeDue(attempt.dueAt).text}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* --------------------- Who hasn't passed -------------------------- */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Rated below the pass mark</h2>
        <p className="mb-3 text-sm text-ink-500">
          Rated on the register under their course&apos;s pass mark — what the rubric itself calls
          post-course support. Nobody is referred automatically; open a case when you&apos;ve had
          the conversation.
        </p>
        {candidates.length ? (
          <div className="space-y-3">
            {candidates.map((candidate) => (
              <details
                key={`${candidate.user.id}-${candidate.result.courseId}`}
                className="card card-pad"
              >
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{displayName(candidate.user)}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {candidate.result.courseTitle}
                      {candidate.user.title ? ` · ${candidate.user.title}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="bad">
                      {candidate.result.rating?.toFixed(1) ?? "—"} · pass mark{" "}
                      {candidate.result.threshold}
                    </Badge>
                    <span className="text-sm font-medium text-maroon-700">Refer →</span>
                  </div>
                </summary>
                <div className="mt-4 border-t border-ink-200 pt-4">
                  <ReferralForm
                    educators={educatorOptions}
                    defaultEducatorId={admin.id}
                    fixed={{
                      userId: candidate.user.id,
                      courseId: candidate.result.courseId,
                      coachName: displayName(candidate.user),
                      courseTitle: candidate.result.courseTitle,
                    }}
                  />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nobody outstanding"
            description="Every rated coach is either above their course's pass mark or already has a case open."
          />
        )}
      </section>

      {/* ----------------------------- Cases ------------------------------ */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">
          {includeClosed ? "All cases" : "Open cases"}
        </h2>
        {cases.length ? (
          <div className="card divide-y divide-ink-200">
            {cases.map((supportCase) => {
              const stage = stageOf(supportCase);
              const status = CASE_STATUS[supportCase.status];
              return (
                <Link
                  key={supportCase.id}
                  href={`/admin/support/${supportCase.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{displayName(supportCase.user)}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {supportCase.course.title} · opened {formatDate(supportCase.openedAt)} ·{" "}
                      {supportCase.attempts.length} of {supportCase.attemptsAllowed} assessment
                      {supportCase.attemptsAllowed === 1 ? "" : "s"} used
                      {supportCase.educator && ` · ${displayName(supportCase.educator)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {supportCase.status === "IN_PROGRESS" ? (
                      <Badge tone={stage.tone}>{stage.label}</Badge>
                    ) : (
                      <Badge tone={status.tone}>{status.label}</Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No support cases"
            description="Refer a coach from the list above, or open a case for someone else below."
          />
        )}
      </section>

      {/* --------------------------- Refer anyone -------------------------- */}
      <section>
        <details className="card card-pad">
          <summary className="cursor-pointer font-semibold text-ink-900">
            Refer a coach who isn&apos;t on that list
          </summary>
          <p className="mt-2 mb-4 text-sm text-ink-500">
            For a course with no pass mark, or a coach you want to see deliver for any other
            reason.
          </p>
          <ReferralForm
            educators={educatorOptions}
            defaultEducatorId={admin.id}
            coaches={coaches.map((c) => ({ id: c.id, label: `${displayName(c)} — ${c.email}` }))}
            courses={courses.map((c) => ({
              id: c.id,
              label: c.season ? `${c.title} (${c.season})` : c.title,
            }))}
          />
        </details>
      </section>
    </>
  );
}
