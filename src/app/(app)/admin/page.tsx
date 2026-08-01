import Link from "next/link";
import { Badge, PageHeader, StatTile } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getGradingQueueCounts } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { CreateCourseForm } from "./create-course-form";

export const metadata = { title: "Manage" };

export default async function AdminPage() {
  await requireAdmin();

  const [courses, queue, coachCount] = await Promise.all([
    prisma.course.findMany({
      orderBy: [{ published: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { enrollments: true, assignments: true, quizzes: true, materials: true } },
      },
    }),
    getGradingQueueCounts(),
    prisma.user.count({ where: { role: "COACH", active: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Manage program"
        subtitle="Courses, coursework, and the staff who see them."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Courses" value={courses.length} />
        <StatTile label="Active coaches" value={coachCount} />
        <StatTile
          label="Needs grading"
          value={queue.total}
          tone={queue.total ? "warn" : "good"}
          hint={`${queue.submissions} submissions · ${queue.attempts} quizzes`}
        />
        <StatTile
          label="Published"
          value={courses.filter((c) => c.published).length}
          hint="Visible to coaches"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-chalk-900">Courses</h2>
          {courses.length ? (
            <div className="card divide-y divide-chalk-200">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/admin/courses/${course.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-chalk-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-chalk-900">{course.title}</p>
                      {!course.published && <Badge tone="warn">Draft</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-chalk-500">
                      {course.season ? `${course.season} · ` : ""}
                      {course._count.enrollments} enrolled · {course._count.assignments}{" "}
                      assignments · {course._count.quizzes} quizzes · {course._count.materials}{" "}
                      materials
                    </p>
                  </div>
                  <span className="text-sm font-medium text-field-700">Manage →</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card card-pad text-sm text-chalk-500">
              No courses yet — create your first one on the right.
            </div>
          )}
        </section>

        <aside>
          <h2 className="mb-3 text-lg font-semibold text-chalk-900">New course</h2>
          <div className="card card-pad">
            <CreateCourseForm />
          </div>
        </aside>
      </div>
    </>
  );
}
