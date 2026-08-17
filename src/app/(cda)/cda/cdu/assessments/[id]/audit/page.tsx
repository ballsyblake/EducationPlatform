import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireCdu } from "@/lib/cda/access";
import { prisma } from "@/lib/db";
import { displayName, formatDateTime } from "@/lib/format";
import { notFound } from "next/navigation";

export const metadata = { title: "Audit trail" };

/**
 * Who did what on one club's assessment.
 *
 * Every write in the portal already records its author — the schema has carried
 * `assessorId`, `resolvedById`, `verifiedById`, `lockedById` and the review's
 * responder and appeal decider from the start. What was missing was anywhere to
 * read them together, which is the only form in which they answer the question
 * anybody actually asks: is this rating sound, and who stands behind each part
 * of it?
 *
 * It earns its place now that a Club Development Unit account can also hold line
 * items. FQ's decision was to allow that without restriction and keep a record
 * instead, so the record has to be legible: the overlap it creates — an item
 * settled by one of the people who scored it — is called out by name rather than
 * left for somebody to reconstruct from two screens and a good memory.
 */
export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCdu();
  const { id } = await params;

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id },
    include: {
      club: { select: { name: true } },
      cycle: { select: { name: true } },
      lockedBy: true,
      scores: {
        include: {
          assessor: true,
          criterion: { select: { id: true, code: true, title: true, position: true } },
        },
      },
      finalScores: {
        include: {
          resolvedBy: true,
          criterion: { select: { id: true, code: true, title: true, position: true } },
        },
      },
      nonNegotiables: {
        include: {
          verifiedBy: true,
          nonNegotiable: { select: { code: true, title: true, position: true } },
        },
        orderBy: { nonNegotiable: { position: "asc" } },
      },
      review: {
        include: { submittedBy: true, respondedBy: true, appealDecidedBy: true },
      },
    },
  });

  if (!assessment) notFound();

  /* ----------------------- one row per line item -------------------------- */

  type Row = {
    criterionId: string;
    code: string;
    title: string;
    position: number;
    scores: { who: string; stars: number; at: Date }[];
    resolved: { who: string | null; at: Date; stars: number; rationale: string | null } | null;
    /** True when the person who settled the item also scored it. */
    selfResolved: boolean;
  };

  const rows = new Map<string, Row>();

  const row = (c: { id: string; code: string; title: string; position: number }) => {
    const found = rows.get(c.id);
    if (found) return found;
    const made: Row = {
      criterionId: c.id,
      code: c.code,
      title: c.title,
      position: c.position,
      scores: [],
      resolved: null,
      selfResolved: false,
    };
    rows.set(c.id, made);
    return made;
  };

  const scoredBy = new Map<string, Set<string>>();

  for (const s of assessment.scores) {
    const r = row(s.criterion);
    r.scores.push({ who: displayName(s.assessor), stars: s.stars, at: s.updatedAt });
    const set = scoredBy.get(s.criterionId) ?? new Set<string>();
    set.add(s.assessorId);
    scoredBy.set(s.criterionId, set);
  }

  for (const f of assessment.finalScores) {
    const r = row(f.criterion);
    r.resolved = {
      who: f.resolvedBy ? displayName(f.resolvedBy) : null,
      at: f.resolvedAt,
      stars: f.stars,
      rationale: f.rationale,
    };
    r.selfResolved =
      f.resolvedById !== null && (scoredBy.get(f.criterionId)?.has(f.resolvedById) ?? false);
  }

  const lineItems = [...rows.values()].sort((a, b) => a.position - b.position);
  for (const r of lineItems) r.scores.sort((a, b) => a.at.getTime() - b.at.getTime());

  const selfResolved = lineItems.filter((r) => r.selfResolved);
  const verified = assessment.nonNegotiables.filter((n) => n.verifiedBy);

  /* ------------------------------ milestones ------------------------------ */

  const milestones: { at: Date; what: string; who: string | null }[] = [];
  if (assessment.clubSubmittedAt) {
    milestones.push({ at: assessment.clubSubmittedAt, what: "Club submitted its data", who: null });
  }
  if (assessment.lockedAt) {
    milestones.push({
      at: assessment.lockedAt,
      what: "Scores locked and the result frozen",
      who: assessment.lockedBy ? displayName(assessment.lockedBy) : null,
    });
  }
  if (assessment.publishedAt) {
    milestones.push({ at: assessment.publishedAt, what: "Released to the club", who: null });
  }
  const review = assessment.review;
  if (review) {
    milestones.push({
      at: review.submittedAt,
      what: "Club asked for a review",
      who: review.submittedBy ? displayName(review.submittedBy) : null,
    });
    if (review.respondedAt) {
      milestones.push({
        at: review.respondedAt,
        what: "Unit responded to the review",
        who: review.respondedBy ? displayName(review.respondedBy) : null,
      });
    }
    if (review.appealedAt) {
      milestones.push({ at: review.appealedAt, what: "Club appealed to the CEO", who: null });
    }
    if (review.appealDecidedAt) {
      milestones.push({
        at: review.appealDecidedAt,
        what: "Appeal decided",
        who: review.appealDecidedBy ? displayName(review.appealDecidedBy) : null,
      });
    }
  }
  milestones.sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle={`Who scored, settled and signed off each part of ${assessment.club.name}'s ${assessment.cycle.name}.`}
        breadcrumb={{ href: `/cda/cdu/assessments/${id}`, label: assessment.club.name }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Line items with a record"
          value={lineItems.length}
          hint="Scored, settled, or both"
        />
        <StatTile
          label="Settled by their own assessor"
          value={selfResolved.length}
          tone={selfResolved.length > 0 ? "warn" : "good"}
          hint="Same person scored and reconciled"
        />
        <StatTile label="Non-Negotiables verified" value={verified.length} />
      </div>

      {selfResolved.length > 0 && (
        <div className="card card-pad mb-6">
          <h2 className="font-semibold text-ink-900">
            {selfResolved.length} line item{selfResolved.length === 1 ? "" : "s"} settled by one of
            its own assessors
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Allowed, and recorded here rather than prevented: the Unit is small enough that the
            people who run a cycle also score it. It matters if the club challenges one of these
            items, because the person who set the reconciled score is the same person who gave one
            of the independent ones.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {selfResolved.map((r) => (
              <li key={r.criterionId}>
                <Badge tone="warn">
                  {r.code} · {r.resolved?.who}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 font-semibold text-ink-900">Line items</h2>
        {lineItems.length === 0 ? (
          <EmptyState
            title="Nothing scored yet"
            description="Once assessors start scoring, every entry appears here with its author."
          />
        ) : (
          <div className="card divide-y divide-ink-200">
            {lineItems.map((r) => (
              <div key={r.criterionId} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide text-ink-400">{r.code}</span>
                  <span className="font-medium text-ink-900">{r.title}</span>
                  {r.selfResolved && <Badge tone="warn">Settled by its own assessor</Badge>}
                </div>

                <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-ink-500">Independent scores</dt>
                    <dd className="mt-1 space-y-1">
                      {r.scores.length === 0 ? (
                        <span className="text-ink-500">None recorded.</span>
                      ) : (
                        r.scores.map((s) => (
                          <p key={`${s.who}-${s.at.toISOString()}`} className="text-ink-700">
                            <span className="font-medium">{s.who}</span> gave {s.stars} ·{" "}
                            <span className="text-ink-500">{formatDateTime(s.at)}</span>
                          </p>
                        ))
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="font-semibold text-ink-500">Reconciled score</dt>
                    <dd className="mt-1 space-y-1">
                      {!r.resolved ? (
                        <span className="text-ink-500">Not settled yet.</span>
                      ) : (
                        <>
                          <p className="text-ink-700">
                            <span className="font-medium">{r.resolved.who ?? "Unknown"}</span> set{" "}
                            {r.resolved.stars} ·{" "}
                            <span className="text-ink-500">{formatDateTime(r.resolved.at)}</span>
                          </p>
                          {r.resolved.rationale && (
                            <p className="text-ink-600">
                              Rationale: &ldquo;{r.resolved.rationale}&rdquo;
                            </p>
                          )}
                        </>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-semibold text-ink-900">Non-Negotiables</h2>
        <div className="card divide-y divide-ink-200">
          {assessment.nonNegotiables.map((n) => (
            <div key={n.id} className="px-5 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tracking-wide text-ink-400">
                  {n.nonNegotiable.code}
                </span>
                <span className="font-medium text-ink-900">{n.nonNegotiable.title}</span>
                <Badge tone={n.verdict === "PASS" ? "good" : n.verdict === "FAIL" ? "bad" : "muted"}>
                  {n.verdict}
                </Badge>
                {n.shieldMet && <Badge tone="info">Met {n.shieldMet}</Badge>}
                {n.overrideReason && <Badge tone="warn">Departed from the computed level</Badge>}
              </div>
              <p className="mt-1 text-ink-600">
                {n.verifiedBy
                  ? `${displayName(n.verifiedBy)} · ${formatDateTime(n.verifiedAt)}`
                  : "Not verified yet."}
                {n.shieldMetDerived && n.shieldMet && n.shieldMet !== n.shieldMetDerived && (
                  <>
                    {" "}
                    · recorded {n.shieldMet} where the structure computes{" "}
                    {n.shieldMetDerived}
                  </>
                )}
              </p>
              {n.overrideReason && (
                <p className="mt-0.5 text-ink-600">Reason: &ldquo;{n.overrideReason}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-ink-900">Milestones</h2>
        {milestones.length === 0 ? (
          <EmptyState title="Nothing yet" description="The club hasn't submitted its data." />
        ) : (
          <div className="card divide-y divide-ink-200">
            {milestones.map((m) => (
              <div key={`${m.what}-${m.at.toISOString()}`} className="px-5 py-3 text-xs">
                <span className="font-medium text-ink-900">{m.what}</span>
                {m.who && <span className="text-ink-700"> · {m.who}</span>}
                <span className="text-ink-500"> · {formatDateTime(m.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-ink-500">
        Every entry here is recorded at the moment of the write and is not editable.{" "}
        <Link href={`/cda/cdu/assessments/${id}`} className="text-maroon-700 hover:underline">
          Back to the assessment
        </Link>
        .
      </p>
    </>
  );
}
