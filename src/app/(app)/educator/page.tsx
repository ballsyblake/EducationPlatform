import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { countTasks, getAssessorQueue, type AssessorTask } from "@/lib/educator";
import { displayName, formatDate } from "@/lib/format";

export const metadata = { title: "Your coaches" };

/**
 * What each job is called, and what the button on it says.
 *
 * Three jobs, in the order a coach goes through them: somebody watches them
 * deliver, somebody decides whether they have passed, and if they haven't,
 * somebody reviews the reassessment that comes back.
 */
const TASK: Record<AssessorTask["kind"], { badge: string; action: string; tone: "warn" | "ok" }> = {
  deliver: { badge: "Watch them deliver", action: "Assess", tone: "warn" },
  rate: { badge: "Pass or fail", action: "Rate", tone: "ok" },
  review: { badge: "Review the film", action: "Review", tone: "warn" },
};

/**
 * Every coach assigned to this assessor, and what each one still needs.
 *
 * The whole of an assessor's view. It replaced a dashboard, a grading queue and
 * a support desk, which between them held these same three jobs sorted three
 * ways and a page of the program's counts in front of them. A coach needing two
 * things is one row with two tags on it: an assessor going to a ground on
 * Saturday wants the names, not a queue per job.
 *
 * Nothing else is offered, because nothing else is asked of them. The pages
 * under `admin/` still work and are still scoped to the courses they are
 * rostered onto — an assessor who follows a link into one is not stopped — they
 * are simply somebody else's job.
 */
export default async function AssessorPage() {
  const user = await requireStaff();
  const courses = await staffCourseIds(user);
  const rows = await getAssessorQueue({ courses, userId: user.id });
  const counts = countTasks(rows);

  // The absence of a filter is an admin's; an empty list of courses is an
  // assessor nobody has rostered yet, and the two need different words. A case
  // assigned to them by name still reaches the list, so "no courses" only
  // explains an empty one.
  const noCourses = courses !== null && courses.length === 0;

  return (
    <>
      <PageHeader
        title="Your coaches"
        subtitle="Everybody assigned to you who still needs something, and what each of them needs."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="To watch deliver"
          value={counts.deliver}
          tone={counts.deliver ? "warn" : "good"}
          hint="No session written up yet"
        />
        <StatTile
          label="To pass or fail"
          value={counts.rate}
          tone={counts.rate ? "warn" : "good"}
          hint="Deliveries in, no rating set"
        />
        <StatTile
          label="Film to review"
          value={counts.review}
          tone={counts.review ? "warn" : "good"}
          hint="Post-course reassessment"
        />
        <StatTile
          label="Past the deadline"
          value={counts.overdue}
          tone={counts.overdue ? "bad" : "good"}
          hint={counts.overdue ? "Out of time, still open" : "Nobody is out of time"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={noCourses ? "No coaches yet" : "Nobody outstanding"}
          description={
            noCourses
              ? "You aren't on a course team yet, and no reassessment is assigned to you. An admin adds you to a course from its register, or puts your name on a coach's support case, and they appear here."
              : "Every coach assigned to you has been assessed, rated, and has no reassessment waiting on you."
          }
        />
      ) : (
        <div className="card divide-y divide-ink-200">
          {rows.map((row) => (
            <div key={row.key} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar user={row.coach} size="sm" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{displayName(row.coach)}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {[row.courseTitle, row.catchUp ? "Catching up" : row.clubName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </div>

              {/* One line per job, each its own link: a coach who needs two
                  things needs them done in two places, and a single row-wide
                  link would have to pick one of them. */}
              <div className="mt-3 space-y-2">
                {row.tasks.map((task) => (
                  <Link
                    key={task.kind}
                    href={task.href}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 hover:bg-ink-100"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge tone={task.overdue ? "bad" : TASK[task.kind].tone}>
                        {TASK[task.kind].badge}
                      </Badge>
                      {task.detail && <span className="text-sm text-ink-600">{task.detail}</span>}
                      {task.deadline && (
                        <span className={`text-sm ${task.overdue ? "text-maroon-700" : "text-ink-500"}`}>
                          {task.overdue ? "was due " : "due "}
                          {formatDate(task.deadline)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap text-maroon-700">
                      {TASK[task.kind].action} →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
