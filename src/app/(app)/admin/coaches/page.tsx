import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatTile, type Tone } from "@/components/ui";
import { formatHours } from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth";
import { getCoachRoster, ROSTER_OUTCOMES, shortCourseTitle } from "@/lib/coaches";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";
import { VERDICT_LABEL } from "@/lib/support-rubric";

export const metadata = { title: "Coaches" };

/**
 * Outcomes the rubric has no verdict for.
 *
 * `courseResult` answers "did they meet the standard", which is not a question
 * about somebody who left or moved. Those two speak for themselves and must
 * not be read as a judgement.
 */
const OUTCOME_OVERRIDE: Record<string, { label: string; tone: Tone } | undefined> = {
  WITHDRAWN: { label: "Withdrawn", tone: "muted" },
  TRANSFERRED: { label: "Transferred", tone: "ok" },
};

const CASE_TONE: Record<string, Tone> = {
  IN_PROGRESS: "ok",
  SUCCESSFUL: "good",
  UNSUCCESSFUL: "bad",
  WITHDRAWN: "muted",
};

/**
 * Every coach, and where each one stands on each course.
 *
 * Progress answers a different question — how much coursework is done — which
 * is the right question for the online courses and no question at all for a
 * diploma, where a coach's standing is hours sat, a rating out of five and an
 * outcome. Those live on nine separate registers, so this is the one page that
 * reads across them.
 *
 * The row is the enrolment. A coach on two courses appears twice, because they
 * are two standings.
 */
export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; outcome?: string; q?: string }>;
}) {
  await requireAdmin();
  const { course: courseId, outcome, q } = await searchParams;

  const [courses, rows] = await Promise.all([
    prisma.course.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    getCoachRoster({ courseId, outcome, query: q }),
  ]);

  const coaches = new Set(rows.map((r) => r.user.id));
  const enrolled = rows.filter((r) => r.enrolment !== null);
  const shortfall = enrolled.filter((r) => r.enrolment!.result.verdict === "needs_support");
  const owed = enrolled.reduce((sum, r) => sum + r.enrolment!.hours.outstandingMinutes, 0);
  const unaccounted = enrolled.reduce((sum, r) => sum + r.enrolment!.hours.unaccountedMinutes, 0);

  // Filter links keep whatever else is set, so picking a course doesn't throw
  // away the search you typed to get there.
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ course: courseId, outcome, q, ...patch })) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/admin/coaches?${qs}` : "/admin/coaches";
  };

  return (
    <>
      <PageHeader
        title="Coaches"
        subtitle="Every coach and where they stand on each course — hours, rating, outcome."
      />

      <form action="/admin/coaches" className="mb-4 flex flex-wrap items-center gap-2">
        {courseId && <input type="hidden" name="course" value={courseId} />}
        {outcome && <input type="hidden" name="outcome" value={outcome} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search a name, a club, a course…"
          aria-label="Search coaches"
          className="input w-full max-w-sm px-3 py-1.5 text-sm"
        />
        <button type="submit" className="btn-secondary btn-sm">
          Search
        </button>
        {q && (
          <Link href={href({ q: undefined })} className="text-xs text-ink-500 underline">
            Clear
          </Link>
        )}
      </form>

      <div className="mb-3 flex flex-wrap gap-2">
        <Link
          href={href({ course: undefined })}
          className={courseId ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        >
          All courses
        </Link>
        {courses.map((course) => (
          <Link
            key={course.id}
            href={href({ course: course.id })}
            className={courseId === course.id ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {shortCourseTitle(course.title)}
          </Link>
        ))}
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href={href({ outcome: undefined })}
          className={outcome ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        >
          Any outcome
        </Link>
        {ROSTER_OUTCOMES.map((option) => (
          <Link
            key={option.value}
            href={href({ outcome: option.value })}
            className={outcome === option.value ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Coaches"
          value={coaches.size}
          hint={`${enrolled.length} enrolment${enrolled.length === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Below the mark"
          value={shortfall.length}
          tone={shortfall.length ? "warn" : "good"}
          hint="Rated under their course's pass mark"
        />
        <StatTile
          label="Hours owed"
          value={owed ? formatHours(owed) : "None"}
          tone={owed ? "warn" : "good"}
          hint="Open on the make-up ledger"
        />
        <StatTile
          label="Unaccounted"
          value={unaccounted ? formatHours(unaccounted) : "None"}
          tone={unaccounted ? "bad" : "good"}
          hint="Missing with nothing raised"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nobody matches that"
          description="Try a different course, outcome or search term."
          action={
            <Link href="/admin/coaches" className="btn-primary btn-sm">
              Clear the filters
            </Link>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs font-semibold text-ink-700">
                <th className="px-4 py-2">Coach</th>
                <th className="px-3 py-2">Course</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Standing</th>
                <th className="px-3 py-2 text-center">Journal</th>
                <th className="px-3 py-2 text-center">Deliveries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {rows.map((row) => {
                const e = row.enrolment;
                const verdict = e ? VERDICT_LABEL[e.result.verdict] : null;
                return (
                  <tr key={row.key} className="align-top hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">{displayName(row.user)}</span>
                        {!row.user.active && <Badge tone="bad">Deactivated</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500">{row.user.email}</span>
                      {e?.clubName && (
                        <span className="block text-xs text-ink-400">{e.clubName}</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {e ? (
                        <>
                          <Link
                            href={`/admin/courses/${e.courseId}/register`}
                            title={e.courseTitle}
                            className="text-ink-900 hover:text-maroon-700 hover:underline"
                          >
                            {e.courseShort}
                          </Link>
                          {e.qualification && (
                            <span className="mt-0.5 block text-xs text-ink-400">
                              {e.qualification}
                            </span>
                          )}
                          {e.track === "CATCH_UP" && (
                            <span className="mt-0.5 block text-xs text-ink-500">
                              Catching up{e.catchUpNote ? ` · ${e.catchUpNote}` : ""}
                            </span>
                          )}
                          {/* Where the hours went, and where they came from —
                              the two halves of a coach who moved intakes. */}
                          {e.transferredTo && (
                            <Link
                              href={`/admin/courses/${e.transferredTo.courseId}/register`}
                              className="mt-0.5 block text-xs text-maroon-700 hover:underline"
                            >
                              → moved to {shortCourseTitle(e.transferredTo.courseTitle)}
                            </Link>
                          )}
                          {e.transferredFrom && (
                            <Link
                              href={`/admin/courses/${e.transferredFrom.courseId}/register`}
                              className="mt-0.5 block text-xs text-maroon-700 hover:underline"
                            >
                              ← from {shortCourseTitle(e.transferredFrom.courseTitle)}
                            </Link>
                          )}
                          {(e.joinedAt || e.leftAt) && !e.transferredTo && (
                            <span className="mt-0.5 block text-xs text-ink-400">
                              Part intake
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-400">Not enrolled</span>
                      )}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {e && e.hours.requiredMinutes > 0 ? (
                        <>
                          <span
                            className={
                              e.hours.effectiveMinutes < e.hours.requiredMinutes
                                ? "font-semibold text-maroon-700"
                                : "text-ink-700"
                            }
                          >
                            {formatHours(e.hours.effectiveMinutes)}
                          </span>
                          <span className="text-ink-400">
                            {" "}
                            of {formatHours(e.hours.requiredMinutes)}
                          </span>
                          {e.hours.outstandingMinutes > 0 && (
                            <span className="mt-0.5 block text-[11px] text-ink-500">
                              {formatHours(e.hours.outstandingMinutes)} owed
                            </span>
                          )}
                          {e.hours.unaccountedMinutes > 0 && (
                            <span className="mt-0.5 block text-[11px] font-semibold text-maroon-700">
                              {formatHours(e.hours.unaccountedMinutes)} unaccounted
                            </span>
                          )}
                        </>
                      ) : (
                        // A catch-up has no requirement of its own, and a course
                        // whose register has taken no days yet has no
                        // denominator to measure anybody against.
                        <span className="text-ink-400">
                          {e?.track === "CATCH_UP" ? formatHours(e.hours.attendedMinutes) : "—"}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {e?.result.rating !== null && e !== null ? (
                        <>
                          <span className="font-semibold text-ink-900">
                            {e.result.rating!.toFixed(1)}
                          </span>
                          <span className="text-ink-400"> / 5</span>
                          {e.result.band && (
                            <span className="mt-0.5 block text-[11px] text-ink-500">
                              {e.result.band.faRating}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {e && verdict ? (
                        <>
                          <Badge tone={OUTCOME_OVERRIDE[e.outcome]?.tone ?? verdict.tone}>
                            {OUTCOME_OVERRIDE[e.outcome]?.label ?? verdict.label}
                          </Badge>
                          {e.supportCase && (
                            <span className="mt-1 block">
                              <Link href={`/admin/support`} className="hover:underline">
                                <Badge tone={CASE_TONE[e.supportCase.status] ?? "muted"}>
                                  Support case
                                </Badge>
                              </Link>
                            </span>
                          )}
                          {e.readiness && (
                            <span className="mt-1 block text-[11px] text-ink-500">
                              Ready: {e.readiness}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {e ? (
                        <span className={e.journalComplete ? "text-ink-900" : "text-ink-300"}>
                          {e.journalComplete ? "✓" : "—"}
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-center text-ink-700">
                      {e ? (e.deliveries || <span className="text-ink-300">—</span>) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-500">
        Hours and ratings come from each course&apos;s register, and change there. Coursework
        completion for the online courses is on{" "}
        <Link href="/admin/progress" className="underline">
          Progress
        </Link>
        .
      </p>
    </>
  );
}
