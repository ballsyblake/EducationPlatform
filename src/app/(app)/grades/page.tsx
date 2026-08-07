import Link from "next/link";
import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getTasksForCoach, summarizeTasks } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { band, percentage } from "@/lib/grading";

export const metadata = { title: "Grades & Feedback" };

export default async function GradesPage() {
  const user = await requireUser();
  const tasks = await getTasksForCoach(user.id);
  const summary = summarizeTasks(tasks);

  const [submissions, attempts] = await Promise.all([
    prisma.submission.findMany({
      where: { userId: user.id, status: "GRADED" },
      include: { assignment: { include: { course: true } }, gradedBy: true },
      orderBy: { gradedAt: "desc" },
    }),
    prisma.quizAttempt.findMany({
      where: { userId: user.id, status: { in: ["GRADED", "AWAITING_REVIEW"] } },
      include: { quiz: { include: { course: true } }, gradedBy: true },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  type Entry = {
    key: string;
    href: string;
    title: string;
    course: string;
    kind: string;
    score: number | null;
    max: number | null;
    at: Date | null;
    feedback: string | null;
    grader: string | null;
    pending: boolean;
  };

  const entries: Entry[] = [
    ...submissions.map((s) => ({
      key: `s-${s.id}`,
      href: `/assignments/${s.assignmentId}`,
      title: s.assignment.title,
      course: s.assignment.course.title,
      kind: "Assignment",
      score: s.score,
      max: s.assignment.points,
      at: s.gradedAt,
      feedback: s.feedback,
      grader: s.gradedBy?.name ?? s.gradedBy?.email ?? null,
      pending: false,
    })),
    ...attempts.map((a) => ({
      key: `a-${a.id}`,
      href: `/quizzes/${a.quizId}/attempt/${a.id}`,
      title: `${a.quiz.title} (attempt ${a.attemptNo})`,
      course: a.quiz.course.title,
      kind: "Quiz",
      score: a.score,
      max: a.maxScore,
      at: a.gradedAt ?? a.submittedAt,
      feedback: a.feedback,
      grader: a.gradedBy?.name ?? a.gradedBy?.email ?? null,
      pending: a.status === "AWAITING_REVIEW",
    })),
  ].sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0));

  return (
    <>
      <PageHeader
        title="Grades & Feedback"
        subtitle="Everything that's been scored or reviewed, newest first."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Average"
          value={summary.average === null ? "—" : `${summary.average}%`}
          tone="good"
        />
        <StatTile label="Graded items" value={entries.filter((e) => !e.pending).length} />
        <StatTile
          label="Awaiting review"
          value={summary.awaitingFeedback}
          tone={summary.awaitingFeedback ? "ok" : "muted"}
        />
        <StatTile
          label="Still open"
          value={summary.outstanding}
          tone={summary.outstanding ? "warn" : "good"}
        />
      </div>

      {entries.length ? (
        <div className="space-y-3">
          {entries.map((entry) => {
            const pct = percentage(entry.score, entry.max);
            const performance = band(pct);
            return (
              <Link key={entry.key} href={entry.href} className="card card-pad block hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-500">
                      {entry.kind} · {entry.course}
                    </p>
                    <p className="font-semibold text-ink-900">{entry.title}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {entry.pending
                        ? "Written answers still being reviewed"
                        : `Graded ${formatDateTime(entry.at)}${entry.grader ? ` by ${entry.grader}` : ""}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-ink-900">
                      {entry.score ?? "—"}
                      <span className="text-sm font-normal text-ink-500"> / {entry.max ?? "—"}</span>
                    </p>
                    {!entry.pending && pct !== null && (
                      <p className="text-xs font-medium text-ink-500">
                        {pct}% · {performance.label}
                      </p>
                    )}
                  </div>
                </div>

                {entry.feedback && (
                  <p className="prose-note mt-3 rounded-lg bg-ink-50 px-3 py-2">
                    {entry.feedback}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No grades yet"
          description="Once your assignments and quizzes are reviewed, scores and written feedback land here."
        />
      )}
    </>
  );
}
