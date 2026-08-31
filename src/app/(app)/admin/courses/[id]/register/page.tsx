import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { shortCourseTitle } from "@/lib/coaches";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import { DEFAULT_RATING_THRESHOLD } from "@/lib/support-rubric";
import { MakeUpCard, OpenMakeUpForm, type MakeUpRow } from "@/components/make-up-forms";
import { PhotoCapture } from "@/components/photo-capture";
import {
  dayMinutes,
  formatHours,
  makeUpBalance,
  summariseAttendance,
  withinWindow,
} from "@/lib/attendance";
import {
  MoveCard,
  MoveForm,
  PartIntakeForm,
  type CourseOption,
  type DayOption,
  type MoveRow,
} from "./transfer-forms";
import {
  CoachAttendanceGrid,
  ResultsTable,
  StaffAttendanceGrid,
  type DayColumn,
  type RegisterRow,
  type ResultRow,
  type StaffRow,
} from "./register-forms";

export const metadata = { title: "Attendance register" };

export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  await assertCourseStaff(user, id);

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
          makeUps: { orderBy: { openedAt: "asc" }, include: { courseDay: true } },
          transferredTo: { select: { courseId: true, course: { select: { title: true } } } },
          transferredFrom: { select: { courseId: true, course: { select: { title: true } } } },
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
    minutes: dayMinutes(day),
  }));

  // The hours each coach has sat, owes and has made up. Worked out once, on the
  // server, so the grid, the results table and the make-ups panel below all
  // quote the same figures.
  const summaries = new Map(
    course.enrollments.map((e) => [
      e.id,
      summariseAttendance({
        days: course.days,
        attendance: e.attendance,
        makeUps: e.makeUps,
        track: e.track,
        joinedAt: e.joinedAt,
        leftAt: e.leftAt,
      }),
    ]),
  );

  const toRow = (e: (typeof course.enrollments)[number]): RegisterRow => ({
    id: e.id,
    name: displayName(e.user),
    email: e.user.email,
    photoId: e.user.photoId,
    subtitle: e.track === "CATCH_UP" ? e.catchUpNote : e.clubName,
    marks: Object.fromEntries(e.attendance.map((a) => [a.courseDayId, a.minutes])),
    creditedMinutes: summaries.get(e.id)?.creditedMinutes ?? 0,
    outstandingMinutes: summaries.get(e.id)?.outstandingMinutes ?? 0,
    raisedMinutes: summaries.get(e.id)?.raisedMinutes ?? 0,
    outsideDayIds: course.days
      .filter((d) => !withinWindow(d, e.joinedAt, e.leftAt))
      .map((d) => d.id),
  });

  const main = course.enrollments.filter((e) => e.track === "MAIN");
  const catchUps = course.enrollments.filter((e) => e.track === "CATCH_UP");

  const staffRows: StaffRow[] = course.staff.map((s) => ({
    id: s.id,
    name: s.name,
    subtitle: s.role,
    marks: Object.fromEntries(s.attendance.map((a) => [a.courseDayId, a.present])),
  }));

  // Course days as a picker: an educator knows a move as "he did Block 1 with
  // us", and a day list can't produce the wrong year the way a date field can.
  const isoDay = (date: Date) => date.toISOString().slice(0, 10);
  const dayPicker: DayOption[] = course.days.map((day) => ({
    id: day.id,
    dayNo: day.dayNo,
    date: isoDay(day.date),
    label: `Day ${day.dayNo} · ${formatDate(day.date)}`,
  }));

  const otherCourses: CourseOption[] = (
    await prisma.course.findMany({
      where: { id: { not: course.id } },
      orderBy: { title: "asc" },
      select: { id: true, title: true, days: { orderBy: { dayNo: "asc" } } },
    })
  ).map((c) => ({
    id: c.id,
    title: shortCourseTitle(c.title),
    days: c.days.map((day) => ({
      id: day.id,
      dayNo: day.dayNo,
      date: isoDay(day.date),
      label: `Day ${day.dayNo} · ${formatDate(day.date)}`,
    })),
  }));

  const moveRow = (e: (typeof course.enrollments)[number]): MoveRow => ({
    enrollmentId: e.id,
    name: displayName(e.user),
    subtitle: e.track === "CATCH_UP" ? "Catch-up" : e.clubName,
    joinedAt: e.joinedAt ? isoDay(e.joinedAt) : null,
    leftAt: e.leftAt ? isoDay(e.leftAt) : null,
    // The short title, because the card is a sentence: "Moved to AFC /
    // Football Australia B Diploma — Regional @ Gold Coast" buries the only
    // part of it the reader needs.
    transferredTo: e.transferredTo
      ? {
          courseId: e.transferredTo.courseId,
          courseTitle: shortCourseTitle(e.transferredTo.course.title),
          note: e.transferNote,
        }
      : null,
    transferredFrom: e.transferredFrom
      ? {
          courseId: e.transferredFrom.courseId,
          courseTitle: shortCourseTitle(e.transferredFrom.course.title),
        }
      : null,
    daysOutsideWindow: summaries.get(e.id)?.daysOutsideWindow ?? 0,
  });

  const moveRows = course.enrollments.map(moveRow);
  // Anybody whose time here wasn't the whole of it — a window set, or a move
  // recorded at either end.
  const moves = moveRows.filter(
    (r) => r.joinedAt || r.leftAt || r.transferredTo || r.transferredFrom,
  );

  const dayOptions = course.days.map((day) => ({
    id: day.id,
    label: `Day ${day.dayNo} · ${formatDate(day.date)}`,
    minutes: dayMinutes(day),
  }));

  // Everybody the register has something to say about in hours: an open debt,
  // or time missing that nobody has raised one for.
  const hoursCases = course.enrollments
    .map((e) => ({ enrollment: e, summary: summaries.get(e.id)! }))
    .filter(
      ({ enrollment, summary }) =>
        enrollment.makeUps.length > 0 || summary.unaccountedMinutes > 0,
    );

  const makeUpRow = (
    e: (typeof course.enrollments)[number],
    m: (typeof course.enrollments)[number]["makeUps"][number],
  ): MakeUpRow => ({
    id: m.id,
    minutesOwed: m.minutesOwed,
    minutesCredited: m.minutesCredited,
    status: m.status,
    arrangedNote: m.arrangedNote,
    creditedNote: m.creditedNote,
    dayLabel: m.courseDay ? `Day ${m.courseDay.dayNo} · ${formatDate(m.courseDay.date)}` : null,
    openedAt: formatDate(m.openedAt),
    coachName: displayName(e.user),
  });

  const results: ResultRow[] = course.enrollments.map((e) => ({
    id: e.id,
    name: displayName(e.user),
    subtitle: e.track === "CATCH_UP" ? "Catch-up" : e.clubName,
    hours: formatHours(summaries.get(e.id)?.effectiveMinutes ?? 0),
    hoursOf: formatHours(summaries.get(e.id)?.requiredMinutes ?? 0),
    outstanding: summaries.get(e.id)?.outstandingMinutes ?? 0,
    unaccounted: summaries.get(e.id)?.unaccountedMinutes ?? 0,
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
  // Across the whole roster, hours sat as a share of hours run — not marks
  // ticked as a share of marks made, which counted a half day as a full one.
  //
  // Only enrolments with a requirement count. A catch-up sitting one day here
  // has hours but no denominator of its own, and adding those hours to the
  // roster's total produced a course attending 103% of itself.
  const measured = [...summaries.values()].filter((x) => x.requiredMinutes > 0);
  const courseRequired = measured.reduce((s, x) => s + x.requiredMinutes, 0);
  const courseEffective = measured.reduce((s, x) => s + x.effectiveMinutes, 0);
  const attendancePct =
    courseRequired > 0 ? Math.min(100, Math.round((courseEffective / courseRequired) * 100)) : null;
  const outstandingMinutes = course.enrollments
    .flatMap((e) => e.makeUps)
    .reduce((sum, m) => sum + makeUpBalance(m), 0);
  const unaccountedMinutes = [...summaries.values()].reduce(
    (sum, x) => sum + x.unaccountedMinutes,
    0,
  );

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
          <span className="flex flex-wrap gap-2">
            <Link href="/admin/make-ups" className="btn-secondary btn-sm">
              Hours desk →
            </Link>
            <Link href="/admin/support" className="btn-secondary btn-sm">
              Post-course support →
            </Link>
          </span>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="On the roster" value={main.length} hint={`${catchUps.length} catching up`} />
        <StatTile
          label="Attendance"
          value={attendancePct === null ? "—" : `${attendancePct}%`}
          hint={`${marks.length} marks · ${formatHours(courseEffective)} of ${formatHours(courseRequired)}`}
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
        <StatTile
          label="Hours owed"
          value={outstandingMinutes ? formatHours(outstandingMinutes) : "None"}
          tone={outstandingMinutes ? "warn" : "good"}
          hint={
            unaccountedMinutes
              ? `${formatHours(unaccountedMinutes)} missing with nothing raised`
              : "Nothing missing that isn't on the ledger"
          }
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Roster</h2>
        <p className="mb-3 text-sm text-ink-500">
          A tick is the whole day; click <em>part</em> under a cell to record the hours actually
          sat. A day heading marks the whole column at once. Nothing is written until you save.
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
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Who&apos;s who</h2>
        <p className="mb-3 text-sm text-ink-500">
          Take a photo of each coach on the first morning and the register stops being a list of
          strangers — for whoever is assessing their delivery in Block 3, and for the educator who
          wasn&apos;t there for Block 1. Shown to coach education staff and to the coach
          themselves, never to other coaches, and removable by either.
        </p>
        <div className="card card-pad grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Roster first, then catch-ups. The query orders by track, and
              "CATCH_UP" sorts before "MAIN" alphabetically, which put the
              visitors above the course's own roster. */}
          {[...main, ...catchUps].map((e) => (
            <div key={e.id} className="min-w-0">
              <p className="mb-1 truncate text-sm font-medium text-ink-900">
                {displayName(e.user)}
                {e.track === "CATCH_UP" && (
                  <span className="ml-2 text-xs font-normal text-ink-500">catch-up</span>
                )}
              </p>
              <PhotoCapture compact user={e.user} />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Moves and part intakes</h2>
        <p className="mb-3 text-sm text-ink-500">
          Not everybody does all nine days of the course they are listed on. Say which days a coach
          was actually here, and they stop being measured against the ones they weren&apos;t —
          rather than reading as somebody who didn&apos;t turn up.
        </p>

        <div className="card divide-y divide-ink-200">
          {moves.map((row) => (
            <MoveCard key={row.enrollmentId} row={row} days={dayPicker} />
          ))}
          <div className="px-5 py-4">
            <p className="mb-1 text-sm font-medium text-ink-900">Set a part intake</p>
            <p className="mb-3 text-xs text-ink-500">
              For a coach who joined late or stopped early without moving to another course.
            </p>
            <PartIntakeForm rows={moveRows} days={dayPicker} />
          </div>

          <div className="px-5 py-4">
            <p className="mb-1 text-sm font-medium text-ink-900">Record a move</p>
            <p className="mb-3 text-xs text-ink-500">
              Closes their time here, opens it on the other course, and takes any hours they still
              owe with them.
            </p>
            <MoveForm rows={moveRows} days={dayPicker} otherCourses={otherCourses} />
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Hours owed</h2>
        <p className="mb-3 text-sm text-ink-500">
          Time missed becomes a debt when an educator says so, not automatically — a course still
          running has blanks everywhere, and turning each one into an obligation would bury the few
          that matter. Raise one here and it follows the coach across courses.
        </p>

        {hoursCases.length === 0 ? (
          <p className="card card-pad text-sm text-ink-500">
            Nothing outstanding. Every coach on this register is level with the days taken so far.
          </p>
        ) : (
          <div className="card divide-y divide-ink-200">
            {hoursCases.map(({ enrollment, summary }) => (
              <div key={enrollment.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 bg-ink-50 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {displayName(enrollment.user)}
                      {enrollment.track === "CATCH_UP" && (
                        <span className="ml-2 text-xs text-ink-500">catching up</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-500">
                      {formatHours(summary.attendedMinutes)} sat of{" "}
                      {formatHours(summary.requiredMinutes)} run
                      {summary.creditedMinutes > 0 &&
                        ` · ${formatHours(summary.creditedMinutes)} made up`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {summary.outstandingMinutes > 0 && (
                      <Badge tone="warn">{formatHours(summary.outstandingMinutes)} owed</Badge>
                    )}
                    {summary.unaccountedMinutes > 0 && (
                      <Badge tone="bad">
                        {formatHours(summary.unaccountedMinutes)} unaccounted
                      </Badge>
                    )}
                  </div>
                </div>

                {enrollment.makeUps.map((m) => (
                  <MakeUpCard key={m.id} row={makeUpRow(enrollment, m)} />
                ))}

                <div className="px-5 py-3">
                  <OpenMakeUpForm
                    compact
                    enrollmentId={enrollment.id}
                    days={dayOptions}
                    defaultMinutes={
                      summary.unaccountedMinutes > 0 ? summary.unaccountedMinutes : undefined
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
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
                  e.attendance.some((a) => a.courseDayId === day.id && a.minutes > 0),
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
