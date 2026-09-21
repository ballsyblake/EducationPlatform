import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { assertCourseStaff } from "@/lib/access";
import { isAdmin, requireStaff } from "@/lib/auth";
import { formatHours, summariseAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";
import { DEFAULT_RATING_THRESHOLD } from "@/lib/support-rubric";
import { CoachPanel, type CoachEntry } from "./assess-forms";

export const metadata = { title: "Course" };

/** The numbering the action plan is written with, taken back off for editing. */
function planSteps(actionPlan: string | null) {
  if (!actionPlan) return [];
  return actionPlan
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * The course page an assessor works from: its coaches.
 *
 * A course is a list of people to an assessor, so that is what the page is.
 * Open a name and everything about that coach is under it — what they have
 * delivered, what was said about it, where their rating stands.
 *
 * Taking the roll is a page away rather than the first thing on this one. It is
 * an errand of its own, done on the grass and known about before you arrive,
 * and nine days of tick boxes above the names buried the work somebody sits
 * down to do afterwards. Everything else a course carries — moves and part
 * intakes, the hours ledger, the result block, the course settings — is the
 * program's paperwork rather than the assessor's, and lives on the full
 * register, a link away in the same place.
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
      rating: e.rating,
      outcome: e.outcome,
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

  const threshold = course.ratingThreshold ?? DEFAULT_RATING_THRESHOLD;
  const written = coaches.reduce((sum, c) => sum + c.deliveries.length, 0);
  const rated = coaches.filter((c) => c.rating !== null).length;
  // Days the roll has been taken on. On the subtitle because it is the one
  // thing about attendance worth knowing from a page that no longer shows it.
  const marked = course.days.filter((d) =>
    roster.some((e) => e.attendance.some((a) => a.courseDayId === d.id)),
  ).length;

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
              {written === 1 ? "y" : "ies"} written up · {rated} rated
              {course.days.length > 0 && ` · ${marked} of ${course.days.length} days marked`}
            </span>
          </span>
        }
        action={
          <span className="flex flex-wrap gap-2">
            {/* The roll is the errand you arrive knowing you are here for, so
                it is a door rather than the first thing in the way. */}
            <Link
              href={`/admin/courses/${course.id}/assess/attendance`}
              className="btn-primary btn-sm"
            >
              Attendance →
            </Link>
            <Link href={`/admin/courses/${course.id}/register`} className="btn-secondary btn-sm">
              Full register →
            </Link>
          </span>
        }
      />

      <section>
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
                threshold={threshold}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
