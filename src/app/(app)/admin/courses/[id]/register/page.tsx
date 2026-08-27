import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import { DEFAULT_RATING_THRESHOLD } from "@/lib/support-rubric";
import {
  CoachAttendanceGrid,
  ResultsTable,
  StaffAttendanceGrid,
  type DayColumn,
  type RegisterRow,
  type ResultRow,
} from "./register-forms";

export const metadata = { title: "Attendance register" };

export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      days: { orderBy: { dayNo: "asc" } },
      staff: {
        orderBy: { position: "asc" },
        include: { attendance: true },
      },
      enrollments: {
        orderBy: [{ track: "asc" }, { position: "asc" }],
        include: {
          user: true,
          attendance: true,
          _count: { select: { deliveries: true } },
        },
      },
    },
  });
  if (!course) notFound();

  if (course.days.length === 0) {
    return (
      <>
        <PageHeader
          breadcrumb={{ href: `/admin/courses/${course.id}`, label: course.title }}
          title="Attendance register"
        />
        <EmptyState
          title="This course has no days"
          description="A register needs delivery days to keep. Courses imported from an FQ register bring their nine days with them; add them to a course you created here."
          action={
            <Link href={`/admin/courses/${course.id}`} className="btn-secondary btn-sm">
              Back to the course
            </Link>
          }
        />
      </>
    );
  }

  const threshold = course.ratingThreshold ?? DEFAULT_RATING_THRESHOLD;

  const days: DayColumn[] = course.days.map((day) => ({
    id: day.id,
    dayNo: day.dayNo,
    weekday: day.weekday,
    label: formatDate(day.date),
  }));

  const toRow = (e: (typeof course.enrollments)[number]): RegisterRow => ({
    id: e.id,
    name: displayName(e.user),
    subtitle: e.track === "CATCH_UP" ? e.catchUpNote : e.clubName,
    marks: Object.fromEntries(e.attendance.map((a) => [a.courseDayId, a.present])),
  });

  const main = course.enrollments.filter((e) => e.track === "MAIN");
  const catchUps = course.enrollments.filter((e) => e.track === "CATCH_UP");

  const staffRows: RegisterRow[] = course.staff.map((s) => ({
    id: s.id,
    name: s.name,
    subtitle: s.role,
    marks: Object.fromEntries(s.attendance.map((a) => [a.courseDayId, a.present])),
  }));

  const results: ResultRow[] = course.enrollments.map((e) => ({
    id: e.id,
    name: displayName(e.user),
    subtitle: e.track === "CATCH_UP" ? "Catch-up" : e.clubName,
    rating: e.rating,
    outcome: e.outcome,
    attendanceMet: e.attendanceMet,
    journalComplete: e.journalComplete,
    readiness: e.readiness,
    comments: e.registerComments,
    deliveries: e._count.deliveries,
  }));

  const rated = course.enrollments.filter((e) => e.rating !== null);
  const belowMark = rated.filter((e) => (e.rating ?? 0) < threshold);
  const marks = course.enrollments.flatMap((e) => e.attendance);
  const attendancePct = marks.length
    ? Math.round((marks.filter((a) => a.present).length / marks.length) * 100)
    : null;

  return (
    <>
      <PageHeader
        breadcrumb={{ href: `/admin/courses/${course.id}`, label: course.title }}
        title="Attendance register"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {course.qualification && <Badge tone="muted">{course.qualification}</Badge>}
            {course.stream && <Badge tone="muted">{course.stream}</Badge>}
            <span>
              {course.venue ?? course.location} · {course.days.length} days
            </span>
          </span>
        }
        action={
          <Link href="/admin/support" className="btn-secondary btn-sm">
            Post-course support →
          </Link>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="On the roster" value={main.length} hint={`${catchUps.length} catching up`} />
        <StatTile
          label="Attendance"
          value={attendancePct === null ? "—" : `${attendancePct}%`}
          hint={`${marks.length} marks recorded`}
        />
        <StatTile
          label="Rated"
          value={`${rated.length} of ${course.enrollments.length}`}
          hint={`Pass mark ${threshold}`}
        />
        <StatTile
          label="Below the mark"
          value={belowMark.length}
          tone={belowMark.length ? "warn" : "good"}
          hint="Candidates for post-course support"
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Roster</h2>
        <p className="mb-3 text-sm text-ink-500">
          Tick a box to mark someone present. A day heading marks the whole column at once. Nothing
          is written until you save.
        </p>
        <CoachAttendanceGrid courseId={course.id} days={days} rows={main.map(toRow)} />
      </section>

      {catchUps.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-semibold text-ink-900">Catch-ups and deferrals</h2>
          <p className="mb-3 text-sm text-ink-500">
            Coaches making up hours or deferred in from an earlier intake. Kept apart from the
            roster because their attendance is partial by design.
          </p>
          <CoachAttendanceGrid courseId={course.id} days={days} rows={catchUps.map(toRow)} />
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Course team</h2>
        <p className="mb-3 text-sm text-ink-500">Who was on the grass, and on which days.</p>
        <StaffAttendanceGrid courseId={course.id} days={days} rows={staffRows} />
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Results</h2>
        <p className="mb-3 text-sm text-ink-500">
          The rating is a judgement across everything the coach delivered, not an average of their
          sessions. Changing it moves the outcome with it.
        </p>
        <ResultsTable courseId={course.id} rows={results} threshold={threshold} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Delivery days</h2>
        <div className="card divide-y divide-ink-200">
          {course.days.map((day) => (
            <div key={day.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-ink-900">
                  Day {day.dayNo} · {day.weekday ?? formatDate(day.date)}
                </p>
                <p className="text-xs text-ink-500">
                  {formatDate(day.date)}
                  {day.startTime && ` · ${day.startTime}–${day.endTime ?? ""}`}
                </p>
              </div>
              <Badge tone="muted">
                {course.enrollments.filter((e) =>
                  e.attendance.some((a) => a.courseDayId === day.id && a.present),
                ).length}{" "}
                present
              </Badge>
            </div>
          ))}
        </div>
      </section>

      {belowMark.length > 0 && (
        <p className="mt-6 rounded-lg bg-maroon-50 px-4 py-3 text-sm text-maroon-800">
          {belowMark.length} coach{belowMark.length === 1 ? "" : "es"} on this course{" "}
          {belowMark.length === 1 ? "is" : "are"} rated below {threshold}. The rubric calls that
          post-course support — they appear as candidates on{" "}
          <Link href="/admin/support" className="font-semibold underline">
            the support desk
          </Link>
          , and referring one is a decision, not something the register does on its own.
        </p>
      )}
    </>
  );
}
