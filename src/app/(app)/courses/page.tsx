import Link from "next/link";
import { EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getTasksForCoach, summarizeTasks } from "@/lib/coursework";
import { prisma } from "@/lib/db";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const user = await requireUser();

  const [enrollments, tasks] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: user.id, course: { published: true } },
      include: {
        course: {
          include: {
            _count: { select: { materials: true, assignments: true, quizzes: true } },
          },
        },
      },
      orderBy: { course: { title: "asc" } },
    }),
    getTasksForCoach(user.id),
  ]);

  if (!enrollments.length) {
    return (
      <>
        <PageHeader title="Courses" />
        <EmptyState
          title="No courses yet"
          description="Once a coordinator enrolls you, your install packets, assignments, and quizzes show up here."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={`${enrollments.length} course${enrollments.length === 1 ? "" : "s"} assigned to you`}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {enrollments.map(({ course }) => {
          const summary = summarizeTasks(tasks.filter((t) => t.courseId === course.id));

          return (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="card card-pad transition-shadow hover:shadow-md"
            >
              <div className="mb-3">
                {course.season && <p className="section-title">{course.season}</p>}
                <h2 className="text-lg font-semibold text-ink-900">{course.title}</h2>
                {course.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">{course.description}</p>
                )}
              </div>

              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                <span>{course._count.materials} materials</span>
                <span>{course._count.assignments} assignments</span>
                <span>{course._count.quizzes} quizzes</span>
              </div>

              <div className="flex items-center gap-3">
                <ProgressBar
                  value={summary.completionPct}
                  tone={summary.overdue ? "warn" : "good"}
                />
                <span className="text-xs font-semibold whitespace-nowrap text-ink-600">
                  {summary.completionPct}%
                </span>
              </div>
              {summary.overdue > 0 && (
                <p className="mt-2 text-xs font-medium text-maroon-700">
                  {summary.overdue} overdue item{summary.overdue === 1 ? "" : "s"}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
