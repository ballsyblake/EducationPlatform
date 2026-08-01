import Link from "next/link";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getStaffProgress } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { displayName, formatDateTime } from "@/lib/format";

export const metadata = { title: "Progress" };

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  await requireAdmin();
  const { course: courseFilter } = await searchParams;

  const [courses, rows] = await Promise.all([
    prisma.course.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    getStaffProgress(courseFilter),
  ]);

  const staffTotals = rows.reduce(
    (acc, row) => ({
      assigned: acc.assigned + row.summary.total,
      completed: acc.completed + row.summary.completed,
      overdue: acc.overdue + row.summary.overdue,
    }),
    { assigned: 0, completed: 0, overdue: 0 },
  );

  const graded = rows.map((r) => r.summary.average).filter((a): a is number => a !== null);
  const staffAverage = graded.length
    ? Math.round(graded.reduce((sum, a) => sum + a, 0) / graded.length)
    : null;

  const completionPct = staffTotals.assigned
    ? Math.round((staffTotals.completed / staffTotals.assigned) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title="Staff progress"
        subtitle={
          courseFilter
            ? `Filtered to ${courses.find((c) => c.id === courseFilter)?.title ?? "a course"}`
            : "Across every course"
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/progress"
          className={courseFilter ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        >
          All courses
        </Link>
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/admin/progress?course=${course.id}`}
            className={courseFilter === course.id ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {course.title}
          </Link>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Coaches" value={rows.length} />
        <StatTile label="Completion" value={`${completionPct}%`} tone="good" />
        <StatTile
          label="Overdue items"
          value={staffTotals.overdue}
          tone={staffTotals.overdue ? "bad" : "good"}
        />
        <StatTile
          label="Staff average"
          value={staffAverage === null ? "—" : `${staffAverage}%`}
          hint="Mean of individual averages"
        />
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => {
            const openItems = row.tasks
              .filter((t) => t.state === "not_started" || t.state === "in_progress")
              .slice(0, 4);
            const overdue = row.summary.overdue;

            return (
              <div key={row.user.id} className="card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-chalk-900">{displayName(row.user)}</p>
                    <p className="text-xs text-chalk-500">
                      {row.user.title ? `${row.user.title} · ` : ""}
                      {row.user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {overdue > 0 && <Badge tone="bad">{overdue} overdue</Badge>}
                    {row.summary.awaitingFeedback > 0 && (
                      <Badge tone="ok">{row.summary.awaitingFeedback} awaiting feedback</Badge>
                    )}
                    <Badge tone={row.summary.average === null ? "muted" : "good"}>
                      {row.summary.average === null ? "No grades" : `${row.summary.average}% avg`}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar
                    value={row.summary.completionPct}
                    tone={overdue ? "warn" : "good"}
                  />
                  <span className="text-xs font-semibold whitespace-nowrap text-chalk-600">
                    {row.summary.completed}/{row.summary.total}
                  </span>
                </div>

                {openItems.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {openItems.map((task) => {
                      const late = task.dueAt && task.dueAt < new Date();
                      return (
                        <li key={`${task.kind}-${task.id}`}>
                          <span
                            className={`badge ${
                              late ? "bg-red-100 text-red-800" : "bg-chalk-100 text-chalk-600"
                            }`}
                            title={task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : "No due date"}
                          >
                            {task.title}
                          </span>
                        </li>
                      );
                    })}
                    {row.summary.outstanding > openItems.length && (
                      <li className="badge bg-chalk-100 text-chalk-500">
                        +{row.summary.outstanding - openItems.length} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No coaches to track yet"
          description="Add staff and enroll them in a course to see completion here."
          action={
            <Link href="/admin/people" className="btn-primary btn-sm">
              Add staff
            </Link>
          }
        />
      )}
    </>
  );
}
