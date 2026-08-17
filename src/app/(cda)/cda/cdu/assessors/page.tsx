import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { ASSESSOR_POOL_WHERE, requireCdu } from "@/lib/cda/access";
import { activeCycle } from "@/lib/cda/assessment";
import { prisma } from "@/lib/db";
import { displayName, formatDate } from "@/lib/format";
import { setUserActive } from "../actions";
import { AddAssessorForm } from "./add-assessor-form";
import { RemoveFromPool } from "./remove-from-pool";
import { SignInLink } from "./sign-in-link";

export const metadata = { title: "Assessors" };

export default async function AssessorsPage() {
  await requireCdu();
  const cycle = await activeCycle();

  const assessors = await prisma.user.findMany({
    where: ASSESSOR_POOL_WHERE,
    include: {
      sessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
      criterionAssignments: {
        where: cycle ? { pool: { cycleId: cycle.id } } : undefined,
        include: {
          criterion: { select: { code: true, title: true } },
          pool: { select: { id: true, name: true, _count: { select: { assessments: true } } } },
        },
        orderBy: { criterion: { position: "asc" } },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const criteriaCount = await prisma.criterion.count({
    where: { active: true, domain: { in: ["PLANNING", "DELIVERY", "OUTCOMES"] } },
  });

  const scoreCounts = await prisma.assessorScore.groupBy({
    by: ["assessorId", "criterionId"],
    where: cycle ? { assessment: { cycleId: cycle.id } } : undefined,
    _count: { _all: true },
  });
  const scored = new Map(
    scoreCounts.map((c) => [`${c.assessorId}:${c.criterionId}`, c._count._all]),
  );

  const active = assessors.filter((a) => a.active);
  const totalAssignments = active.reduce((n, a) => n + a.criterionAssignments.length, 0);
  const outstanding = active.reduce(
    (n, a) => n + a.criterionAssignments.filter((x) => !x.submittedAt).length,
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
        <StatTile label="Line items held" value={totalAssignments} />
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
                        {a.role === "ADMIN" && <Badge tone="info">Club Development Unit</Badge>}
                        {!a.active && <Badge tone="bad">Deactivated</Badge>}
                        {a.active && a.role !== "ADMIN" && !a.sessions[0] && (
                          <Badge tone="warn">Never signed in</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {a.title ? `${a.title} · ` : ""}
                        {a.email}
                        {a.sessions[0] && ` · last seen ${formatDate(a.sessions[0].lastSeenAt)}`}
                      </p>
                    </div>

                    {/* A CDU account gets neither control. It already has a way
                        in, so a sign-in link is pointless; and deactivating it
                        would switch off how somebody runs the cycle, which the
                        assessors page has no business doing. Removing them from
                        the pool is the action that belongs here. */}
                    <div className="flex flex-wrap items-start gap-2">
                      {a.role === "ADMIN" ? (
                        <RemoveFromPool userId={a.id} name={displayName(a)} />
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>

                  {a.criterionAssignments.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {a.criterionAssignments.map((assignment) => {
                        const clubs = assignment.pool._count.assessments;
                        const n = Math.min(scored.get(`${a.id}:${assignment.criterionId}`) ?? 0, clubs);
                        return (
                          <li key={assignment.id}>
                            <Link
                              href={`/cda/cdu/pools/${assignment.pool.id}`}
                              title={assignment.criterion.title}
                              className="flex items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1 text-xs hover:bg-ink-50"
                            >
                              <span className="text-ink-400">Pool {assignment.pool.name}</span>
                              <span className="text-ink-700">{assignment.criterion.code}</span>
                              {assignment.submittedAt ? (
                                <Badge tone="good">In</Badge>
                              ) : (
                                <span className="tabular-nums text-ink-400">
                                  {n}/{clubs}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-ink-400">No line items allocated this cycle.</p>
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
            Assessors are allocated a line item across a whole pool, from that pool&apos;s page.
            Slots 1 and 2 assess independently; slot 3 exists only to break a split between them.
            Removing an assessor from a line item deletes the scores they gave it across the pool.
          </p>
        </aside>
      </div>
    </>
  );
}
