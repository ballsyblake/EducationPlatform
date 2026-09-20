import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { dayMinutes, withinWindow } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import { DayAttendance, type AssessDay, type AttendanceRow } from "../assess-forms";

export const metadata = { title: "Attendance" };

/** A date as a plain day, so today is compared with the day and not the hour. */
const asDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * The roll, on a page of its own.
 *
 * It used to sit above the coaches on the assessor's course page, which put
 * nine days of ticking in front of somebody who had come to write up a session
 * — the thing they do after every block, rather than the thing they do twice a
 * morning. Taking the roll is its own errand: you arrive knowing you are here
 * to do it, you do it, you leave. So it is a page you go to, the same way the
 * full register is.
 */
export default async function AssessAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  await assertCourseStaff(user, id);

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      days: { orderBy: { dayNo: "asc" } },
      enrollments: {
        orderBy: [{ position: "asc" }],
        include: { user: true, attendance: true },
      },
    },
  });
  if (!course) notFound();

  // The roster first, then anybody catching up or deferred in — the order the
  // register reads in, and the order somebody looking for a name expects.
  const roster = [
    ...course.enrollments.filter((e) => e.track === "MAIN"),
    ...course.enrollments.filter((e) => e.track === "CATCH_UP"),
  ];

  const days: AssessDay[] = course.days.map((day) => ({
    id: day.id,
    dayNo: day.dayNo,
    label: `${day.weekday ? `${day.weekday}, ` : ""}${formatDate(day.date)}`,
    minutes: dayMinutes(day),
  }));

  // The day the page opens on: today if the course is running today, otherwise
  // the most recent day it ran — which is the one somebody catching up on
  // paperwork in the evening is looking for.
  const today = asDay(new Date());
  const past = course.days.filter((d) => asDay(d.date) <= today);
  const defaultDayId =
    course.days.find((d) => asDay(d.date) === today)?.id ??
    past.at(-1)?.id ??
    course.days[0]?.id ??
    "";

  const rows: AttendanceRow[] = roster.map((e) => ({
    id: e.id,
    name: displayName(e.user),
    email: e.user.email,
    photoId: e.user.photoId,
    subtitle: e.track === "CATCH_UP" ? e.catchUpNote : e.clubName,
    marks: Object.fromEntries(e.attendance.map((a) => [a.courseDayId, a.minutes])),
    outsideDayIds: course.days
      .filter((d) => !withinWindow(d, e.joinedAt, e.leftAt))
      .map((d) => d.id),
  }));

  const marked = course.days.filter((d) =>
    roster.some((e) => e.attendance.some((a) => a.courseDayId === d.id)),
  ).length;

  return (
    <>
      <PageHeader
        breadcrumb={{ href: `/admin/courses/${course.id}/assess`, label: course.title }}
        title="Attendance"
        subtitle={
          <span>
            {roster.length} coach{roster.length === 1 ? "" : "es"} ·{" "}
            {days.length === 0
              ? "no delivery days yet"
              : `${marked} of ${days.length} days marked`}
          </span>
        }
        action={
          <Link href={`/admin/courses/${course.id}/register`} className="btn-secondary btn-sm">
            Full register →
          </Link>
        }
      />

      <p className="mb-3 text-sm text-ink-500">
        Pick the day and tick who is here. Nothing is written until you save.
      </p>

      {days.length === 0 ? (
        <EmptyState
          title="This course has no days yet"
          description="A register needs delivery days to keep. An admin adds them to the course before the roll can be taken."
        />
      ) : (
        <DayAttendance
          courseId={course.id}
          days={days}
          rows={rows}
          defaultDayId={defaultDayId}
        />
      )}
    </>
  );
}
