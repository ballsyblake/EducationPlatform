import { ShieldBadge } from "@/components/cda/shield";
import { Badge } from "@/components/ui";
import { pct } from "@/lib/cda/scoring";
import { STAGE_LABELS, type ReviewTimeline } from "@/lib/cda/review";
import { formatDate } from "@/lib/format";
import type { Shield } from "@prisma-client";

export type OutcomeItem = {
  id: string;
  code: string;
  title: string;
  maxScore: number;
  clubComment: string;
  outcome: "PENDING" | "REVISED" | "PRESERVED";
  scoreBefore: number | null;
  scoreAfter: number | null;
  response: string | null;
};

export type OutcomeReview = {
  status: string;
  submittedAt: Date;
  respondedAt: Date | null;
  response: string | null;
  responderName: string | null;
  appealedAt: Date | null;
  appeal: string | null;
  appealDecidedAt: Date | null;
  appealDecision: string | null;
  percentBefore: number | null;
  shieldBefore: Shield | null;
  items: OutcomeItem[];
};

/**
 * The club's view of its own review, once submitted.
 *
 * Leads with what moved rather than with what was asked, because that is the
 * question the club actually has. A review that preserved every score is a
 * legitimate outcome and is stated as one — "your score stands" is an answer,
 * and burying it under per-item prose reads like an evasion.
 */
export function ReviewOutcome({
  review,
  percentNow,
  shieldNow,
  timeline,
}: {
  review: OutcomeReview;
  percentNow: number | null;
  shieldNow: Shield | null;
  timeline: ReviewTimeline;
}) {
  const answered = review.respondedAt !== null;
  const moved =
    answered &&
    review.percentBefore !== null &&
    percentNow !== null &&
    Math.abs(review.percentBefore - percentNow) > 0.05;

  const revised = review.items.filter((i) => i.outcome === "REVISED").length;

  return (
    <div className="space-y-6">
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-title">Review</p>
            <p className="mt-1 font-semibold text-ink-900">{STAGE_LABELS[timeline.stage]}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Requested {formatDate(review.submittedAt)} · {review.items.length} line item
              {review.items.length === 1 ? "" : "s"}
            </p>
          </div>
          {timeline.deadline && (
            <p className="text-xs text-ink-500">
              {timeline.stage === "AWAITING_RESPONSE"
                ? "Response due"
                : timeline.stage === "AWAITING_APPEAL_DECISION"
                  ? "Decision due"
                  : "Closes"}{" "}
              {formatDate(timeline.deadline)}
              {timeline.overdue && (
                <Badge tone="warn">
                  <span className="ml-1">overdue</span>
                </Badge>
              )}
            </p>
          )}
        </div>

        {answered && (
          <div className="mt-4 border-t border-ink-200 pt-4">
            {moved ? (
              <>
                <p className="font-semibold text-ink-900">Your rating changed</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-ink-500">
                    {pct(review.percentBefore ?? 0)}{" "}
                    <ShieldBadge shield={review.shieldBefore} size="sm" short />
                  </span>
                  <span aria-hidden="true" className="text-ink-400">
                    →
                  </span>
                  <span className="font-semibold text-ink-900">
                    {pct(percentNow ?? 0)} <ShieldBadge shield={shieldNow} size="sm" short />
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-ink-900">Your score stands</p>
                <p className="mt-1 text-sm text-ink-700">
                  {revised === 0
                    ? "The Club Assessment Unit preserved the score on every item you put forward."
                    : "The revisions below didn't change your overall percentage."}
                </p>
              </>
            )}

            {review.response && (
              <div className="mt-3">
                <p className="section-title mb-1">
                  From the Club Assessment Unit
                  {review.responderName && (
                    <span className="ml-2 font-normal text-ink-400">{review.responderName}</span>
                  )}
                </p>
                <p className="prose-note">{review.response}</p>
              </div>
            )}
          </div>
        )}

        {review.appealedAt && (
          <div className="mt-4 border-t border-ink-200 pt-4">
            <p className="section-title mb-1">Your appeal — {formatDate(review.appealedAt)}</p>
            <p className="prose-note">{review.appeal}</p>
          </div>
        )}

        {review.appealDecidedAt && (
          <div className="mt-4 rounded-lg bg-ink-50 px-4 py-3">
            <p className="font-semibold text-ink-900">
              Decision of the CEO — {formatDate(review.appealDecidedAt)}
            </p>
            <p className="mt-1 prose-note">{review.appealDecision}</p>
            <p className="mt-2 text-xs text-ink-500">
              This concludes the review process. Football Queensland: the process above exhausts all
              review opportunities.
            </p>
          </div>
        )}
      </div>

      <div>
        <h2 className="section-title mb-3">Line items you put forward</h2>
        <div className="card divide-y divide-ink-200">
          {review.items.map((item) => (
            <div key={item.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold tracking-wide text-ink-400">{item.code}</span>
                <span className="font-medium text-ink-900">{item.title}</span>
                <span className="ml-auto">
                  {item.outcome === "PENDING" ? (
                    <Badge tone="muted">Not yet answered</Badge>
                  ) : item.outcome === "REVISED" ? (
                    <Badge tone="good">
                      Revised {item.scoreBefore} → {item.scoreAfter} of {item.maxScore}
                    </Badge>
                  ) : (
                    <Badge tone="muted">Preserved at {item.scoreBefore ?? "—"}</Badge>
                  )}
                </span>
              </div>

              <p className="mt-2 rounded bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <span className="font-medium">What you told us:</span> {item.clubComment}
              </p>

              {item.response && (
                <p className="mt-2 text-sm text-ink-700">
                  <span className="font-medium">Unit&apos;s response:</span> {item.response}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
