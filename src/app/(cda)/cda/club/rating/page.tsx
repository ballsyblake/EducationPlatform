import Link from "next/link";
import { AreaBreakdown } from "@/components/cda/areas";
import { ShieldBadge } from "@/components/cda/shield";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { RELEASED_STATUSES, ratingVisibleToClub } from "@/lib/cda/access";
import { DOMAIN_BLURBS, DOMAIN_LABELS, SHIELD_LABELS } from "@/lib/cda/rubric";
import { STAGE_LABELS, ratingSettled, reviewTimeline } from "@/lib/cda/review";
import { pct } from "@/lib/cda/scoring";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { loadAssessment } from "@/lib/cda/assessment";
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
    where: {
      clubId: club.id,
      status: { in: [...RELEASED_STATUSES] },
      cycleId: { not: assessment.cycleId },
    },
    include: { cycle: true },
    orderBy: { cycle: { year: "desc" } },
  });

  // The macro-area grades and the Unit's paragraph on each — the part of the
  // report a club can actually act on. A domain percentage says Delivery was
  // 63%; this says match day was the problem and training wasn't.
  const overview = await loadAssessment(assessment.id);

  // Everything holding the shield back, in the club's own words: a failed gate,
  // and a notice FQ's limits refused. A refused notice reads as a failure, and
  // a club told it has no shield with nothing listed underneath has been given
  // a verdict without a reason.
  const blocking = new Set(
    [...overview.rating.eligibility.failed, ...overview.rating.eligibility.noticesRefused].map(
      (n) => n.code,
    ),
  );
  const failed = assessment.nonNegotiables.filter((n) => blocking.has(n.nonNegotiable.code));

  const review = await prisma.reviewRequest.findUnique({
    where: { assessmentId: assessment.id },
    select: {
      status: true,
      submittedAt: true,
      respondedAt: true,
      appealedAt: true,
      appealDecidedAt: true,
    },
  });
  const timeline = reviewTimeline({
    status: assessment.status,
    publishedAt: assessment.publishedAt,
    review,
  });
  // From the timeline, not the status column: a window that has lapsed has
  // confirmed the rating under FQ's rules, whether or not the Unit has been
  // back to record it.
  const confirmed = ratingSettled(timeline);

  return (
    <>
      <PageHeader
        title="Our rating"
        subtitle={
          confirmed
            ? `Confirmed — released ${formatDate(assessment.publishedAt)}`
            : `Preliminary — released ${formatDate(assessment.publishedAt)}`
        }
        breadcrumb={{ href: "/cda/club", label: "Club overview" }}
      />

      {/* A preliminary rating is not the club's to publish, and the window to
          challenge it is 8 days. Both facts belong at the top of the report
          rather than in a page a club has to think to visit. */}
      {!confirmed && (
        <div className="mb-6 rounded-lg border border-maroon-300 bg-maroon-50 px-4 py-3">
          <p className="font-semibold text-maroon-800">This is your preliminary rating</p>
          <p className="mt-1 text-sm text-maroon-800">
            {timeline.canRequestReview ? (
              <>
                If you believe evidence for a line item was missed, you can ask for it to be
                reviewed until {formatDate(timeline.deadline!)}
                {timeline.daysLeft !== null && timeline.daysLeft >= 0 && (
                  <>
                    {" "}
                    — {timeline.daysLeft === 0
                      ? "today is the last day"
                      : `${timeline.daysLeft} day${timeline.daysLeft === 1 ? "" : "s"} left`}
                  </>
                )}
                . Your rating confirms itself once the window closes.
              </>
            ) : (
              <>{STAGE_LABELS[timeline.stage]}. Your rating is not yet confirmed.</>
            )}
          </p>
          <Link href="/cda/club/review" className="btn-primary btn-sm mt-3">
            {timeline.canRequestReview ? "Request a review" : "See your review"}
          </Link>
        </div>
      )}

      {confirmed && (
        <div className="mb-6 rounded-lg bg-status-green-bg px-4 py-3">
          <p className="text-sm text-status-green-fg">
            <span className="font-semibold">Confirmed.</span> This is the rating your club may
            communicate by displaying its Club Shield.
          </p>
        </div>
      )}

      <div className="mb-6 card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {/* Development Committed is a badge, not a shield — labelling it
                "Shield awarded" would tell the club it holds something FQ
                hasn't issued, and the shield is the only thing a club is
                permitted to publish. */}
            <p className="section-title">
              {overview.rating.developmentBadge ? "Awarded" : "Shield awarded"}
            </p>
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
              not met. While any one of them is outstanding, no shield can be confirmed, whatever
              the score.
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

        {/* Below the Bronze bar, but licence compliant — FQ's own consolation,
            and worth stating as the positive thing it is rather than leaving a
            club to read a shield-shaped hole. */}
        {overview.rating.developmentBadge && (
          <div className="mt-4 rounded-lg bg-maroon-50 px-4 py-3">
            <p className="font-semibold text-maroon-800">FQ Development Committed</p>
            <p className="mt-1 text-sm text-maroon-800">
              Your club scored below the {SHIELD_LABELS.BRONZE} threshold this cycle, so no shield
              is awarded. Football Queensland recognises clubs that are licence compliant with the
              Development Committed badge, and your club has it. The area feedback below is where
              to start for next cycle.
            </p>
          </div>
        )}

        {/* The club scored higher than its structure and staffing support. Told
            plainly, with the standard named, because the alternative is a club
            that reads a Silver shield next to a Gold percentage and concludes
            the scoring is broken. */}
        {overview.rating.cappedDown && (
          <div className="mt-4 rounded-lg bg-ink-50 px-4 py-3">
            <p className="font-semibold text-ink-900">
              Your score reached {SHIELD_LABELS[overview.rating.provisionalShield]}
            </p>
            <p className="mt-1 text-sm text-ink-700">
              The shield awarded is held at {SHIELD_LABELS[shield ?? "NONE"]} because of the
              shield-based standards below. These are separate from your score: they set the club
              structure, coaching and training standards required at each level, and Football
              Queensland is introducing them over four years.
            </p>
            <ul className="mt-2 space-y-1">
              {overview.rating.eligibility.cappedBy.map((c) => (
                <li key={c.code} className="text-sm text-ink-700">
                  <span className="font-medium">
                    {c.code} — {c.title}
                  </span>
                  <span className="block text-ink-600">
                    Standard met: {SHIELD_LABELS[c.shieldMet ?? "NONE"]}
                  </span>
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

      <div className="mb-6">
        <h2 className="section-title mb-3">Detailed feedback by area</h2>
        <AreaBreakdown areas={overview.areas} notes={overview.areaNotes} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="section-title mb-3">How you scored by domain</h2>
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
            {assessment.nonNegotiables.map((n) => {
              const threshold = n.nonNegotiable.kind === "SHIELD_THRESHOLD";
              return (
                <div key={n.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {n.nonNegotiable.code} — {n.nonNegotiable.title}
                    </p>
                    {n.verdict === "FAIL" && n.adminNote && (
                      <p className="mt-0.5 text-xs text-maroon-700">{n.adminNote}</p>
                    )}
                  </div>
                  {threshold && n.verdict === "PASS" ? (
                    // A level, not a tick: "met" says nothing when the bar
                    // differs by shield, and the level is the actionable part.
                    // At NONE there is no level to show, and the shield chip
                    // would read as "the standard met was: no shield".
                    n.shieldMet && n.shieldMet !== "NONE" ? (
                      <ShieldBadge shield={n.shieldMet} size="sm" />
                    ) : (
                      <Badge tone="muted">No standard met</Badge>
                    )
                  ) : (
                    <Badge
                      tone={n.verdict === "PASS" ? "good" : n.verdict === "FAIL" ? "bad" : "muted"}
                    >
                      {n.verdict === "PASS" ? "Met" : n.verdict === "FAIL" ? "Not met" : "Pending"}
                    </Badge>
                  )}
                </div>
              );
            })}
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
