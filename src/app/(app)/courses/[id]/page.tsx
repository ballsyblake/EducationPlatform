import Link from "next/link";
import { MaterialList } from "@/components/material-list";
import { TaskList } from "@/components/task-list";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { requireCourseAccess } from "@/lib/access";
import { isAdmin, requireUser } from "@/lib/auth";
import { getTasksForCoach, summarizeTasks } from "@/lib/coursework";
import { prisma } from "@/lib/db";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  await requireCourseAccess(user, id);

  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: {
      materials: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { upload: true } },
      _count: { select: { enrollments: true } },
    },
  });

  const tasks = (await getTasksForCoach(user.id)).filter((t) => t.courseId === id);
  const summary = summarizeTasks(tasks);

  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/courses", label: "Courses" }}
        title={course.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {course.season && <Badge tone="muted">{course.season}</Badge>}
            {!course.published && <Badge tone="warn">Unpublished</Badge>}
            <span>{course._count.enrollments} enrolled</span>
          </span>
        }
        action={
          isAdmin(user) ? (
            <Link href={`/admin/courses/${course.id}`} className="btn-secondary btn-sm">
              Manage course
            </Link>
          ) : null
        }
      />

      {course.description && (
        <div className="card card-pad mb-6">
          <p className="prose-note">{course.description}</p>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="card card-pad mb-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="section-title">Your progress in this course</p>
            <p className="text-sm font-semibold text-ink-700">
              {summary.completed} of {summary.total} complete
              {summary.average !== null && ` · ${summary.average}% avg`}
            </p>
          </div>
          <ProgressBar value={summary.completionPct} tone={summary.overdue ? "warn" : "good"} />
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Assigned work</h2>
        {tasks.length ? (
          <TaskList tasks={tasks} />
        ) : (
          <EmptyState
            title="No assignments or quizzes yet"
            description="Coursework posted to this course will appear here."
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">
          Library
          <span className="ml-2 text-sm font-normal text-ink-500">
            session plans, resources and video
          </span>
        </h2>
        {course.materials.length ? (
          <MaterialList materials={course.materials} />
        ) : (
          <EmptyState
            title="Nothing in the library yet"
            description="Session plans, resources and video posted by your coordinator show up here."
          />
        )}
      </section>
    </>
  );
}
