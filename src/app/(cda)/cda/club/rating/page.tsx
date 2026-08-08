import { ShieldBadge } from "@/components/cda/shield";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { ratingVisibleToClub } from "@/lib/cda/access";
import { DOMAIN_BLURBS, DOMAIN_LABELS, SHIELD_LABELS } from "@/lib/cda/rubric";
import { pct } from "@/lib/cda/scoring";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { clubContext } from "../club-context";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Our rating" };

const DOMAIN_ORDER: Domain[] = ["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"];

/**
 * What the club is allowed to see of its own result.
 *
 * Deliberately narrower than the CDU's report: the shield, the overall
 * percentage, each domain's score, and the Non-Negotiable verdicts. No weights,
 * no shield thresholds, no criterion-level stars and no assessor names. A club
 * that can see exactly which criterion moved them from Silver to Gold will
 * optimise for the criterion rather than for the football, and an assessor
 * whose individual scores are attributable to them by the club they assessed is
 * an assessor under pressure next cycle.
 */
export default async function ClubRatingPage() {
  const { club, assessment } = await clubContext();

  if (!club || !assessment) {
    return <EmptyState title="No assessment open" description="Nothing to show yet." />;
  }

  if (!ratingVisibleToClub(assessment.status)) {
    return (
      <>
        <PageHeader
          title="Our rating"
          breadcrumb={{ href: "/cda/club", label: "Club overview" }}
        />
        <EmptyState
          title="Your rating hasn't been released yet"
          description="Football Queensland releases ratings once every club in the cycle has been assessed and reviewed. You'll be able to see your result here as soon as it is."
        />
      </>
    );
  }

  const domains: Record<Domain, number> = {
    TECHNICAL: assessment.technicalPct ?? 0,
    PLANNING: assessment.planningPct ?? 0,
    DELIVERY: assessment.deliveryPct ?? 0,
    OUTCOMES: assessment.outcomesPct ?? 0,
  };

  const shield = assessment.eligible ? (assessment.finalShield ?? "NONE") : null;

  const previous = await prisma.clubAssessment.findFirst({
    where: { clubId: club.id, status: "PUBLISHED", cycleId: { not: assessment.cycleId } },
    include: { cycle: true },
    orderBy: { cycle: { year: "desc" } },
  });

  const failed = assessment.nonNegotiables.filter((n) => n.verdict === "FAIL");

  return (
    <>
      <PageHeader
        title="Our rating"
        subtitle={`Released ${formatDate(assessment.publishedAt)}`}
        breadcrumb={{ href: "/cda/club", label: "Club overview" }}
      />

      <div className="mb-6 card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-title">Shield awarded</p>
            <div className="mt-2 flex items-center gap-3">
              <ShieldBadge shield={shield} size="lg" />
              <span className="text-3xl font-bold tabular-nums text-ink-900">
                {pct(assessment.finalPercent ?? 0)}
              </span>
            </div>
            {previous && (
              <p className="mt-2 text-sm text-ink-500">
                {previous.cycle.name}:{" "}
                {previous.eligible
                  ? SHIELD_LABELS[previous.finalShield ?? "NONE"]
                  : "Not eligible"}{" "}
                ({pct(previous.finalPercent ?? 0, 0)})
              </p>
            )}
          </div>
        </div>

        {shield === null && (
          <div className="mt-4 rounded-lg bg-maroon-50 px-4 py-3">
            <p className="font-semibold text-maroon-800">No shield awarded this cycle</p>
            <p className="mt-1 text-sm text-maroon-800">
              Your club scored {pct(assessment.finalPercent ?? 0)}, but{" "}
              {failed.length === 1 ? "one Non-Negotiable was" : `${failed.length} Non-Negotiables were`}{" "}
              not met. All nine must be met before any shield can be awarded, regardless of score.
            </p>
            <ul className="mt-2 space-y-1">
              {failed.map((f) => (
                <li key={f.id} className="text-sm text-maroon-800">
                  <span className="font-medium">
                    {f.nonNegotiable.code} — {f.nonNegotiable.title}
                  </span>
                  {f.adminNote && <span className="block text-maroon-700">{f.adminNote}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {assessment.summary && (
          <div className="mt-4 border-t border-ink-200 pt-4">
            <p className="section-title mb-1">From the Club Development Unit</p>
            <p className="prose-note">{assessment.summary}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="section-title mb-3">How you scored by area</h2>
          <div className="card divide-y divide-ink-200">
            {DOMAIN_ORDER.map((domain) => (
              <div key={domain} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-ink-900">{DOMAIN_LABELS[domain]}</p>
                  <p className="text-lg font-semibold tabular-nums text-ink-900">
                    {pct(domains[domain], 0)}
                  </p>
                </div>
                <div className="mt-2">
                  <ProgressBar value={domains[domain]} />
                </div>
                <p className="mt-1.5 text-xs text-ink-500">{DOMAIN_BLURBS[domain]}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">Non-Negotiables</h2>
          <div className="card divide-y divide-ink-200">
            {assessment.nonNegotiables.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {n.nonNegotiable.code} — {n.nonNegotiable.title}
                  </p>
                  {n.verdict === "FAIL" && n.adminNote && (
                    <p className="mt-0.5 text-xs text-maroon-700">{n.adminNote}</p>
                  )}
                </div>
                <Badge tone={n.verdict === "PASS" ? "good" : n.verdict === "FAIL" ? "bad" : "muted"}>
                  {n.verdict === "PASS" ? "Met" : n.verdict === "FAIL" ? "Not met" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-ink-500">
            To discuss your rating or the detail behind it, contact the Club Development Unit — they
            can take you through the assessors&apos; findings in full.
          </p>
        </section>
      </div>
    </>
  );
}
