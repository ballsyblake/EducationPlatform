import Link from "next/link";
import { TaskList } from "@/components/task-list";
import { EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { formatHours, makeUpBalance } from "@/lib/attendance";
import { isStaff, requireUser } from "@/lib/auth";
import { getTasksForCoach, summarizeTasks } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { deadlineInForce, getSupportCasesForCoach } from "@/lib/support";
import { stageOf } from "@/lib/support-rubric";
import { StaffSummary } from "./staff-summary";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const staff = isStaff(user);
  // Scoped: an educator is shown what is waiting on them, never what is waiting
  // on the program.
  const scope = staff ? await staffCourseIds(user) : [];

  // Their own coursework, which most staff have none of. An educator sitting
  // their own diploma is not unusual, so the coach half of this page stays —
  // it just no longer greets somebody who has never been enrolled with an empty
  // task list and an invitation to go and find a course.
  const courseCount = await prisma.enrollment.count({
    where: { userId: user.id, course: { published: true } },
  });
  const enrolled = courseCount > 0;

  const tasks = enrolled ? await getTasksForCoach(user.id) : [];
  const summary = summarizeTasks(tasks);

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

  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : "Your dashboard"}
        subtitle={
          // Staff are told what is waiting on them below, in figures this line
          // can't hold. A coach's own coursework is the only thing it counts,
          // and saying "you're all caught up" to somebody with a support desk
          // full of overdue cases was the old page in one sentence.
          enrolled && summary.outstanding > 0
            ? `${summary.outstanding} item${summary.outstanding === 1 ? "" : "s"} still open${
                summary.overdue ? ` · ${summary.overdue} overdue` : ""
              }`
            : staff
              ? "What's waiting on you, across the courses you're on."
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
            <p className="text-sm text-maroon-700">
              {stageOf(openCase, deadlineInForce(openCase).date).next}
            </p>
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

      {staff && <StaffSummary scope={scope} />}

      {enrolled && (
        <>
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
                : "No coursework has been set on your course yet."
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
      )}
    </>
  );
}
