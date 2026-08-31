import Link from "next/link";
import { Badge, PageHeader, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { isAdmin, requireStaff } from "@/lib/auth";
import { getGradingQueueCounts } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { getSupportQueueCount } from "@/lib/support";
import { CreateCourseForm } from "./create-course-form";

export const metadata = { title: "Manage" };

export default async function AdminPage() {
  const user = await requireStaff();
  // Null for an admin — the absence of a filter — and a list of ids for an
  // educator, who runs the courses they are rostered onto and no others.
  const scope = await staffCourseIds(user);
  const mine = scope === null ? {} : { id: { in: scope } };

  const [courses, queue, coachCount, supportQueue, openCases] = await Promise.all([
    prisma.course.findMany({
      where: mine,
      orderBy: [{ published: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { enrollments: true, assignments: true, quizzes: true, materials: true } },
      },
    }),
    getGradingQueueCounts(scope),
    prisma.user.count({
      where: {
        role: "COACH",
        active: true,
        ...(scope === null ? {} : { enrollments: { some: { courseId: { in: scope } } } }),
      },
    }),
    getSupportQueueCount(new Date(), scope),
    prisma.supportCase.count({
      where: { status: "IN_PROGRESS", ...(scope === null ? {} : { courseId: { in: scope } }) },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={isAdmin(user) ? "Manage program" : "Your courses"}
        subtitle={
          isAdmin(user)
            ? "Courses, coursework, and the staff who see them."
            : "The courses you are rostered onto."
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
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
        <StatTile
          label="In support"
          value={openCases}
          tone={supportQueue ? "warn" : "muted"}
          hint={
            supportQueue
              ? `${supportQueue} deliver${supportQueue === 1 ? "y" : "ies"} to assess`
              : "Open post-course cases"
          }
        />
      </div>

      <div className={`grid gap-6 ${isAdmin(user) ? "lg:grid-cols-[2fr_1fr]" : ""}`}>
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink-900">Courses</h2>
          {courses.length ? (
            <div className="card divide-y divide-ink-200">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  // Course settings are an admin's. An educator's way in is the
                  // register, which is the page they actually work on.
                  href={
                    isAdmin(user)
                      ? `/admin/courses/${course.id}`
                      : `/admin/courses/${course.id}/register`
                  }
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink-900">{course.title}</p>
                      {!course.published && <Badge tone="warn">Draft</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {course.season ? `${course.season} · ` : ""}
                      {course._count.enrollments} enrolled · {course._count.assignments}{" "}
                      assignments · {course._count.quizzes} quizzes · {course._count.materials}{" "}
                      materials
                    </p>
                  </div>
                  <span className="text-sm font-medium text-maroon-700">
                    {isAdmin(user) ? "Manage →" : "Register →"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card card-pad text-sm text-ink-500">
              {isAdmin(user)
                ? "No courses yet — create your first one on the right."
                : "You aren't rostered onto a course yet. An admin adds you to a course team from its register."}
            </div>
          )}
        </section>

        {isAdmin(user) && (
          <aside>
            <h2 className="mb-3 text-lg font-semibold text-ink-900">New course</h2>
            <div className="card card-pad">
              <CreateCourseForm />
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
