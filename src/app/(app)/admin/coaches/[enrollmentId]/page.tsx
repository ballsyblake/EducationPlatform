import Link from "next/link";
import { notFound } from "next/navigation";
import { OutcomeSheetPage } from "@/components/outcome-sheet";
import { Badge, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { formatHours, summariseAttendance } from "@/lib/attendance";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import { outcomeSheetFor } from "@/lib/outcome";
import { courseResult, VERDICT_LABEL } from "@/lib/support-rubric";

export const metadata = { title: "Coach" };

/**
 * One coach's record on one course, laid out the way their assessment document
 * is laid out.
 *
 * Clicking a name used to do nothing on the coaches list, and on the educator's
 * list it opened the write-up form — the page you fill in, not the page you
 * read. Those are different jobs: an educator about to ring a coach, or
 * answering "how did this one go", wants the record, and was being handed a
 * form with six empty radio groups on it.
 *
 * So the sheet itself is the page. `OutcomeSheetPage` is the same component
 * `/outcome/<enrollmentId>` prints, rendered here inside the app's shell with
 * a strip of standing above it and the actions a reader actually wants next:
 * write up a delivery, print it, hand it over. One layout, read on screen and
 * on paper, rather than a third arrangement of the same facts to keep in step.
 *
 * The row this page is is the *enrolment*, not the person. A coach on two
 * courses has two standings and two of these, which is the same shape the
 * coaches list takes and for the same reason.
 */
export default async function CoachProfilePage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const user = await requireStaff();
  const { enrollmentId } = await params;

  // `outcomeSheetFor` does its own scoping and 404s an educator off the
  // roster. This second read is the standing around the sheet — hours, the
  // course's own pass mark, where else this coach is enrolled — and is scoped
  // again rather than trusting the first, because the two are separate queries
  // and a guard that lives in only one of them is a guard somebody will move.
  const [sheet, enrollment, scope] = await Promise.all([
    outcomeSheetFor(user, enrollmentId),
    prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        user: {
          include: {
            enrollments: {
              include: { course: { select: { id: true, title: true } } },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        course: { include: { days: { orderBy: { dayNo: "asc" } } } },
        attendance: true,
        makeUps: true,
      },
    }),
    staffCourseIds(user),
  ]);
  if (!enrollment || (scope !== null && !scope.includes(enrollment.courseId))) notFound();

  const hours = summariseAttendance({
    days: enrollment.course.days,
    attendance: enrollment.attendance,
    makeUps: enrollment.makeUps,
    track: enrollment.track,
    joinedAt: enrollment.joinedAt,
    leftAt: enrollment.leftAt,
  });

  const result = courseResult({
    courseId: enrollment.courseId,
    rating: enrollment.rating,
    outcome: enrollment.outcome,
    course: {
      title: enrollment.course.title,
      ratingThreshold: enrollment.course.ratingThreshold,
    },
  });
  const verdict = VERDICT_LABEL[result.verdict];

  const scored = sheet.deliveries.filter((d) => d.points?.complete).length;

  // The coach's other courses, which is the half of their record this page is
  // not. Scoped: an educator sees the cohorts they are on and no others.
  const elsewhere = enrollment.user.enrollments.filter(
    (e) => e.id !== enrollment.id && (scope === null || scope.includes(e.courseId)),
  );

  return (
    <>
      <div className="mb-6">
        <Link
          href="/admin/coaches"
          className="mb-2 inline-block text-sm text-ink-500 hover:text-maroon-700"
        >
          ← Coaches
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="headline text-2xl text-ink-900">{displayName(enrollment.user)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
              <span>{enrollment.course.title}</span>
              {enrollment.clubName && <span>· {enrollment.clubName}</span>}
              {enrollment.track === "CATCH_UP" && <span>· catching up</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/educator/grading/${enrollment.id}`} className="btn-primary btn-sm">
              Write up a delivery
            </Link>
            {/* The same sheet without the app around it, for printing or
                saving as a PDF. A tab of its own because what happens next is
                the print dialog. */}
            <Link
              href={`/outcome/${enrollment.id}`}
              target="_blank"
              className="btn-secondary btn-sm"
            >
              Print view →
            </Link>
            {/* A plain link, not a form or a fetch: the browser's own download
                is what the response asks for, and anything cleverer in front
                of it is a spinner that can fail its own way. */}
            <a href={`/outcome/${enrollment.id}/export`} className="btn-secondary btn-sm">
              Export to Word
            </a>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Hours"
          value={formatHours(hours.effectiveMinutes)}
          hint={`of ${formatHours(hours.requiredMinutes)} for days taken`}
          tone={hours.unaccountedMinutes ? "bad" : hours.outstandingMinutes ? "warn" : "good"}
        />
        <StatTile
          label="Course rating"
          value={enrollment.rating !== null ? enrollment.rating.toFixed(1) : "—"}
          hint={
            enrollment.course.ratingThreshold !== null
              ? `pass mark ${enrollment.course.ratingThreshold}`
              : "this course is not rated"
          }
          tone={verdict.tone}
        />
        <StatTile label="Standing" value={verdict.label} tone={verdict.tone} />
        <StatTile
          label="Deliveries"
          value={sheet.deliveries.length}
          hint={
            sheet.deliveries.length === 0
              ? "none written up"
              : `${scored} scored on the rubric in full`
          }
          tone={sheet.deliveries.length ? "muted" : "warn"}
        />
      </div>

      {/* Deliberately a rule of its own rather than another stat tile. A debt
          is somebody's next action, and four figures in a row is where a next
          action goes to be skimmed past. */}
      {(hours.outstandingMinutes > 0 || hours.unaccountedMinutes > 0) && (
        <p className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-600">
          {hours.outstandingMinutes > 0 && (
            <Badge tone="warn">{formatHours(hours.outstandingMinutes)} owed on the ledger</Badge>
          )}
          {hours.unaccountedMinutes > 0 && (
            <Badge tone="bad">
              {formatHours(hours.unaccountedMinutes)} missing with nothing raised
            </Badge>
          )}
          <Link href="/admin/make-ups" className="text-xs underline hover:text-maroon-700">
            The make-up ledger →
          </Link>
        </p>
      )}

      {enrollment.registerComments && (
        <section className="mb-6">
          <h2 className="section-title mb-2">The register&apos;s comment</h2>
          <p className="card card-pad prose-note">{enrollment.registerComments}</p>
        </section>
      )}

      <h2 className="section-title mb-2">The assessment record</h2>
      <OutcomeSheetPage sheet={sheet} />

      {elsewhere.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold text-ink-900">
            Also on {elsewhere.length === 1 ? "another course" : "other courses"}
          </h2>
          <div className="card divide-y divide-ink-200">
            {elsewhere.map((other) => (
              <Link
                key={other.id}
                href={`/admin/coaches/${other.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-ink-50"
              >
                <span className="text-ink-900">{other.course.title}</span>
                <span className="text-xs text-ink-500">
                  enrolled {formatDate(other.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
