import Link from "next/link";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { isAdmin, requireStaff } from "@/lib/auth";
import { getCohortRows, type CohortRow } from "@/lib/cohorts";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Cohorts" };

/**
 * Where a cohort is, in one phrase.
 *
 * Draft first because an unpublished course isn't running at all, and closed
 * last because it is the only state that ends the argument.
 */
function phaseOf(row: CohortRow): { label: string; tone: "muted" | "info" | "warn" | "good" } {
  if (row.standing.closed) return { label: "Closed", tone: "muted" };
  if (!row.published) return { label: "Draft", tone: "warn" };
  if (row.days === 0) return { label: "No dates set", tone: "warn" };
  if (row.standing.delivered) return { label: "Delivered", tone: "info" };
  if (row.daysTaken === 0) return { label: "Not started", tone: "muted" };
  return { label: `Day ${row.daysTaken} of ${row.days}`, tone: "good" };
}

export default async function CohortsPage() {
  const user = await requireStaff();
  const scope = await staffCourseIds(user);
  const rows = await getCohortRows(scope);

  const live = rows.filter((r) => !r.standing.closed && r.published);
  const needsFinishing = rows.filter(
    (r) => !r.standing.closed && r.standing.delivered && r.standing.outstanding.length > 0,
  );
  const owed = rows.reduce(
    (n, r) => n + (r.standing.closed ? 0 : r.standing.outstanding.reduce((m, o) => m + o.count, 0)),
    0,
  );
  const coaches = live.reduce((n, r) => n + r.coaches, 0);

  return (
    <>
      <PageHeader
        title="Cohorts"
        subtitle={
          isAdmin(user)
            ? "Every course, and what each one still owes somebody."
            : "The courses you are rostered onto, and what each still owes."
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Running" value={live.length} hint="Published and not closed" />
        {/* Enrolments, not people: a coach sitting two cohorts is two of these,
            and calling it "coaches" would quietly disagree with the Coaches
            tab about how many there are. */}
        <StatTile label="Enrolments" value={coaches} hint="A coach on two counts twice" />
        <StatTile
          label="Delivered, not finished"
          value={needsFinishing.length}
          tone={needsFinishing.length ? "warn" : "good"}
          hint="Last day gone, still owing"
        />
        <StatTile
          label="Things outstanding"
          value={owed}
          tone={owed ? "warn" : "good"}
          hint="Across every open cohort"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No courses yet"
          description="A cohort appears here once it exists. Create one from Manage."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const phase = phaseOf(row);
            const total = row.standing.outstanding.reduce((n, o) => n + o.count, 0);
            return (
              <section key={row.id} className="card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/courses/${row.id}`}
                      className="font-semibold text-ink-900 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {row.season ? `${row.season} · ` : ""}
                      {row.coaches} enrolled
                      {row.standing.lastDay ? ` · last day ${formatDate(row.standing.lastDay)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={phase.tone}>{phase.label}</Badge>
                    {total > 0 && !row.standing.closed && (
                      <Badge tone="warn">
                        {total} outstanding
                      </Badge>
                    )}
                    {total === 0 && row.standing.delivered && !row.standing.closed && (
                      <Badge tone="good">Ready to close</Badge>
                    )}
                  </div>
                </div>

                {/* The two numbers that decide whether a cohort is finished, and
                    that nothing else showed side by side. */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="flex items-baseline justify-between text-xs text-ink-500">
                      <span>Hours sat</span>
                      <span>
                        {row.attendancePct === null
                          ? "no days taken yet"
                          : `${row.attendancePct}%`}
                        {row.coachesShort > 0 && ` · ${row.coachesShort} short`}
                      </span>
                    </div>
                    <ProgressBar value={row.attendancePct ?? 0} />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between text-xs text-ink-500">
                      <span>Results recorded</span>
                      <span>
                        {row.resultsIn} of {row.resultsDue}
                      </span>
                    </div>
                    <ProgressBar
                      value={row.resultsDue ? Math.round((row.resultsIn / row.resultsDue) * 100) : 0}
                    />
                  </div>
                </div>

                {row.standing.outstanding.length > 0 && !row.standing.closed && (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
                    {row.standing.outstanding.map((item) => (
                      <li key={item.key}>
                        <span className="font-medium text-ink-900">{item.count}</span>{" "}
                        {item.label}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link
                    href={`/admin/courses/${row.id}/register`}
                    className="font-medium text-maroon-700 hover:underline"
                  >
                    Register →
                  </Link>
                  <Link
                    href={`/admin/coaches?course=${row.id}`}
                    className="font-medium text-maroon-700 hover:underline"
                  >
                    Coaches →
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
