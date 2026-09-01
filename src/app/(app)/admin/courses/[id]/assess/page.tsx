import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { assertCourseStaff } from "@/lib/access";
import { isAdmin, requireStaff } from "@/lib/auth";
import { dayMinutes, formatHours, summariseAttendance, withinWindow } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import {
  CoachPanel,
  DayAttendance,
  type AssessDay,
  type AttendanceRow,
  type CoachEntry,
} from "./assess-forms";

export const metadata = { title: "Course" };

/** The numbering the action plan is written with, taken back off for editing. */
function planSteps(actionPlan: string | null) {
  if (!actionPlan) return [];
  return actionPlan
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

/** A date as a plain day, so today is compared with the day and not the hour. */
const asDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * The course page an assessor works from.
 *
 * Three jobs, and nothing else on it: mark who was here today, write up a
 * delivery, say how the coach is going. Everything else a course carries —
 * moves and part intakes, the hours ledger, the result block, the course
 * settings — is the program's paperwork rather than the assessor's, and lives
 * on the full register a link away.
 */
export default async function AssessCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  await assertCourseStaff(user, id);

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      days: { orderBy: { dayNo: "asc" } },
      staff: { orderBy: { position: "asc" } },
      enrollments: {
        orderBy: [{ position: "asc" }],
        include: {
          user: true,
          attendance: true,
          makeUps: true,
          deliveries: { orderBy: { deliveryNo: "asc" } },
        },
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

  const attendanceRows: AttendanceRow[] = roster.map((e) => ({
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

  const coaches: CoachEntry[] = roster.map((e) => {
    const summary = summariseAttendance({
      days: course.days,
      attendance: e.attendance,
      makeUps: e.makeUps,
      track: e.track,
      joinedAt: e.joinedAt,
      leftAt: e.leftAt,
    });
    return {
      id: e.id,
      name: displayName(e.user),
      email: e.user.email,
      photoId: e.user.photoId,
      subtitle: e.track === "CATCH_UP" ? e.catchUpNote : e.clubName,
      catchUp: e.track === "CATCH_UP",
      hours: formatHours(summary.effectiveMinutes),
      hoursOf: formatHours(summary.requiredMinutes),
      comments: e.registerComments,
      deliveries: e.deliveries.map((d) => ({
        id: d.id,
        deliveryNo: d.deliveryNo,
        assessor: d.assessor,
        block: d.block,
        component: d.component,
        topic: d.topic,
        comment: d.comment,
        actions: planSteps(d.actionPlan),
        rating: d.rating,
      })),
    };
  });

  // Who a delivery can be written up as: the course team as the register names
  // them, and the person signed in — who may be standing in for somebody.
  const me = displayName(user);
  const assessors = [...new Set([me, ...course.staff.map((s) => s.name)])];

  const written = coaches.reduce((sum, c) => sum + c.deliveries.length, 0);

  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/admin", label: isAdmin(user) ? "Manage" : "Your courses" }}
        title={course.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {[course.qualification, course.stream, course.venue ?? course.location]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span>
              · {roster.length} coach{roster.length === 1 ? "" : "es"} · {written} deliver
              {written === 1 ? "y" : "ies"} written up
            </span>
          </span>
        }
        action={
          <Link href={`/admin/courses/${course.id}/register`} className="btn-secondary btn-sm">
            Full register →
          </Link>
        }
      />

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Attendance</h2>
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
            rows={attendanceRows}
            defaultDayId={defaultDayId}
          />
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Coaches</h2>
        <p className="mb-3 text-sm text-ink-500">
          Open a coach to write up a delivery you watched, or to leave a general comment about how
          they are going. The write-up is theirs to read on their own course page; the comment
          stays on the register, with the course team.
        </p>
        {coaches.length === 0 ? (
          <EmptyState
            title="Nobody on this course yet"
            description="Coaches appear here as soon as they are enrolled."
          />
        ) : (
          <div className="card divide-y divide-ink-200">
            {coaches.map((coach) => (
              <CoachPanel
                key={coach.id}
                coach={coach}
                assessors={assessors}
                defaultAssessor={me}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
