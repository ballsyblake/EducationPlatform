"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { STAGE_LABELS, type ReviewStage } from "@/lib/cda/review";
import { formatDate } from "@/lib/format";
import {
  answerReviewItem,
  confirmRating,
  decideAppeal,
  sendReviewResponse,
  type CduFormState,
} from "../../actions";

const initialState: CduFormState = { status: "idle" };

export type ReviewPanelItem = {
  id: string;
  code: string;
  title: string;
  maxScore: number;
  currentScore: number | null;
  clubComment: string;
  outcome: "PENDING" | "REVISED" | "PRESERVED";
  scoreBefore: number | null;
  scoreAfter: number | null;
  response: string;
};

export type ReviewPanelData = {
  requestId: string;
  submittedAt: Date;
  respondedAt: Date | null;
  response: string;
  appealedAt: Date | null;
  appeal: string | null;
  appealDecidedAt: Date | null;
  appealDecision: string | null;
  items: ReviewPanelItem[];
};

/**
 * The Unit's side of a review.
 *
 * Every item is answered before anything is sent, and the send is a single act
 * — Football Queensland responds once, with the revised or preserved score for
 * each item, inside 10 working days. Letting the Unit send piecemeal would give
 * the club a moving target and start the appeal clock at an ambiguous moment.
 */
export function ReviewPanel({
  assessmentId,
  review,
  stage,
  deadline,
  overdue,
  canConfirm,
}: {
  assessmentId: string;
  review: ReviewPanelData | null;
  stage: ReviewStage;
  deadline: Date | null;
  overdue: boolean;
  canConfirm: boolean;
}) {
  const [confirmState, confirmAction] = useActionState(confirmRating, initialState);
  const [sendState, sendAction] = useActionState(sendReviewResponse, initialState);
  const [appealState, appealAction] = useActionState(decideAppeal, initialState);

  const [covering, setCovering] = useState(review?.response ?? "");
  const [decision, setDecision] = useState(review?.appealDecision ?? "");

  const pending = review?.items.filter((i) => i.outcome === "PENDING").length ?? 0;

  return (
    <div className="card card-pad space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink-900">Review</h2>
          <p className="mt-0.5 text-xs text-ink-500">{STAGE_LABELS[stage]}</p>
        </div>
        {deadline && (
          <Badge tone={overdue ? "bad" : "muted"}>
            {overdue ? "Overdue " : "Due "}
            {formatDate(deadline)}
          </Badge>
        )}
      </div>

      {!review && (
        <p className="text-sm text-ink-600">
          {stage === "WINDOW_OPEN"
            ? "The club's review window is open. Nothing has been requested yet."
            : stage === "WINDOW_LAPSED"
              ? "The window closed with no request, so this rating is settled and can be confirmed."
              : stage === "CONFIRMED"
                ? "Confirmed. The club may display its shield."
                : "Not released yet."}
        </p>
      )}

      {canConfirm && (
        <form action={confirmAction}>
          <input type="hidden" name="assessmentId" value={assessmentId} />
          {confirmState.status === "error" && <FormError message={confirmState.message} />}
          {confirmState.status === "ok" && <FormSuccess message={confirmState.message} />}
          <SubmitButton
            className="btn-primary btn-sm w-full"
            pendingLabel="Confirming…"
            confirm="Confirm this rating? It becomes final and the club may publish its shield."
          >
            Confirm the rating
          </SubmitButton>
        </form>
      )}

      {review && (
        <>
          <p className="text-sm text-ink-700">
            Requested {formatDate(review.submittedAt)} — {review.items.length} line item
            {review.items.length === 1 ? "" : "s"}
            {pending > 0 && <span className="text-maroon-700"> · {pending} unanswered</span>}
          </p>

          <div className="divide-y divide-ink-200 border-y border-ink-200">
            {review.items.map((item) => (
              <ItemRow key={item.id} item={item} locked={review.respondedAt !== null} />
            ))}
          </div>

          {!review.respondedAt && (
            <form action={sendAction} className="space-y-2">
              <input type="hidden" name="requestId" value={review.requestId} />
              <label className="label" htmlFor="covering">
                Covering note{" "}
                <span className="font-normal text-ink-400">(optional — the club sees this)</span>
              </label>
              <textarea
                id="covering"
                name="response"
                rows={3}
                className="input"
                value={covering}
                onChange={(e) => setCovering(e.target.value)}
                placeholder="How the request was handled overall, and anything the club should do differently next cycle."
              />
              {sendState.status === "error" && <FormError message={sendState.message} />}
              <SubmitButton
                className="btn-primary btn-sm w-full"
                pendingLabel="Sending…"
                disabled={pending > 0}
                confirm="Send this response? The rating is recomputed from the revised scores and the club's appeal window opens."
              >
                Send response and recompute
              </SubmitButton>
            </form>
          )}

          {review.appealedAt && (
            <div className="rounded-lg bg-maroon-50 px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-maroon-800 uppercase">
                Appealed to the CEO — {formatDate(review.appealedAt)}
              </p>
              <p className="mt-1 text-sm text-maroon-800">{review.appeal}</p>
            </div>
          )}

          {review.appealedAt && !review.appealDecidedAt && (
            <form action={appealAction} className="space-y-2">
              <input type="hidden" name="requestId" value={review.requestId} />
              <label className="label" htmlFor="decision">
                CEO&apos;s decision{" "}
                <span className="font-normal text-ink-400">(the club sees this in full)</span>
              </label>
              <textarea
                id="decision"
                name="decision"
                rows={4}
                className="input"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                placeholder="The ruling, and the reasoning behind it."
              />
              {appealState.status === "error" && <FormError message={appealState.message} />}
              <SubmitButton
                className="btn-primary btn-sm w-full"
                pendingLabel="Recording…"
                confirm="Record this decision? It is final and confirms the rating."
              >
                Record decision and confirm
              </SubmitButton>
            </form>
          )}

          {review.appealDecidedAt && (
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-ink-600 uppercase">
                Decided {formatDate(review.appealDecidedAt)}
              </p>
              <p className="mt-1 text-sm text-ink-700">{review.appealDecision}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One line item, with the Unit's verdict on it. */
function ItemRow({ item, locked }: { item: ReviewPanelItem; locked: boolean }) {
  const [state, formAction] = useActionState(answerReviewItem, initialState);
  const [preserve, setPreserve] = useState(item.outcome !== "REVISED");
  const [stars, setStars] = useState<number | null>(item.scoreAfter ?? item.currentScore);
  const [response, setResponse] = useState(item.response);

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-ink-400">{item.code}</span>
        <span className="text-sm font-medium text-ink-900">{item.title}</span>
        <span className="ml-auto text-xs tabular-nums text-ink-500">
          now {item.currentScore ?? "—"}/{item.maxScore}
        </span>
        {item.outcome === "REVISED" && (
          <Badge tone="good">
            {item.scoreBefore} → {item.scoreAfter}
          </Badge>
        )}
        {item.outcome === "PRESERVED" && <Badge tone="muted">Preserved</Badge>}
      </div>

      <p className="mt-1.5 rounded bg-ink-50 px-3 py-2 text-xs text-ink-700">
        <span className="font-medium">Club:</span> {item.clubComment}
      </p>

      {locked ? (
        item.response && <p className="mt-1.5 text-xs text-ink-600">{item.response}</p>
      ) : (
        <form action={formAction} className="mt-2 space-y-2">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="outcome" value={preserve ? "PRESERVED" : "REVISED"} />
          <input type="hidden" name="stars" value={stars ?? ""} />

          <div className="flex flex-wrap items-center gap-3">
            {[
              { value: true, label: "Preserve" },
              { value: false, label: "Revise" },
            ].map((o) => (
              <label key={o.label} className="flex items-center gap-1.5 text-sm text-ink-700">
                <input
                  type="radio"
                  className="h-4 w-4 accent-maroon-600"
                  checked={preserve === o.value}
                  onChange={() => setPreserve(o.value)}
                />
                {o.label}
              </label>
            ))}

            {!preserve && (
              <div className="flex gap-1" role="radiogroup" aria-label={`Revised score for ${item.code}`}>
                {Array.from({ length: item.maxScore + 1 }, (_, n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars === n}
                    onClick={() => setStars(n)}
                    className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                      stars === n
                        ? "border-maroon-600 bg-maroon-600 text-white"
                        : "border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            name="response"
            rows={2}
            className="input"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="What you found when you looked again. The club sees this."
          />

          {state.status === "error" && <FormError message={state.message} />}

          <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
            {item.outcome === "PENDING" ? "Record" : "Change"}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
