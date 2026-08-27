import Link from "next/link";
import { MakeUpCard, OpenMakeUpForm, type MakeUpRow } from "@/components/make-up-forms";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import {
  dayMinutes,
  formatHours,
  makeUpBalance,
  summariseAttendance,
} from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";

export const metadata = { title: "Hours and make-ups" };

/**
 * The make-ups desk.
 *
 * A coach's hours are a course's problem until the day they aren't: they miss
 * Day 6 on the Sunshine Coast, sit it at Gold Coast Knights three weeks later,
 * and no single register can say whether they are square. This page is the
 * other view of the same ledger — by coach rather than by course — and it is
 * where a debt raised on one register gets closed by a day sat on another.
 */
export default async function MakeUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireAdmin();
  const { show } = await searchParams;
  const includeSettled = show === "all";

  const makeUps = await prisma.attendanceMakeUp.findMany({
    where: includeSettled ? {} : { status: { in: ["OWED", "ARRANGED"] } },
    orderBy: [{ status: "asc" }, { openedAt: "asc" }],
    include: {
      courseDay: true,
      enrollment: { include: { user: true, course: { select: { id: true, title: true } } } },
    },
  });

  const openMinutes = makeUps.reduce((sum, m) => sum + makeUpBalance(m), 0);
  const coaches = new Set(makeUps.map((m) => m.enrollment.userId));

  // Everybody still short on a course that has started, with nothing raised for
  // it. These are the ones nobody has looked at yet, which is the whole reason
  // to have a desk rather than nine registers.
  const enrollments = await prisma.enrollment.findMany({
    where: { outcome: { not: "WITHDRAWN" } },
    include: {
      user: true,
      attendance: true,
      makeUps: true,
      course: { select: { id: true, title: true, days: true } },
    },
  });

  const unaccounted = enrollments
    .map((e) => ({
      enrollment: e,
      summary: summariseAttendance({
        days: e.course.days,
        attendance: e.attendance,
        makeUps: e.makeUps,
        track: e.track,
        joinedAt: e.joinedAt,
        leftAt: e.leftAt,
      }),
    }))
    .filter(({ summary }) => summary.unaccountedMinutes > 0)
    .sort((a, b) => b.summary.unaccountedMinutes - a.summary.unaccountedMinutes);

  const unaccountedMinutes = unaccounted.reduce(
    (sum, u) => sum + u.summary.unaccountedMinutes,
    0,
  );

  const toRow = (m: (typeof makeUps)[number]): MakeUpRow => ({
    id: m.id,
    minutesOwed: m.minutesOwed,
    minutesCredited: m.minutesCredited,
    status: m.status,
    arrangedNote: m.arrangedNote,
    creditedNote: m.creditedNote,
    dayLabel: m.courseDay ? `Day ${m.courseDay.dayNo} · ${formatDate(m.courseDay.date)}` : null,
    openedAt: formatDate(m.openedAt),
    coachName: displayName(m.enrollment.user),
    courseTitle: m.enrollment.course.title,
    courseHref: `/admin/courses/${m.enrollment.course.id}/register`,
  });

  return (
    <>
      <PageHeader
        title="Hours and make-ups"
        subtitle="Time missed on course, and where it is being made up."
        action={
          <Link
            href={includeSettled ? "/admin/make-ups" : "/admin/make-ups?show=all"}
            className="btn-secondary btn-sm"
          >
            {includeSettled ? "Open only" : "Show settled"}
          </Link>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Hours outstanding"
          value={openMinutes ? formatHours(openMinutes) : "None"}
          tone={openMinutes ? "warn" : "good"}
          hint={`${coaches.size} coach${coaches.size === 1 ? "" : "es"} on the ledger`}
        />
        <StatTile
          label="Owed"
          value={makeUps.filter((m) => m.status === "OWED").length}
          tone={makeUps.some((m) => m.status === "OWED") ? "warn" : "good"}
          hint="Nothing arranged yet"
        />
        <StatTile
          label="Arranged"
          value={makeUps.filter((m) => m.status === "ARRANGED").length}
          hint="A day found, not yet sat"
        />
        <StatTile
          label="Unaccounted"
          value={unaccountedMinutes ? formatHours(unaccountedMinutes) : "None"}
          tone={unaccountedMinutes ? "bad" : "good"}
          hint={`${unaccounted.length} enrolment${unaccounted.length === 1 ? "" : "s"} short with nothing raised`}
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">
          {includeSettled ? "The ledger" : "Open make-ups"}
        </h2>
        <p className="mb-3 text-sm text-ink-500">
          Each of these follows the coach, not the course. Mark one made up when the hours are
          sat — wherever they were sat — and waive it when an educator decides they need not be.
        </p>

        {makeUps.length === 0 ? (
          <EmptyState
            title={includeSettled ? "Nothing on the ledger" : "Nothing outstanding"}
            description="Make-ups are raised from a course register, against the coach who missed the time."
          />
        ) : (
          <div className="card divide-y divide-ink-200">
            {makeUps.map((m) => (
              <MakeUpCard key={m.id} row={toRow(m)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Short, with nothing raised</h2>
        <p className="mb-3 text-sm text-ink-500">
          Hours missing against the days each course has actually taken. Nothing here is a debt yet
          — an educator decides that, and can do it from this page.
        </p>

        {unaccounted.length === 0 ? (
          <p className="card card-pad text-sm text-ink-500">
            Every coach is level with the days their course has run.
          </p>
        ) : (
          <div className="card divide-y divide-ink-200">
            {unaccounted.map(({ enrollment, summary }) => (
              <div key={enrollment.id} className="px-5 py-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-ink-900">{displayName(enrollment.user)}</span>
                  <Badge tone="bad">{formatHours(summary.unaccountedMinutes)} short</Badge>
                  <span className="text-xs text-ink-500">
                    {formatHours(summary.attendedMinutes)} of{" "}
                    {formatHours(summary.requiredMinutes)} ·{" "}
                    <Link
                      href={`/admin/courses/${enrollment.course.id}/register`}
                      className="underline"
                    >
                      {enrollment.course.title}
                    </Link>
                  </span>
                </div>
                <OpenMakeUpForm
                  compact
                  enrollmentId={enrollment.id}
                  days={enrollment.course.days
                    .slice()
                    .sort((a, b) => a.dayNo - b.dayNo)
                    .map((d) => ({
                      id: d.id,
                      label: `Day ${d.dayNo} · ${formatDate(d.date)}`,
                      minutes: dayMinutes(d),
                    }))}
                  defaultMinutes={summary.unaccountedMinutes}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
