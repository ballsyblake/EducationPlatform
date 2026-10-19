import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { getDeliveryQueue, type DeliveryRow } from "@/lib/educator";
import { displayName, formatDate } from "@/lib/format";

export const metadata = { title: "Grading" };

/**
 * Who is still owed a delivery assessment, across the educator's courses.
 *
 * The write-up itself stays on the course page — that form knows the course's
 * days, its pass mark and its roster, and a second copy of it here would be a
 * second thing to keep in step with the rubric. This page answers the question
 * the course page cannot: of the four cohorts I am on, who have I still got to
 * watch?
 */
export default async function EducatorGradingPage() {
  const user = await requireStaff();
  const scope = await staffCourseIds(user);
  const rows = await getDeliveryQueue(scope);

  // Grouped by cohort, because an educator works a course at a time: they are
  // going to one ground on Saturday, and the three names there are one trip.
  const byCourse = new Map<string, { title: string; rows: DeliveryRow[] }>();
  for (const row of rows) {
    const group = byCourse.get(row.courseId) ?? {
      title: row.courseTitle,
      rows: [],
    };
    group.rows.push(row);
    byCourse.set(row.courseId, group);
  }

  const unassessed = rows.filter((r) => r.need === "unassessed").length;
  const unrated = rows.filter((r) => r.need === "unrated").length;

  return (
    <>
      <PageHeader
        title="Grading"
        subtitle="Coaches on your courses still to be assessed on a session they deliver."
      />

      <div className="mb-8 grid grid-cols-2 gap-4">
        <StatTile
          label="Not yet watched"
          value={unassessed}
          tone={unassessed ? "warn" : "good"}
          hint="No delivery written up"
        />
        <StatTile
          label="Awaiting a rating"
          value={unrated}
          tone={unrated ? "warn" : "good"}
          hint="Delivery in, course rating not set"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={scope !== null && scope.length === 0 ? "No courses yet" : "Nobody outstanding"}
          description={
            scope !== null && scope.length === 0
              ? "You aren't on a course team yet. An admin adds you to a course from its register, and the coaches on it appear here."
              : "Every coach on your courses has a delivery written up and a rating against it."
          }
        />
      ) : (
        <div className="space-y-8">
          {[...byCourse].map(([courseId, group]) => (
            <section key={courseId}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink-900">{group.title}</h2>
                <Link href={`/admin/courses/${courseId}/assess`} className="btn-secondary btn-sm">
                  Open the course →
                </Link>
              </div>
              <div className="card divide-y divide-ink-200">
                {group.rows.map((row) => (
                  <Link
                    key={row.enrollmentId}
                    href={`/admin/courses/${courseId}/assess`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar user={row.coach} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900">{displayName(row.coach)}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {[
                            row.catchUp ? "Catching up" : row.clubName,
                            row.deliveries > 0 &&
                              `${row.deliveries} deliver${row.deliveries === 1 ? "y" : "ies"} written up`,
                            row.lastDeliveryAt && `last ${formatDate(row.lastDeliveryAt)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={row.need === "unassessed" ? "warn" : "ok"}>
                        {row.need === "unassessed" ? "Not yet watched" : "Needs a rating"}
                      </Badge>
                      <span className="text-sm font-medium whitespace-nowrap text-maroon-700">
                        Write up →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
