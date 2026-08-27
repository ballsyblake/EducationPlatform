import Link from "next/link";
import { MaterialList } from "@/components/material-list";
import { TaskList } from "@/components/task-list";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { requireCourseAccess } from "@/lib/access";
import {
  dayMinutes,
  formatHours,
  makeUpBalance,
  MAKE_UP_STATUS,
  summariseAttendance,
} from "@/lib/attendance";
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
      makeUps: { orderBy: { openedAt: "asc" }, include: { courseDay: true } },
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

  const marks = new Map((enrollment?.attendance ?? []).map((a) => [a.courseDayId, a.minutes]));
  const hours = enrollment
    ? summariseAttendance({
        days: course.days,
        attendance: enrollment.attendance,
        makeUps: enrollment.makeUps,
        track: enrollment.track,
      })
    : null;

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
                {hours && hours.requiredMinutes > 0
                  ? `${formatHours(hours.effectiveMinutes)} of ${formatHours(hours.requiredMinutes)} so far`
                  : `${hours?.daysTaken ?? 0} of ${course.days.length} days taken`}
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
              const minutes = marks.get(day.id);
              const scheduled = dayMinutes(day);
              // Three states, not two: a day nobody has marked yet is not the
              // same as a day the coach missed, and a part day is neither.
              const full = minutes !== undefined && minutes > 0 && minutes >= scheduled;
              const partial = minutes !== undefined && minutes > 0 && minutes < scheduled;
              return (
                <li
                  key={day.id}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    full
                      ? "border-status-green-fg/30 bg-status-green-bg text-status-green-fg"
                      : partial
                        ? "border-status-orange-fg/30 bg-status-orange-bg text-status-orange-fg"
                        : minutes === 0
                          ? "border-maroon-300 bg-maroon-50 text-maroon-800"
                          : "border-ink-200 bg-white text-ink-400"
                  }`}
                  title={
                    minutes === undefined
                      ? "Not yet marked"
                      : minutes === 0
                        ? "Absent"
                        : `${formatHours(minutes)} of ${formatHours(scheduled)}`
                  }
                >
                  <span className="font-semibold">Day {day.dayNo}</span>
                  <span className="ml-2">{formatDate(day.date)}</span>
                  {partial && <span className="ml-2 font-semibold">{formatHours(minutes)}</span>}
                </li>
              );
            })}
          </ul>

          {enrollment.makeUps.length > 0 && (
            <div className="mt-4 rounded-lg border border-ink-200 px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-ink-900">
                {enrollment.makeUps.some((m) => makeUpBalance(m) > 0)
                  ? "Hours to make up"
                  : "Hours missed"}
              </p>
              <ul className="space-y-2">
                {enrollment.makeUps.map((m) => {
                  const meta = MAKE_UP_STATUS[m.status];
                  const left = makeUpBalance(m);
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-ink-700">
                        {formatHours(m.minutesOwed)}
                        {m.courseDay && ` · Day ${m.courseDay.dayNo}`}
                        {left > 0 && left !== m.minutesOwed && ` · ${formatHours(left)} still to do`}
                      </span>
                      <span className="text-xs text-ink-500">
                        {/* Once it is settled, how it was made up is the news;
                            until then, where it is being made up is. */}
                        {(left === 0
                          ? (m.creditedNote ?? m.arrangedNote)
                          : (m.arrangedNote ?? m.creditedNote)) ?? meta.blurb}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {enrollment.makeUps.some((m) => makeUpBalance(m) > 0) && (
                <p className="mt-2 text-xs text-ink-500">
                  Speak to your educator about where to make these up — a day on another course
                  counts, and it is recorded here when you sit it.
                </p>
              )}
            </div>
          )}

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
