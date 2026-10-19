import Link from "next/link";
import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { getGradingQueueCounts } from "@/lib/coursework";
import { getEducatorOutstanding } from "@/lib/educator";
import type { User } from "@prisma-client";

/** One thing to do, with the figure and the page it gets done on. */
function WorkRow({
  href,
  count,
  one,
  many,
  blurb,
  tone = "warn",
}: {
  href: string;
  count: number;
  /** What one of them is called, and what several are. */
  one: string;
  many: string;
  blurb: string;
  tone?: "warn" | "bad";
}) {
  if (count === 0) return null;
  const strong = tone === "bad";
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 transition-colors ${
        strong
          ? "border-maroon-300 bg-maroon-50 hover:bg-maroon-100"
          : "border-highlight-orange/40 bg-status-orange-bg"
      }`}
    >
      <div>
        <p className={`font-semibold ${strong ? "text-maroon-800" : "text-status-orange-fg"}`}>
          {count} {count === 1 ? one : many}
        </p>
        <p className={`text-sm ${strong ? "text-maroon-700" : "text-status-orange-fg"}`}>{blurb}</p>
      </div>
      <span
        className={`text-sm font-semibold whitespace-nowrap ${
          strong ? "text-maroon-800" : "text-status-orange-fg"
        }`}
      >
        Open →
      </span>
    </Link>
  );
}

/**
 * What an educator is being asked for, and where to go and do it.
 *
 * Deliberately not the coach dashboard with staff banners bolted on top of it,
 * which is what this was: an educator landed on their own coursework progress —
 * a progress bar over nothing, since educators are rarely enrolled — with the
 * two things actually waiting on them below the fold as callouts. The figures
 * here come from `getEducatorOutstanding`, which the two pages below it draw
 * from as well, so the dashboard cannot count a job the list doesn't show.
 */
export async function EducatorDashboard({
  user,
  enrolments,
}: {
  user: User;
  /** Courses this account is enrolled on as a coach, which some educators are. */
  enrolments: number;
}) {
  const scope = await staffCourseIds(user);
  const { total: ungraded } = await getGradingQueueCounts(scope);
  const out = await getEducatorOutstanding(scope, ungraded);

  const firstName = user.name?.trim().split(/\s+/)[0];
  const noCourses = scope !== null && scope.length === 0;

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : "Your dashboard"}
        subtitle={
          noCourses
            ? "You aren't on a course team yet."
            : out.total > 0
              ? `${out.total} thing${out.total === 1 ? "" : "s"} outstanding across your courses${
                  out.pastDeadline ? ` · ${out.pastDeadline} support case past its deadline` : ""
                }`
              : "Nothing outstanding on your courses."
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="To assess"
          value={out.unassessed}
          tone={out.unassessed ? "warn" : "good"}
          hint="No delivery written up"
        />
        <StatTile
          label="To rate"
          value={out.unrated}
          tone={out.unrated ? "warn" : "good"}
          hint="Delivery in, no rating"
        />
        <StatTile
          label="Support, waiting on you"
          value={out.toReview}
          tone={out.toReview ? "warn" : "good"}
          hint="Film in, or a write-up owed"
        />
        <StatTile
          label="Past the deadline"
          value={out.pastDeadline}
          tone={out.pastDeadline ? "bad" : "good"}
          hint={out.pastDeadline ? "Open cases out of time" : "Nobody is out of time"}
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">What&apos;s outstanding</h2>
        {out.total === 0 ? (
          <EmptyState
            title={noCourses ? "No courses yet" : "Nothing outstanding"}
            description={
              noCourses
                ? "An admin adds you to a course team from its register. The coaches on it, and their post-course support, appear here."
                : "Every coach on your courses has been assessed and rated, and no support case is waiting on you."
            }
          />
        ) : (
          <div className="space-y-3">
            {/* Ordered by whose clock it is. A deadline that has gone is
                somebody's time running out; a coach nobody has rung is next;
                work sitting in an inbox is last, because it is already in
                hand. */}
            <WorkRow
              href="/educator/support"
              count={out.pastDeadline}
              one="support case past its deadline"
              many="support cases past their deadline"
              blurb="An assessment, more time asked for, or closing — but not leaving."
              tone="bad"
            />
            <WorkRow
              href="/educator/support"
              count={out.toBook}
              one="coach to reach out to"
              many="coaches to reach out to"
              blurb="No availability on file, so there is no live assessment to book yet."
            />
            <WorkRow
              href="/educator/support"
              count={out.toSchedule}
              one="live assessment to put a date on"
              many="live assessments to put a date on"
              blurb="They have told you when a visit suits."
            />
            <WorkRow
              href="/educator/support"
              count={out.toChase}
              one="coach with film overdue"
              many="coaches with film overdue"
              blurb="Asked for footage, and the date has gone."
            />
            <WorkRow
              href="/educator/support"
              count={out.toReview}
              one="delivery to review"
              many="deliveries to review"
              blurb="Film that has come in, and observations still to write up."
            />
            <WorkRow
              href="/educator/grading"
              count={out.unassessed}
              one="coach not yet watched deliver"
              many="coaches not yet watched deliver"
              blurb="On course, with no delivery written up."
            />
            <WorkRow
              href="/educator/grading"
              count={out.unrated}
              one="coach awaiting a course rating"
              many="coaches awaiting a course rating"
              blurb="Their deliveries are written up; the judgement across them isn't."
            />
            {/* Coursework is not what these diplomas are assessed on — the B
                Diploma cohorts carry none — so it is last and only appears
                where there is some. The queue itself is still the program's
                page; this is the only place an educator would learn it had
                anything in it. */}
            <WorkRow
              href="/admin/grading"
              count={out.ungraded}
              one="piece of coursework unmarked"
              many="pieces of coursework unmarked"
              blurb="Submissions and quiz attempts on your courses."
            />
          </div>
        )}
      </section>

      {/* An educator sitting their own diploma keeps their own coursework —
          it is just not what they opened this page for. */}
      {enrolments > 0 && (
        <section>
          <Link
            href="/courses"
            className="card card-pad flex items-center justify-between gap-4 hover:bg-ink-50"
          >
            <div>
              <p className="font-semibold text-ink-900">Your own coursework</p>
              <p className="text-sm text-ink-500">
                You are enrolled on {enrolments} course
                {enrolments === 1 ? "" : "s"} as a coach.
              </p>
            </div>
            <span className="text-sm font-medium whitespace-nowrap text-maroon-700">
              Open courses →
            </span>
          </Link>
        </section>
      )}
    </>
  );
}
