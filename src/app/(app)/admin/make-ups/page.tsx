import Link from "next/link";
import { MakeUpCard, OpenMakeUpForm, type MakeUpRow } from "@/components/make-up-forms";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import {
  dayMinutes,
  makeUpAmount,
  makeUpBalance,
  standardDayMinutes,
  sumMakeUpDays,
  summariseAttendance,
} from "@/lib/attendance";
import { staffCourseIds } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";

export const metadata = { title: "Make-up days" };

/**
 * The make-ups desk, counted in days.
 *
 * A coach's hours are a course's problem until the day they aren't: they miss
 * Day 6 on the Sunshine Coast, sit it at Gold Coast Knights three weeks later,
 * and no single register can say whether they are square. This page is the
 * other view of the same ledger — by coach rather than by course — and it is
 * where a debt raised on one register gets closed by a day sat on another.
 *
 * It counts in days because that is the thing being arranged: nobody sits four
 * hours of somebody else's course, they sit a day of it. The hours are kept
 * underneath and surface as a note wherever what is owed isn't a whole day —
 * which is half the real debts, and the half that would otherwise have a coach
 * sitting five hours they don't owe.
 */
export default async function MakeUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await requireStaff();
  const scope = await staffCourseIds(user);
  const within =
    scope === null ? {} : { enrollment: { courseId: { in: scope } } };
  const { show } = await searchParams;
  const includeSettled = show === "all";

  const makeUps = await prisma.attendanceMakeUp.findMany({
    where: includeSettled ? within : { status: { in: ["OWED", "ARRANGED"] }, ...within },
    orderBy: [{ status: "asc" }, { openedAt: "asc" }],
    include: {
      courseDay: true,
      enrollment: {
        include: {
          user: true,
          course: {
            select: {
              id: true,
              title: true,
              // How long a day runs here, which is what turns minutes into the
              // days everybody actually talks in.
              days: { select: { startTime: true, endTime: true } },
            },
          },
        },
      },
    },
  });

  const dayLengthOf = (m: (typeof makeUps)[number]) =>
    standardDayMinutes(m.enrollment.course.days);

  const open = makeUps.filter((m) => makeUpBalance(m) > 0);
  const outstanding = sumMakeUpDays(
    open.map((m) => ({ minutes: makeUpBalance(m), dayLength: dayLengthOf(m) })),
  );
  const coaches = new Set(makeUps.map((m) => m.enrollment.userId));
  const unarranged = makeUps.filter((m) => m.status === "OWED").length;

  // Everybody still short on a course that has started, with nothing raised for
  // it. These are the ones nobody has looked at yet, which is the whole reason
  // to have a desk rather than nine registers.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      outcome: { not: "WITHDRAWN" },
      ...(scope === null ? {} : { courseId: { in: scope } }),
    },
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

  const unaccountedDays = sumMakeUpDays(
    unaccounted.map(({ enrollment, summary }) => ({
      minutes: summary.unaccountedMinutes,
      dayLength: standardDayMinutes(enrollment.course.days),
    })),
  );

  /** A total in days, for a tile: "2 days" with the odd hours as its hint. */
  const totalLabel = (total: ReturnType<typeof sumMakeUpDays>) => {
    if (total.days === 0 && total.extraMinutes === 0 && total.unknownMinutes === 0) return "None";
    if (total.days === 0) return makeUpAmount(total.extraMinutes + total.unknownMinutes, 0).label;
    return `${total.days} day${total.days === 1 ? "" : "s"}`;
  };
  const totalHint = (total: ReturnType<typeof sumMakeUpDays>) => {
    const odd = total.extraMinutes + total.unknownMinutes;
    if (odd === 0 || total.days === 0) return null;
    return `and ${makeUpAmount(odd, 0).label} on top`;
  };

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
        title="Make-up days"
        subtitle="Days a coach owes, and where they are being sat."
        action={
          <Link
            href={includeSettled ? "/admin/make-ups" : "/admin/make-ups?show=all"}
            className="btn-secondary btn-sm"
          >
            {includeSettled ? "Open only" : "Show settled"}
          </Link>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile
          label="Days to make up"
          value={totalLabel(outstanding)}
          tone={open.length ? "warn" : "good"}
          hint={
            totalHint(outstanding) ??
            `${coaches.size} coach${coaches.size === 1 ? "" : "es"} on the ledger`
          }
        />
        <StatTile
          label="Not arranged"
          value={unarranged}
          tone={unarranged ? "warn" : "good"}
          hint="Raised, with no day found yet"
        />
        <StatTile
          label="Short, nothing raised"
          value={totalLabel(unaccountedDays)}
          tone={unaccounted.length ? "bad" : "good"}
          hint={`${unaccounted.length} enrolment${unaccounted.length === 1 ? "" : "s"} nobody has looked at`}
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">
          {includeSettled ? "The ledger" : "Open make-ups"}
        </h2>
        <p className="mb-3 text-sm text-ink-500">
          Each of these follows the coach, not the course. Mark one made up when the day is sat —
          wherever it was sat — and waive it when an educator decides it need not be.
        </p>

        {makeUps.length === 0 ? (
          <EmptyState
            title={includeSettled ? "Nothing on the ledger" : "Nothing outstanding"}
            description="Make-ups are raised from a course register, against the coach who missed the time."
          />
        ) : (
          <div className="card divide-y divide-ink-200">
            {makeUps.map((m) => (
              <MakeUpCard key={m.id} row={toRow(m)} dayLength={dayLengthOf(m)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Short, with nothing raised</h2>
        <p className="mb-3 text-sm text-ink-500">
          Time missing against the days each course has actually taken. Nothing here is a debt yet
          — an educator decides that, and can do it from this page.
        </p>

        {unaccounted.length === 0 ? (
          <p className="card card-pad text-sm text-ink-500">
            Every coach is level with the days their course has run.
          </p>
        ) : (
          <div className="card divide-y divide-ink-200">
            {unaccounted.map(({ enrollment, summary }) => {
              const dayLength = standardDayMinutes(enrollment.course.days);
              const short = makeUpAmount(summary.unaccountedMinutes, dayLength);
              return (
                <div key={enrollment.id} className="px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-ink-900">
                      {displayName(enrollment.user)}
                    </span>
                    <Badge tone="bad">{short.label} short</Badge>
                    {/* The hours, where what is missing isn't a whole day. */}
                    {short.note && <span className="text-xs text-ink-500">{short.note}</span>}
                    <span className="text-xs text-ink-500">
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
                    dayLength={dayLength}
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
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
