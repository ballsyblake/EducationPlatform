import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireCdu } from "@/lib/cda/access";
import { activeCycle } from "@/lib/cda/assessment";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import { setUserActive } from "../actions";
import { AddAssessorForm } from "./add-assessor-form";
import { SignInLink } from "./sign-in-link";

export const metadata = { title: "Assessors" };

export default async function AssessorsPage() {
  await requireCdu();
  const cycle = await activeCycle();

  const assessors = await prisma.user.findMany({
    where: { role: "ASSESSOR" },
    include: {
      sessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
      assessorAssignments: {
        where: cycle ? { assessment: { cycleId: cycle.id } } : undefined,
        include: { assessment: { include: { club: true } } },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const criteriaCount = await prisma.criterion.count({
    where: { active: true, domain: { in: ["PLANNING", "DELIVERY", "OUTCOMES"] } },
  });

  const scoreCounts = await prisma.assessorScore.groupBy({
    by: ["assessorId", "assessmentId"],
    where: cycle ? { assessment: { cycleId: cycle.id } } : undefined,
    _count: { _all: true },
  });
  const scored = new Map(
    scoreCounts.map((c) => [`${c.assessorId}:${c.assessmentId}`, c._count._all]),
  );

  const active = assessors.filter((a) => a.active);
  const totalAssignments = active.reduce((n, a) => n + a.assessorAssignments.length, 0);
  const outstanding = active.reduce(
    (n, a) => n + a.assessorAssignments.filter((x) => !x.submittedAt).length,
    0,
  );

  return (
    <>
      <PageHeader
        title="Assessors"
        subtitle={`The assessor pool${cycle ? ` and their load for ${cycle.name}` : ""}.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active assessors" value={active.length} />
        <StatTile label="Club assignments" value={totalAssignments} />
        <StatTile
          label="Outstanding"
          value={outstanding}
          tone={outstanding > 0 ? "warn" : "good"}
          hint="Not yet submitted"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          {assessors.length === 0 ? (
            <EmptyState
              title="No assessors yet"
              description="Add the assessors who'll score clubs this cycle."
            />
          ) : (
            <div className="card divide-y divide-ink-200">
              {assessors.map((a) => (
                <div key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink-900">{displayName(a)}</p>
                        {!a.active && <Badge tone="bad">Deactivated</Badge>}
                        {a.active && !a.sessions[0] && <Badge tone="warn">Never signed in</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {a.title ? `${a.title} · ` : ""}
                        {a.email}
                        {a.sessions[0] && ` · last seen ${formatDate(a.sessions[0].lastSeenAt)}`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-start gap-2">
                      <SignInLink userId={a.id} disabled={!a.active} />
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={a.id} />
                        <input type="hidden" name="active" value={a.active ? "false" : "true"} />
                        <SubmitButton
                          className={a.active ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
                          pendingLabel="…"
                          confirm={
                            a.active
                              ? "Deactivate this assessor? They'll be signed out immediately. Their existing scores are kept."
                              : undefined
                          }
                        >
                          {a.active ? "Deactivate" : "Reactivate"}
                        </SubmitButton>
                      </form>
                    </div>
                  </div>

                  {a.assessorAssignments.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {a.assessorAssignments.map((assignment) => {
                        const n = scored.get(`${a.id}:${assignment.assessmentId}`) ?? 0;
                        return (
                          <li key={assignment.id}>
                            <Link
                              href={`/cda/cdu/assessments/${assignment.assessmentId}`}
                              className="flex items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1 text-xs hover:bg-ink-50"
                            >
                              <span className="text-ink-700">{assignment.assessment.club.name}</span>
                              {assignment.submittedAt ? (
                                <Badge tone="good">In</Badge>
                              ) : (
                                <span className="tabular-nums text-ink-400">
                                  {n}/{criteriaCount}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-ink-400">No clubs assigned this cycle.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside>
          <div className="card card-pad">
            <h2 className="mb-4 font-semibold text-ink-900">Add an assessor</h2>
            <AddAssessorForm />
          </div>

          <p className="mt-4 text-xs text-ink-500">
            Assessors are assigned to clubs from the assessment page, up to three per club. Removing
            an assessor from a club deletes the scores they gave it.
          </p>
        </aside>
      </div>
    </>
  );
}
