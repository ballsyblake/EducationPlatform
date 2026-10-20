import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { assertCourseStaff } from "@/lib/access";
import { isAdmin, requireStaff } from "@/lib/auth";
import { dayMinutes, formatHours, summariseAttendance, withinWindow } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import { DEFAULT_RATING_THRESHOLD } from "@/lib/support-rubric";
import { CourseRoster, type AssessDay, type RosterEntry } from "./assess-forms";

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
 * delivery, say how the coach is going. All three happen on one roster, one row
 * per coach — this was a roll and then the same names again underneath, which
 * is one list too many to work a course off.
 *
 * Everything else a course carries — moves and part intakes, the hours ledger,
 * the result block, the course settings — is the program's paperwork rather
 * than the assessor's, and lives on the full register, which is an admin's link
 * from here and not an educator's.
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
          deliveries: {
            orderBy: { deliveryNo: "asc" },
            include: {
              // The count rather than the rows: the roster needs to know a
              // scoresheet exists, and the scores themselves are read on the
              // page that edits them.
              _count: { select: { scores: true } },
              // Film is the other way round — the notes are posted and read on
              // this page, so they come with it.
              footage: {
                orderBy: { createdAt: "asc" },
                include: {
                  notes: { orderBy: { atSeconds: "asc" }, include: { author: true } },
                },
              },
            },
          },
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

  const entries: RosterEntry[] = roster.map((e) => {
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
      rating: e.rating,
      outcome: e.outcome,
      comments: e.registerComments,
      marks: Object.fromEntries(e.attendance.map((a) => [a.courseDayId, a.minutes])),
      outsideDayIds: course.days
        .filter((d) => !withinWindow(d, e.joinedAt, e.leftAt))
        .map((d) => d.id),
      deliveries: e.deliveries.map((d) => ({
        id: d.id,
        deliveryNo: d.deliveryNo,
        assessor: d.assessor,
        block: d.block,
        session: d.session,
        component: d.component,
        topic: d.topic,
        deliveredOn: d.deliveredOn ? d.deliveredOn.toISOString().slice(0, 10) : null,
        comment: d.comment,
        actions: planSteps(d.actionPlan),
        rating: d.rating,
        scored: d._count.scores,
        footage: d.footage.map((f) => ({
          id: f.id,
          title: f.title,
          url: f.url,
          notes: f.notes.map((n) => ({
            id: n.id,
            atSeconds: n.atSeconds,
            body: n.body,
            author: n.author ? displayName(n.author) : null,
          })),
        })),
      })),
    };
  });

  // Who a delivery can be written up as: the course team as the register names
  // them, and the person signed in — who may be standing in for somebody.
  const me = displayName(user);
  const assessors = [...new Set([me, ...course.staff.map((s) => s.name)])];

  const threshold = course.ratingThreshold ?? DEFAULT_RATING_THRESHOLD;
  const written = entries.reduce((sum, c) => sum + c.deliveries.length, 0);
  const rated = entries.filter((c) => c.rating !== null).length;

  return (
    <>
      <PageHeader
        // An educator reaches this from their grading list rather than from
        // Manage, which they are no longer shown.
        breadcrumb={
          isAdmin(user)
            ? { href: "/admin", label: "Manage" }
            : { href: "/educator/grading", label: "Grading" }
        }
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
              {written === 1 ? "y" : "ies"} written up · {rated} rated
            </span>
          </span>
        }
        // The full register is the program's paperwork — moves, part intakes,
        // the hours ledger, the result block. An educator was being offered a
        // page of somebody else's job, so it is an admin's link now.
        action={
          isAdmin(user) ? (
            <Link href={`/admin/courses/${course.id}/register`} className="btn-secondary btn-sm">
              Full register →
            </Link>
          ) : null
        }
      />

      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Coaches</h2>
        <p className="mb-3 text-sm text-ink-500">
          Pick the day and tick who is here; nothing is written until you save. Open a coach to
          write up a delivery you watched, post film of it and pin your notes to the moments they
          are about, or leave a general comment about how they are going. The write-up and the film
          are theirs to read on their own course page; the comment stays on the register, with the
          course team. Their course rating — the judgement across everything they delivered — is
          set in the same place at the end of the course, and moves the outcome with it.
        </p>
        {entries.length === 0 ? (
          <EmptyState
            title="Nobody on this course yet"
            description="Coaches appear here as soon as they are enrolled."
          />
        ) : (
          <>
            {days.length === 0 && (
              <p className="mb-3 text-sm text-ink-500">
                This course has no delivery days yet, so there is no roll to take. An admin adds
                them to the course before attendance can be kept.
              </p>
            )}
            <CourseRoster
              courseId={course.id}
              days={days}
              roster={entries}
              defaultDayId={defaultDayId}
              assessors={assessors}
              defaultAssessor={me}
              threshold={threshold}
            />
          </>
        )}
      </section>

    </>
  );
}
