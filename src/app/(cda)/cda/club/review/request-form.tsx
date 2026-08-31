"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, EmptyState, FormError, FormSuccess } from "@/components/ui";
import { DOMAIN_LABELS } from "@/lib/cda/rubric";
import {
  REVIEWABLE_DOMAINS,
  checkQuota,
  type ReviewAllowance,
} from "@/lib/cda/review";
import { formatDate } from "@/lib/format";
import { submitReviewRequest, type ClubFormState } from "../actions";
import type { Domain } from "@prisma-client";

const initialState: ClubFormState = { status: "idle" };

export type ReviewCandidate = {
  criterionId: string;
  code: string;
  title: string;
  domain: Domain;
  area: string | null;
  score: number | null;
  maxScore: number;
};

/**
 * Choosing line items, within Football Queensland's quotas.
 *
 * The quota is shown as remaining allowance per domain and enforced as you go,
 * rather than checked on submit. A club drafting ten carefully-argued cases and
 * then being told four of them are inadmissible has wasted the one round it
 * gets, and the rule was knowable the whole time.
 */
export function RequestForm({
  candidates,
  canRequest,
  deadline,
  daysLeft,
  allowance,
}: {
  candidates: ReviewCandidate[];
  canRequest: boolean;
  deadline: Date | null;
  daysLeft: number | null;
  allowance: ReviewAllowance;
}) {
  const [state, formAction] = useActionState(submitReviewRequest, initialState);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [technical, setTechnical] = useState("");

  const chosen = candidates.filter((c) => (comments[c.criterionId] ?? "").trim().length > 0);
  const wantsTechnical = technical.trim().length > 0;
  const quota = checkQuota(
    { domains: chosen.map((c) => c.domain), technical: wantsTechnical },
    allowance,
  );

  if (!canRequest) {
    return (
      <EmptyState
        title="The review window has closed"
        description={
          deadline
            ? `Requests closed on ${formatDate(deadline)}. Your rating is confirmed as it stands. If you believe that's wrong, contact the Club Development Unit.`
            : "Your rating is confirmed as it stands."
        }
      />
    );
  }

  if (state.status === "ok") {
    return <FormSuccess message={state.message} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-title">Selected</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">
              {quota.total}
              <span className="text-base font-normal text-ink-500"> / {allowance.maxItems}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {REVIEWABLE_DOMAINS.map((d) => {
              const left = quota.remaining[d] ?? 0;
              return (
                <Badge key={d} tone={left < 0 ? "bad" : left === 0 ? "warn" : "muted"}>
                  {DOMAIN_LABELS[d]}: {Math.max(left, 0)} of {allowance.quotas[d]} left
                </Badge>
              );
            })}
          </div>
        </div>

        {allowance.technical && (
          <div className="mt-4 border-t border-ink-200 pt-3">
            <label className="label" htmlFor="technicalComment">
              Technical Staff Qualifications score
            </label>
            <textarea
              id="technicalComment"
              name="technicalComment"
              rows={3}
              value={technical}
              onChange={(e) => setTechnical(e.target.value)}
              placeholder="Say which qualification you believe was read wrongly, and where the evidence sits on the Club Hub. Leave blank if you're not putting this up."
              className="input text-sm"
            />
            <p className="hint">
              One review of this score is allowed, and it counts towards your total. The score is
              computed from your staff register, so what the Unit re-reads is how a qualification
              was recognised.
            </p>
          </div>
        )}

        {deadline && (
          <p className="mt-3 text-xs text-ink-500">
            Requests close {formatDate(deadline)}
            {daysLeft !== null && daysLeft >= 0 && (
              <> — {daysLeft === 0 ? "today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}</>
            )}
            .
          </p>
        )}

        {!quota.ok && chosen.length > 0 && <FormError message={quota.message} />}
        {state.status === "error" && <FormError message={state.message} />}

        <SubmitButton
          className="btn-primary mt-3"
          pendingLabel="Submitting…"
          disabled={!quota.ok}
          confirm="Submit this review request? You get one request per cycle, so make sure every item you want looked at is included."
        >
          Submit review request
        </SubmitButton>
      </div>

      <div className="card divide-y divide-ink-200">
        {candidates.map((c, i) => {
          const comment = comments[c.criterionId] ?? "";
          const selected = comment.trim().length > 0;
          return (
            <div key={c.criterionId}>
              {c.domain !== candidates[i - 1]?.domain && (
                <p className="bg-ink-50 px-4 py-1.5 text-xs font-semibold text-ink-600">
                  {DOMAIN_LABELS[c.domain]}
                </p>
              )}
              <div className={`px-4 py-3 ${selected ? "bg-maroon-50/40" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide text-ink-400">{c.code}</span>
                  <span className="font-medium text-ink-900">{c.title}</span>
                  {c.area && <span className="text-xs text-ink-500">{c.area}</span>}
                  <span className="ml-auto text-sm tabular-nums text-ink-700">
                    {c.score === null ? "—" : `${c.score} / ${c.maxScore}`}
                  </span>
                </div>

                <textarea
                  name={`comment:${c.criterionId}`}
                  rows={selected ? 3 : 1}
                  className="input mt-2"
                  value={comment}
                  onChange={(e) =>
                    setComments((prev) => ({ ...prev, [c.criterionId]: e.target.value }))
                  }
                  placeholder="Leave blank to skip. To put this forward, say what evidence was missed and where it sits in the Club Hub."
                />
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
