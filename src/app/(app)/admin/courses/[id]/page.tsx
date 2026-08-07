import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDateTime, toDateTimeLocal } from "@/lib/format";
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
    },
  });
  if (!course) notFound();

  const coaches = await prisma.user.findMany({
    where: { active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
  });
  const enrolledIds = new Set(course.enrollments.map((e) => e.userId));

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
          <Link href={`/courses/${course.id}`} className="btn-secondary btn-sm">
            View as coach
          </Link>
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
        <section className="card card-pad">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">Roster</h2>
            <form action={enrollAllCoaches}>
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton className="btn-secondary btn-sm" pendingLabel="Enrolling…">
                Enroll all coaches
              </SubmitButton>
            </form>
          </div>

          {coaches.length ? (
            <ul className="divide-y divide-ink-200">
              {coaches.map((coach) => {
                const enrolled = enrolledIds.has(coach.id);
                return (
                  <li key={coach.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {displayName(coach)}
                        {coach.role === "ADMIN" && (
                          <span className="ml-2 text-xs font-normal text-ink-500">admin</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {coach.title ? `${coach.title} · ` : ""}
                        {coach.email}
                      </p>
                    </div>
                    <form action={setEnrollment}>
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="userId" value={coach.id} />
                      <input type="hidden" name="enrolled" value={enrolled ? "false" : "true"} />
                      <SubmitButton
                        className={enrolled ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
                        pendingLabel="…"
                      >
                        {enrolled ? "Remove" : "Enroll"}
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">
              No staff yet.{" "}
              <Link href="/admin/people" className="font-medium text-maroon-700 hover:underline">
                Add coaches
              </Link>
              .
            </p>
          )}
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
