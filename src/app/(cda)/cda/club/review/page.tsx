import { EmptyState, PageHeader } from "@/components/ui";
import { ratingVisibleToClub } from "@/lib/cda/access";
import { loadAssessment } from "@/lib/cda/assessment";
import { ASSESSED_DOMAINS, DOMAIN_LABELS } from "@/lib/cda/rubric";
import {
  REVIEWABLE_DOMAINS,
  REVIEW_MAX_ITEMS,
  REVIEW_QUOTAS,
  reviewTimeline,
} from "@/lib/cda/review";
import { prisma } from "@/lib/db";
import { clubContext } from "../club-context";
import { AppealForm } from "./appeal-form";
import { RequestForm, type ReviewCandidate } from "./request-form";
import { ReviewOutcome } from "./outcome";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Review our rating" };

/**
 * Where a club challenges its preliminary rating.
 *
 * Football Queensland's process is bounded and one-shot: 8 days to ask, a
 * limited number of line items, one round of feedback, one appeal to the CEO.
 * The screen is built around making those limits legible before a club spends
 * its allowance, because a club that discovers the quota after writing ten
 * submissions has been failed by the form rather than by the rules.
 */
export default async function ClubReviewPage() {
  const { club, assessment } = await clubContext();

  if (!club || !assessment) {
    return <EmptyState title="No assessment open" description="Nothing to review yet." />;
  }

  if (!ratingVisibleToClub(assessment.status)) {
    return (
      <>
        <PageHeader title="Review our rating" breadcrumb={{ href: "/cda/club", label: "Club overview" }} />
        <EmptyState
          title="Nothing to review yet"
          description="You'll be able to request a review once Football Queensland releases your preliminary rating."
        />
      </>
    );
  }

  const review = await prisma.reviewRequest.findUnique({
    where: { assessmentId: assessment.id },
    include: {
      items: { include: { criterion: true } },
      respondedBy: true,
      appealDecidedBy: true,
    },
  });

  const timeline = reviewTimeline({
    status: assessment.status,
    publishedAt: assessment.publishedAt,
    review,
  });

  // Only what the club may put forward. Technical Qualifications is absent
  // because it is computed from the staff register — there is no assessor
  // judgement there to review, and offering it would send clubs down a path
  // that ends in "correct your own data".
  const overview = await loadAssessment(assessment.id);
  const candidates: ReviewCandidate[] = overview.agreements
    .filter((a) => REVIEWABLE_DOMAINS.includes(a.criterion.domain))
    .map((a) => ({
      criterionId: a.criterion.id,
      code: a.criterion.code,
      title: a.criterion.title,
      domain: a.criterion.domain,
      area: a.criterion.area,
      score: a.final,
      maxScore: a.criterion.maxScore,
    }));

  const quotaSummary = (ASSESSED_DOMAINS as Domain[])
    .filter((d) => REVIEW_QUOTAS[d] !== undefined)
    .map((d) => `${REVIEW_QUOTAS[d]} ${DOMAIN_LABELS[d]}`)
    .join(", ");

  return (
    <>
      <PageHeader
        title="Review our rating"
        subtitle={
          review
            ? "Your request and Football Queensland's response."
            : "Ask for specific line items to be looked at again."
        }
        breadcrumb={{ href: "/cda/club/rating", label: "Our rating" }}
      />

      {/* The rules only while they still apply. Explaining how to request a
          review to a club whose rating is already confirmed reads as an offer,
          and there is nothing left to offer. */}
      {timeline.canRequestReview ? (
        <div className="mb-6 card card-pad space-y-2 text-sm text-ink-700">
          <p>
            The rating you have been given is <strong>preliminary</strong>. If you believe relevant
            evidence for a line item was missed due to an oversight, you can ask the Club Assessment
            Unit to look at it again. That is the only ground on which a review can be requested — a
            disagreement with the judgement itself is not one.
          </p>
          <p>
            {`You may put forward ${quotaSummary} line items, up to ${REVIEW_MAX_ITEMS} in total, and one request per cycle.`}{" "}
            If you don&apos;t request a review, your rating confirms itself once the window closes.
          </p>
          <p className="text-ink-500">
            Uploading your evidence to the Club Hub is the club&apos;s responsibility. Say in each
            comment where the evidence sits so the Unit can find it.
          </p>
        </div>
      ) : (
        <div className="mb-6 card card-pad text-sm text-ink-700">
          <p>
            {timeline.stage === "CONFIRMED"
              ? "This rating is confirmed. The review process is complete and no further change can be made."
              : timeline.stage === "AWAITING_RESPONSE"
                ? "Your request is with the Club Assessment Unit. They will respond on every line item you put forward."
                : timeline.stage === "AWAITING_APPEAL_DECISION"
                  ? "Your appeal is with the CEO of Football Queensland. Their decision is final."
                  : timeline.stage === "APPEAL_WINDOW_OPEN"
                    ? "The Unit has responded. If you disagree, you can appeal to the CEO — see below."
                    : "The review window for this rating has closed, so your rating is confirmed as it stands."}
          </p>
        </div>
      )}

      {review ? (
        <ReviewOutcome
          review={{
            status: review.status,
            submittedAt: review.submittedAt,
            respondedAt: review.respondedAt,
            response: review.response,
            responderName: review.respondedBy?.name ?? null,
            appealedAt: review.appealedAt,
            appeal: review.appeal,
            appealDecidedAt: review.appealDecidedAt,
            appealDecision: review.appealDecision,
            percentBefore: review.percentBefore,
            shieldBefore: review.shieldBefore,
            items: review.items.map((i) => ({
              id: i.id,
              code: i.criterion.code,
              title: i.criterion.title,
              maxScore: i.criterion.maxScore,
              clubComment: i.clubComment,
              outcome: i.outcome,
              scoreBefore: i.scoreBefore,
              scoreAfter: i.scoreAfter,
              response: i.response,
            })),
          }}
          percentNow={assessment.finalPercent}
          shieldNow={assessment.eligible ? assessment.finalShield : null}
          timeline={timeline}
        />
      ) : (
        <RequestForm
          candidates={candidates}
          canRequest={timeline.canRequestReview}
          deadline={timeline.deadline}
          daysLeft={timeline.daysLeft}
        />
      )}

      {timeline.canAppeal && review && <AppealForm />}
    </>
  );
}
