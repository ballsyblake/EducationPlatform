import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDate, formatDateTime, toDateTimeLocal } from "@/lib/format";
import { formatBytes } from "@/lib/uploads";
import {
  deleteAssignment,
  deleteCourse,
  deleteMaterial,
  enrollAllCoaches,
  setEnrollment,
  updateCourse,
} from "../../actions/courses";
import { AssignmentForm, MaterialForm, QuizSettingsForm } from "./course-forms";

export default async function ManageCoursePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      materials: { orderBy: [{ position: "asc" }], include: { upload: true } },
      assignments: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { submissions: true } } },
      },
      quizzes: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { questions: true, attempts: true } } },
      },
      enrollments: { include: { user: true } },
      days: { orderBy: { dayNo: "asc" } },
      staff: { orderBy: { position: "asc" } },
      _count: { select: { days: true } },
    },
  });
  if (!course) notFound();

  // The roster is the people on the course, in the order a person reads a list
  // of names. It used to be every active account in the instance with an
  // Enroll button beside each — a hundred rows, ninety-nine of them noise, and
  // among them the club administrators and assessors who belong to the other
  // product entirely and could never sensibly sit a diploma.
  const roster = course.enrollments
    .map((e) => ({ ...e, label: displayName(e.user) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Adding somebody is now a picker rather than a directory: only accounts that
  // could actually be enrolled, and only the ones that aren't already.
  const enrolledIds = new Set(course.enrollments.map((e) => e.userId));
  const addable = (
    await prisma.user.findMany({
      where: { active: true, role: { in: ["COACH", "EDUCATOR"] } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, title: true, role: true },
    })
  ).filter((u) => !enrolledIds.has(u.id));

  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/admin", label: "Manage" }}
        title={course.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {course.published ? <Badge tone="good">Published</Badge> : <Badge tone="warn">Draft</Badge>}
            <span>{course.enrollments.length} enrolled</span>
          </span>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {course._count.days > 0 && (
              <>
                <Link href={`/admin/courses/${course.id}/assess`} className="btn-primary btn-sm">
                  Attendance &amp; feedback
                </Link>
                <Link
                  href={`/admin/courses/${course.id}/register`}
                  className="btn-secondary btn-sm"
                >
                  Attendance register
                </Link>
              </>
            )}
            <Link href={`/courses/${course.id}`} className="btn-secondary btn-sm">
              View as coach
            </Link>
          </div>
        }
      />

      <div className="space-y-8">
        {/* ------------------------------ Settings ----------------------------- */}
        <section className="card card-pad">
          <h2 className="mb-4 text-lg font-semibold text-ink-900">Course settings</h2>
          <form action={updateCourse} className="space-y-4">
            <input type="hidden" name="courseId" value={course.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="title">
                  Title
                </label>
                <input id="title" name="title" defaultValue={course.title} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="season">
                  Season / term
                </label>
                <input
                  id="season"
                  name="season"
                  defaultValue={course.season ?? ""}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={course.description ?? ""}
                className="input"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="qualification">
                  Qualification
                </label>
                <input
                  id="qualification"
                  name="qualification"
                  defaultValue={course.qualification ?? ""}
                  placeholder="B Diploma"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="stream">
                  Course name
                </label>
                <input
                  id="stream"
                  name="stream"
                  defaultValue={course.stream ?? ""}
                  placeholder="Metro / Regional"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="location">
                  Location
                </label>
                <input
                  id="location"
                  name="location"
                  defaultValue={course.location ?? ""}
                  placeholder="Sunshine Coast"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="venue">
                  Ground
                </label>
                <input
                  id="venue"
                  name="venue"
                  defaultValue={course.venue ?? ""}
                  placeholder="Noosa Lions FC"
                  className="input"
                />
              </div>
            </div>

            <div className="sm:w-1/2">
              <label className="label" htmlFor="passMark">
                Pass mark
              </label>
              <input
                id="passMark"
                name="ratingThreshold"
                type="number"
                min={1}
                max={5}
                step={0.5}
                defaultValue={course.ratingThreshold ?? ""}
                placeholder="Not rated"
                className="input"
              />
              <p className="hint">
                The FQ rating a coach has to reach, out of 5 — 2.5 on every AFC/FA diploma. Leave
                it blank and the course isn&apos;t rated; set it and anyone rated below it shows
                up on{" "}
                <Link href="/admin/support" className="font-medium text-maroon-700 hover:underline">
                  post-course support
                </Link>
                .
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="published"
                defaultChecked={course.published}
                className="accent-maroon-600"
              />
              Published — coaches can see this course
            </label>
            <div className="flex justify-between">
              <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
            </div>
          </form>
        </section>

        {/* ------------------------------- Roster ------------------------------ */}
        {course.days.length > 0 && (
          <section className="card card-pad">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">Delivery days</h2>
                <p className="text-sm text-ink-500">
                  {course.days.length} days
                  {course.staff.length > 0 && ` · ${course.staff.length} on the course team`}
                </p>
              </div>
              <span className="flex flex-wrap gap-2">
                <Link href={`/admin/courses/${course.id}/assess`} className="btn-secondary btn-sm">
                  Take the roll
                </Link>
                <Link
                  href={`/admin/courses/${course.id}/register`}
                  className="btn-secondary btn-sm"
                >
                  Open the register
                </Link>
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {course.days.map((day) => (
                <div key={day.id} className="rounded-lg border border-ink-200 px-3 py-2">
                  <p className="text-xs font-semibold text-ink-700">Day {day.dayNo}</p>
                  <p className="text-xs text-ink-500">
                    {day.weekday ? `${day.weekday}, ` : ""}
                    {formatDate(day.date)}
                  </p>
                  {day.startTime && (
                    <p className="text-xs text-ink-400">
                      {day.startTime}–{day.endTime ?? ""}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {course.staff.length > 0 && (
              <div className="mt-4 border-t border-ink-200 pt-3">
                <p className="section-title mb-2">Course team</p>
                <ul className="flex flex-wrap gap-2">
                  {course.staff.map((member) => (
                    <li key={member.id} className="badge bg-ink-100 text-ink-700">
                      {member.role} · {member.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="card card-pad">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Roster</h2>
              <p className="text-xs text-ink-500">
                {roster.length
                  ? `${roster.length} coach${roster.length === 1 ? "" : "es"} on this course`
                  : "Nobody on this course yet"}
              </p>
            </div>
            <form action={enrollAllCoaches}>
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton
                className="btn-secondary btn-sm"
                pendingLabel="Enrolling…"
                confirm="Enrol every active coach in the system on this course?"
              >
                Enroll all coaches
              </SubmitButton>
            </form>
          </div>

          {roster.length ? (
            <ul className="divide-y divide-ink-200">
              {roster.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar user={entry.user} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {entry.label}
                        {entry.track === "CATCH_UP" && (
                          <span className="ml-2 text-xs font-normal text-ink-500">catch-up</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {entry.clubName ? `${entry.clubName} · ` : ""}
                        {entry.user.email}
                      </p>
                    </div>
                  </div>
                  <form action={setEnrollment}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="userId" value={entry.userId} />
                    <input type="hidden" name="enrolled" value="false" />
                    <SubmitButton
                      className="btn-secondary btn-sm"
                      pendingLabel="…"
                      confirm={`Remove ${entry.label} from this course? Their attendance and result go with them.`}
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">
              Nobody is enrolled yet. Add somebody below, or{" "}
              <Link href="/admin/people" className="font-medium text-maroon-700 hover:underline">
                create their account first
              </Link>
              .
            </p>
          )}

          {/* One row rather than a list of everybody. A course register is read
              far more often than it is edited, and the edit does not need to be
              the loudest thing on the page. */}
          <form
            action={setEnrollment}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink-200 pt-4"
          >
            <input type="hidden" name="courseId" value={course.id} />
            <input type="hidden" name="enrolled" value="true" />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Add a coach</span>
              <select name="userId" defaultValue="" className="input min-w-64 px-2 py-1 text-sm">
                <option value="" disabled>
                  {addable.length ? "Pick an account" : "Everybody is already enrolled"}
                </option>
                {addable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {displayName(u)}
                    {u.role === "EDUCATOR" ? " (educator)" : ""} — {u.email}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton className="btn-primary btn-sm" pendingLabel="Enrolling…" disabled={!addable.length}>
              Enroll
            </SubmitButton>
          </form>
        </section>

        {/* ----------------------------- Assignments --------------------------- */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink-900">Assignments</h2>
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              {course.assignments.length ? (
                course.assignments.map((assignment) => (
                  <div key={assignment.id} className="card card-pad">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/assignments/${assignment.id}`}
                          className="font-medium text-ink-900 hover:underline"
                        >
                          {assignment.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {assignment.points} pts · due {formatDateTime(assignment.dueAt)} ·{" "}
                          {assignment._count.submissions} submission
                          {assignment._count.submissions === 1 ? "" : "s"}
                        </p>
                      </div>
                      {!assignment.published && <Badge tone="warn">Hidden</Badge>}
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-maroon-700">
                        Edit
                      </summary>
                      <div className="mt-3 border-t border-ink-200 pt-3">
                        <AssignmentForm
                          courseId={course.id}
                          assignment={{
                            id: assignment.id,
                            title: assignment.title,
                            instructions: assignment.instructions,
                            points: assignment.points,
                            dueAt: toDateTimeLocal(assignment.dueAt),
                            allowText: assignment.allowText,
                            allowFiles: assignment.allowFiles,
                            published: assignment.published,
                          }}
                        />
                        <form action={deleteAssignment} className="mt-3">
                          <input type="hidden" name="assignmentId" value={assignment.id} />
                          <input type="hidden" name="courseId" value={course.id} />
                          <SubmitButton
                            className="btn-danger btn-sm"
                            pendingLabel="Deleting…"
                            confirm="Delete this assignment and every submission for it?"
                          >
                            Delete assignment
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  </div>
                ))
              ) : (
                <div className="card card-pad text-sm text-ink-500">No assignments yet.</div>
              )}
            </div>

            <div className="card card-pad h-fit">
              <h3 className="mb-4 font-semibold text-ink-900">New assignment</h3>
              <AssignmentForm courseId={course.id} />
            </div>
          </div>
        </section>

        {/* -------------------------------- Quizzes ---------------------------- */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink-900">Quizzes</h2>
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              {course.quizzes.length ? (
                course.quizzes.map((quiz) => (
                  <Link
                    key={quiz.id}
                    href={`/admin/courses/${course.id}/quizzes/${quiz.id}`}
                    className="card card-pad block hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink-900">{quiz.title}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {quiz._count.questions} question
                          {quiz._count.questions === 1 ? "" : "s"} · {quiz._count.attempts} attempt
                          {quiz._count.attempts === 1 ? "" : "s"} · due{" "}
                          {formatDateTime(quiz.dueAt)}
                        </p>
                      </div>
                      {!quiz.published && <Badge tone="warn">Hidden</Badge>}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="card card-pad text-sm text-ink-500">No quizzes yet.</div>
              )}
            </div>

            <div className="card card-pad h-fit">
              <h3 className="mb-4 font-semibold text-ink-900">New quiz</h3>
              <QuizSettingsForm courseId={course.id} />
            </div>
          </div>
        </section>

        {/* -------------------------------- Library ---------------------------- */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink-900">Library</h2>
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              {course.materials.length ? (
                course.materials.map((material) => (
                  <div
                    key={material.id}
                    className="card card-pad flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{material.title}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {material.upload
                          ? `${material.upload.filename} · ${formatBytes(material.upload.size)}`
                          : material.url}
                      </p>
                    </div>
                    <form action={deleteMaterial}>
                      <input type="hidden" name="materialId" value={material.id} />
                      <input type="hidden" name="courseId" value={course.id} />
                      <SubmitButton
                        className="btn-danger btn-sm"
                        pendingLabel="…"
                        confirm="Remove this from the library?"
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                ))
              ) : (
                <div className="card card-pad text-sm text-ink-500">
                  Nothing in the library yet.
                </div>
              )}
            </div>

            <div className="card card-pad h-fit">
              <h3 className="mb-4 font-semibold text-ink-900">Add material</h3>
              <MaterialForm courseId={course.id} />
            </div>
          </div>
        </section>

        {/* ------------------------------ Danger zone -------------------------- */}
        <section className="card card-pad border-maroon-200">
          <h2 className="mb-2 text-lg font-semibold text-ink-900">Delete course</h2>
          <p className="mb-3 text-sm text-ink-500">
            Removes the course along with its assignments, quizzes, submissions, and library.
          </p>
          <form action={deleteCourse}>
            <input type="hidden" name="courseId" value={course.id} />
            <SubmitButton
              className="btn-danger"
              pendingLabel="Deleting…"
              confirm={`Delete "${course.title}" and everything in it? This can't be undone.`}
            >
              Delete course
            </SubmitButton>
          </form>
        </section>
      </div>
    </>
  );
}
