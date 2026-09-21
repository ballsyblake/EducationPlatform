import Link from "next/link";
import { Badge, EmptyState, StatTile } from "@/components/ui";
import { lastDayOf } from "@/lib/courses";
import { getGradingQueueCounts } from "@/lib/coursework";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getOpenCaseDeadlines, getSupportQueueCount } from "@/lib/support";

/**
 * What is waiting on one member of the course team.
 *
 * The dashboard was a coach's page shown to everybody. An educator who had
 * never sat a diploma got four zeroed tiles, an empty progress bar and an
 * invitation to browse courses — on the screen they land on every time they
 * sign in. Their work was two pages away and nothing here said there was any.
 *
 * So for staff this answers one question: what needs me, and where is it. Every
 * figure is a link to the page it gets cleared on, and every figure is scoped —
 * an educator is shown their own courses, never the program's.
 *
 * Deliberately not a second Manage page. That one lists the courses somebody
 * runs; this one lists the work they owe. The overlap is the point at which
 * they stop: nothing here repeats a course's enrolment, assignment or quiz
 * counts, because none of those is a thing anybody has to go and do.
 */
export async function StaffSummary({ scope }: { scope: string[] | null }) {
  const now = new Date();
  const mine = scope === null ? {} : { id: { in: scope } };

  const [grading, deliveries, cases, courses, awaiting, pastDays] = await Promise.all([
    getGradingQueueCounts(scope),
    getSupportQueueCount(now, scope),
    getOpenCaseDeadlines(now, scope),

    // A closed cohort is a record rather than work, so nothing below counts it.
    prisma.course.findMany({
      where: { closedAt: null, ...mine },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        // Only the last day: this needs to know whether delivery is over, and
        // pulling nine days per course to learn one date is nine times the rows.
        days: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      },
    }),

    // Coaches still carrying no verdict. Counted per course because it only
    // becomes work once that course has finished delivering — before then
    // everybody is in progress and none of it is owed to anyone.
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { outcome: "IN_PROGRESS", course: { closedAt: null, ...mine } },
      _count: { _all: true },
    }),

    // Days that have been and gone. Which of them had the roll taken is the
    // next query — a day with no Attendance row at all is a day nobody marked.
    prisma.courseDay.findMany({
      where: { date: { lt: now }, course: { closedAt: null, ...mine } },
      orderBy: { date: "asc" },
      select: { id: true, courseId: true, dayNo: true, date: true },
    }),
  ]);

  const markedDayIds = new Set(
    (
      await prisma.attendance.groupBy({
        by: ["courseDayId"],
        where: { courseDayId: { in: pastDays.map((d) => d.id) } },
      })
    ).map((row) => row.courseDayId),
  );
  const unmarked = pastDays.filter((d) => !markedDayIds.has(d.id));

  const overdueCases = cases.filter((c) => c.overdue);
  const awaitingByCourse = new Map(awaiting.map((row) => [row.courseId, row._count._all]));

  /** One course's loose ends, in the order somebody would deal with them. */
  const rows = courses
    .map((course) => {
      const lastDay = lastDayOf(course.days);
      const delivered = lastDay !== null && lastDay < now;
      return {
        id: course.id,
        title: course.title,
        lastDay,
        daysUnmarked: unmarked.filter((d) => d.courseId === course.id),
        // Held back until delivery is over: a rating is a judgement across
        // everything a coach delivered, so it isn't owed mid-course.
        toRate: delivered ? (awaitingByCourse.get(course.id) ?? 0) : 0,
      };
    })
    .filter((row) => row.daysUnmarked.length > 0 || row.toRate > 0);

  const toRate = rows.reduce((sum, r) => sum + r.toRate, 0);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Deliveries to assess"
          value={deliveries}
          tone={deliveries ? "warn" : "good"}
          hint="Film in, or an observation to write up"
          href="/admin/support"
        />
        <StatTile
          label="Work to mark"
          value={grading.total}
          tone={grading.total ? "warn" : "good"}
          hint={`${grading.submissions} submission${grading.submissions === 1 ? "" : "s"} · ${grading.attempts} quiz${grading.attempts === 1 ? "" : "zes"}`}
          href="/admin/grading"
        />
        <StatTile
          label="Support past deadline"
          value={overdueCases.length}
          tone={overdueCases.length ? "bad" : "good"}
          hint={
            cases.length
              ? `${cases.length} case${cases.length === 1 ? "" : "s"} open`
              : "No open cases"
          }
          href="/admin/support"
        />
        <StatTile
          label="Days not marked"
          value={unmarked.length}
          tone={unmarked.length ? "warn" : "good"}
          // The hint answers for itself rather than for the other figure: a
          // tile reading 1 above "the roll is up to date" is the page arguing
          // with itself.
          hint={
            unmarked.length
              ? "Days that ran with nobody marked"
              : toRate
                ? `${toRate} coach${toRate === 1 ? "" : "es"} still to rate`
                : "The roll is up to date"
          }
          href="/admin"
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Waiting on you</h2>
        <p className="mb-3 text-sm text-ink-500">
          Days the roll was never taken on, and coaches a finished course has no result for. Both
          are cleared on the course itself.
        </p>

        {rows.length === 0 ? (
          <EmptyState
            // Somebody with no seat on any course has nothing outstanding for
            // a different reason, and telling them their courses are in order
            // would be the page's first lie to a new educator.
            title={courses.length === 0 ? "No courses yet" : "Nothing outstanding on your courses"}
            description={
              courses.length === 0
                ? "You aren't rostered onto a course yet. An admin adds you to a course team from its register."
                : "Every day that has run has been marked, and every coach on a finished course has a result."
            }
            action={
              <Link href="/admin" className="btn-secondary btn-sm">
                Your courses
              </Link>
            }
          />
        ) : (
          <div className="card divide-y divide-ink-200">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{row.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {row.daysUnmarked.length > 0 && (
                      <>
                        {/* Named rather than counted: "Day 4 and Day 5" is what
                            somebody goes and looks for, "2 days" is not. */}
                        Roll not taken on{" "}
                        {row.daysUnmarked
                          .slice(0, 3)
                          .map((d) => `Day ${d.dayNo}`)
                          .join(", ")}
                        {row.daysUnmarked.length > 3 && ` and ${row.daysUnmarked.length - 3} more`}
                        {" · last ran "}
                        {formatDate(row.daysUnmarked.at(-1)!.date)}
                      </>
                    )}
                    {row.daysUnmarked.length > 0 && row.toRate > 0 && " · "}
                    {row.toRate > 0 && `${row.toRate} without a result`}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  {row.daysUnmarked.length > 0 && (
                    <Link
                      href={`/admin/courses/${row.id}/assess/attendance`}
                      className="btn-secondary btn-sm"
                    >
                      Take the roll →
                    </Link>
                  )}
                  {row.toRate > 0 && (
                    <Link href={`/admin/courses/${row.id}/assess`} className="btn-secondary btn-sm">
                      Rate them →
                    </Link>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {overdueCases.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-semibold text-ink-900">Support past its deadline</h2>
          <p className="mb-3 text-sm text-ink-500">
            Out of time and still open. Each one is an extension to ask for, an assessment to
            arrange, or a case to close.
          </p>
          <div className="card divide-y divide-ink-200">
            {overdueCases.slice(0, 5).map((supportCase) => (
              <Link
                key={supportCase.id}
                href={`/admin/support/${supportCase.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {supportCase.user.name ?? supportCase.user.email}
                  </p>
                  <p className="truncate text-xs text-ink-500">{supportCase.course.title}</p>
                </div>
                <Badge tone="bad">
                  {Math.abs(supportCase.daysLeft ?? 0)} day
                  {Math.abs(supportCase.daysLeft ?? 0) === 1 ? "" : "s"} over
                </Badge>
              </Link>
            ))}
            {overdueCases.length > 5 && (
              <Link
                href="/admin/support"
                className="block px-5 py-3 text-sm font-medium text-maroon-700 hover:bg-ink-50"
              >
                {overdueCases.length - 5} more on the support desk →
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}
