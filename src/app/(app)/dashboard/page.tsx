import Link from "next/link";
import { TaskList } from "@/components/task-list";
import { EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { formatHours, makeUpBalance } from "@/lib/attendance";
import { isAdmin, isStaff, requireUser } from "@/lib/auth";
import { getGradingQueueCounts, getTasksForCoach, summarizeTasks } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { getSupportCasesForCoach, getSupportQueueCount } from "@/lib/support";
import { stageOf } from "@/lib/support-rubric";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const tasks = await getTasksForCoach(user.id);
  const summary = summarizeTasks(tasks);
  // Both queues are scoped: an educator is shown what is waiting on them, not
  // what is waiting on the program.
  const scope = isStaff(user) ? await staffCourseIds(user) : [];
  const queue = isStaff(user) ? await getGradingQueueCounts(scope) : null;
  const supportQueue = isStaff(user) ? await getSupportQueueCount(new Date(), scope) : 0;

  // A coach's open support case outranks everything else on this page: it has a
  // date attached and it is the one thing here they can fall behind on without
  // an overdue badge telling them.
  const supportCases = await getSupportCasesForCoach(user.id);
  const openCase = supportCases.find((c) => c.status === "IN_PROGRESS") ?? null;

  // Hours owed, for the same reason: a coach who missed a day usually finds out
  // it still counts against them months later, when somebody goes to sign off
  // their qualification.
  const owed = isStaff(user)
    ? []
    : await prisma.attendanceMakeUp.findMany({
        where: { status: { in: ["OWED", "ARRANGED"] }, enrollment: { userId: user.id } },
        include: { enrollment: { select: { courseId: true, course: { select: { title: true } } } } },
      });
  const owedMinutes = owed.reduce((sum, m) => sum + makeUpBalance(m), 0);

  const upNext = tasks
    .filter((t) => t.state === "not_started" || t.state === "in_progress")
    .slice(0, 8);
  const recentlyGraded = tasks
    .filter((t) => t.state === "graded")
    .sort((a, b) => (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0))
    .slice(0, 5);

  const courseCount = await prisma.enrollment.count({
    where: { userId: user.id, course: { published: true } },
  });

  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : "Your dashboard"}
        subtitle={
          summary.outstanding > 0
            ? `${summary.outstanding} item${summary.outstanding === 1 ? "" : "s"} still open${
                summary.overdue ? ` · ${summary.overdue} overdue` : ""
              }`
            : "You're all caught up."
        }
      />

      {openCase && (
        <Link
          href={`/support/${openCase.id}`}
          className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-maroon-300 bg-maroon-50 px-5 py-4 transition-colors hover:bg-maroon-100"
        >
          <div>
            <p className="font-semibold text-maroon-800">
              Post-course support · {openCase.course.title}
            </p>
            <p className="text-sm text-maroon-700">{stageOf(openCase).next}</p>
          </div>
          <span className="text-sm font-semibold whitespace-nowrap text-maroon-800">Open →</span>
        </Link>
      )}

      {owedMinutes > 0 && (
        <Link
          href={`/courses/${owed[0].enrollment.courseId}`}
          className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-highlight-orange/40 bg-status-orange-bg px-5 py-4 transition-colors"
        >
          <div>
            <p className="font-semibold text-status-orange-fg">
              {formatHours(owedMinutes)} to make up
            </p>
            <p className="text-sm text-status-orange-fg">
              Time missed on {owed[0].enrollment.course.title}
              {owed.length > 1 && ` and ${owed.length - 1} other`}. Your educator can tell you
              where to sit it.
            </p>
          </div>
          <span className="text-sm font-semibold whitespace-nowrap text-status-orange-fg">
            See your register →
          </span>
        </Link>
      )}

      {supportQueue > 0 && (
        <Link
          href="/admin/support"
          className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-maroon-300 bg-maroon-50 px-5 py-4 transition-colors hover:bg-maroon-100"
        >
          <div>
            <p className="font-semibold text-maroon-800">
              {supportQueue} session deliver{supportQueue === 1 ? "y" : "ies"} to assess
            </p>
            <p className="text-sm text-maroon-700">
              Film that has come in, and observations still to be written up.
            </p>
          </div>
          <span className="text-sm font-semibold whitespace-nowrap text-maroon-800">
            Open support →
          </span>
        </Link>
      )}

      {queue && queue.total > 0 && (
        <Link
          href="/admin/grading"
          className="mb-6 flex items-center justify-between rounded-xl border border-highlight-orange/40 bg-status-orange-bg px-5 py-4 transition-colors hover:bg-status-orange-bg"
        >
          <div>
            <p className="font-semibold text-status-orange-fg">
              {queue.total} item{queue.total === 1 ? "" : "s"} waiting on your feedback
            </p>
            <p className="text-sm text-status-orange-fg">
              {queue.submissions} submission{queue.submissions === 1 ? "" : "s"} ·{" "}
              {queue.attempts} quiz attempt{queue.attempts === 1 ? "" : "s"}
            </p>
          </div>
          <span className="text-sm font-semibold text-status-orange-fg">Open grading →</span>
        </Link>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Courses" value={courseCount} />
        <StatTile
          label="Open items"
          value={summary.outstanding}
          tone={summary.outstanding ? "warn" : "good"}
        />
        <StatTile
          label="Overdue"
          value={summary.overdue}
          tone={summary.overdue ? "bad" : "good"}
        />
        <StatTile
          label="Average"
          value={summary.average === null ? "—" : `${summary.average}%`}
          hint="Across graded work"
          tone="good"
        />
      </div>

      <div className="card card-pad mb-8">
        <div className="mb-2 flex items-center justify-between">
          <p className="section-title">Overall completion</p>
          <p className="text-sm font-semibold text-ink-700">
            {summary.completed} of {summary.total}
          </p>
        </div>
        <ProgressBar value={summary.completionPct} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Up next</h2>
        {upNext.length ? (
          <TaskList tasks={upNext} />
        ) : (
          <EmptyState
            title="Nothing outstanding"
            description={
              summary.total
                ? "Every assignment and quiz assigned to you has been turned in."
                : "You haven't been enrolled in a course yet. Your coordinator assigns coursework."
            }
            action={
              <Link href="/courses" className="btn-secondary btn-sm">
                Browse courses
              </Link>
            }
          />
        )}
      </section>

      {recentlyGraded.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink-900">Recently graded</h2>
            <Link href="/grades" className="text-sm font-medium text-maroon-700 hover:underline">
              All grades &amp; feedback →
            </Link>
          </div>
          <TaskList tasks={recentlyGraded} />
        </section>
      )}
    </>
  );
}
