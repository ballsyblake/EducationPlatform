import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatTile } from "@/components/ui";
import { dayMinutes, formatHours } from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DayList } from "./day-forms";

export const metadata = { title: "Course days" };

/**
 * The days this cohort is delivered on.
 *
 * Its own page rather than a block on the course settings: the register, the
 * hours every coach is measured against and every make-up all hang off these
 * dates, and editing them is a different job from renaming a course.
 */
export default async function CourseDaysPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      days: {
        orderBy: { dayNo: "asc" },
        select: {
          id: true,
          dayNo: true,
          date: true,
          weekday: true,
          startTime: true,
          endTime: true,
          _count: { select: { attendance: true, staffAttendance: true, makeUps: true } },
        },
      },
    },
  });
  if (!course) notFound();

  const scheduled = course.days.reduce((total, day) => total + dayMinutes(day), 0);
  const untimed = course.days.filter((day) => dayMinutes(day) === 0).length;

  const days = course.days.map((day) => ({
    id: day.id,
    dayNo: day.dayNo,
    // The input wants `yyyy-mm-dd`, and the date is stored at midnight UTC.
    date: day.date.toISOString().slice(0, 10),
    weekday: day.weekday,
    startTime: day.startTime,
    endTime: day.endTime,
    minutes: dayMinutes(day),
    marked: day._count.attendance + day._count.staffAttendance,
    makeUps: day._count.makeUps,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={{ href: `/admin/courses/${course.id}`, label: "Course settings" }}
        title="Course days"
        subtitle={course.title}
        action={
          <Link href={`/admin/courses/${course.id}/register`} className="btn-secondary btn-sm">
            Register
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Days" value={String(days.length)} />
        <StatTile label="Scheduled" value={formatHours(scheduled)} />
        <StatTile
          label="Without times"
          value={String(untimed)}
          tone={untimed ? "warn" : "muted"}
        />
      </div>

      <section className="card card-pad">
        <DayList courseId={course.id} days={days} />
      </section>
    </div>
  );
}
