import Link from "next/link";
import { MaterialList } from "@/components/material-list";
import { TaskList } from "@/components/task-list";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { requireCourseAccess } from "@/lib/access";
import { isAdmin, requireUser } from "@/lib/auth";
import { getTasksForCoach, summarizeTasks } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { bandFor, courseResult, VERDICT_LABEL } from "@/lib/support-rubric";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  await requireCourseAccess(user, id);

  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: {
      materials: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { upload: true } },
      days: { orderBy: { dayNo: "asc" } },
      _count: { select: { enrollments: true } },
    },
  });

  const tasks = (await getTasksForCoach(user.id)).filter((t) => t.courseId === id);
  const summary = summarizeTasks(tasks);

  // The coach's own row of the register: their days, their rating, and the
  // write-up of every session an educator watched them deliver.
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: id } },
    include: {
      attendance: true,
      deliveries: { orderBy: { deliveryNo: "asc" }, include: { assessorUser: true } },
    },
  });

  const result = enrollment
    ? courseResult({
        courseId: id,
        rating: enrollment.rating,
        outcome: enrollment.outcome,
        course: { title: course.title, ratingThreshold: course.ratingThreshold },
      })
    : null;

  const marks = new Map((enrollment?.attendance ?? []).map((a) => [a.courseDayId, a.present]));
  const attended = [...marks.values()].filter(Boolean).length;

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

      {enrollment && course.days.length > 0 && (
        <section className="card card-pad mb-8">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Your register</h2>
              <p className="text-sm text-ink-500">
                {attended} of {course.days.length} days marked present
                {enrollment.track === "CATCH_UP" &&
                  ` · catching up${enrollment.catchUpNote ? ` ${enrollment.catchUpNote}` : ""}`}
              </p>
            </div>
            {result && (
              <div className="text-right">
                <p className="text-2xl font-bold text-ink-900">
                  {result.rating === null ? "—" : result.rating.toFixed(1)}
                  <span className="text-sm font-normal text-ink-500"> / 5</span>
                </p>
                <Badge tone={VERDICT_LABEL[result.verdict].tone}>
                  {VERDICT_LABEL[result.verdict].label}
                </Badge>
              </div>
            )}
          </div>

          <ul className="flex flex-wrap gap-2">
            {course.days.map((day) => {
              const present = marks.get(day.id);
              return (
                <li
                  key={day.id}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    present === true
                      ? "border-status-green-fg/30 bg-status-green-bg text-status-green-fg"
                      : present === false
                        ? "border-maroon-300 bg-maroon-50 text-maroon-800"
                        : "border-ink-200 bg-white text-ink-400"
                  }`}
                  title={
                    present === true ? "Present" : present === false ? "Absent" : "Not yet marked"
                  }
                >
                  <span className="font-semibold">Day {day.dayNo}</span>
                  <span className="ml-2">{formatDate(day.date)}</span>
                </li>
              );
            })}
          </ul>

          {result?.band && (
            <p className="prose-note mt-4 rounded-lg bg-ink-50 px-3 py-2">
              <span className="font-semibold">{result.band.faRating}.</span>{" "}
              {result.band.definition}
            </p>
          )}
        </section>
      )}

      {enrollment && enrollment.deliveries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink-900">
            Your practical deliveries
          </h2>
          <div className="space-y-4">
            {enrollment.deliveries.map((delivery) => (
              <div key={delivery.id} className="card card-pad">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">
                      Delivery {delivery.deliveryNo}
                      {delivery.topic ? ` — ${delivery.topic}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {[
                        delivery.block,
                        delivery.component,
                        delivery.assessor && `assessed by ${delivery.assessor}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {delivery.rating !== null && (
                    <Badge tone={bandFor(delivery.rating)?.tone ?? "muted"}>
                      {delivery.rating.toFixed(1)}
                    </Badge>
                  )}
                </div>

                {delivery.comment && (
                  <p className="prose-note rounded-lg bg-ink-50 px-3 py-2">{delivery.comment}</p>
                )}
                {delivery.actionPlan && (
                  <>
                    <p className="section-title mt-3 mb-1">Action plan</p>
                    <p className="prose-note">{delivery.actionPlan}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
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
