"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  lockAssessment,
  publishAssessment,
  reopenForClub,
  setLicenceCompliance,
  unlockAssessment,
  withdrawAssessment,
  type CduFormState,
} from "../../actions";

const initialState: CduFormState = { status: "idle" };

/**
 * The one place an assessment's result becomes real.
 *
 * Deliberately a staircase — reconcile, lock, release — rather than a single
 * "publish" button. Locking freezes the numbers and is reversible while nobody
 * has seen them; releasing is what a club is told about, and pulling that back
 * is a separate, more visible act.
 */
export function LockPanel({
  assessmentId,
  status,
  lockedAt,
  publishedAt,
  unresolved,
  pendingChecks,
  summary,
  licenceCompliant,
  belowBronze,
}: {
  assessmentId: string;
  status: string;
  lockedAt: Date | null;
  publishedAt: Date | null;
  unresolved: number;
  pendingChecks: number;
  summary: string;
  licenceCompliant: boolean | null;
  /** The score is below the Bronze bar, so the badge is what's at stake. */
  belowBronze: boolean;
}) {
  const [lockState, lockAction] = useActionState(lockAssessment, initialState);
  const [unlockState, unlockAction] = useActionState(unlockAssessment, initialState);
  const [publishState, publishAction] = useActionState(publishAssessment, initialState);
  const [withdrawState, withdrawAction] = useActionState(withdrawAssessment, initialState);
  const [reopenState, reopenAction] = useActionState(reopenForClub, initialState);
  const [licenceState, licenceAction] = useActionState(setLicenceCompliance, initialState);

  const [summaryText, setSummaryText] = useState(summary);
  const [licence, setLicence] = useState(
    licenceCompliant === null ? "" : licenceCompliant ? "yes" : "no",
  );

  const blockers: string[] = [];
  if (unresolved > 0) {
    blockers.push(`${unresolved} criteri${unresolved === 1 ? "on" : "a"} still unresolved`);
  }
  if (pendingChecks > 0) {
    blockers.push(
      `${pendingChecks} Non-Negotiable${pendingChecks === 1 ? "" : "s"} still unverified`,
    );
  }

  // Only a blocker where it changes the outcome. Above the Bronze bar the club
  // is getting a shield and the badge never comes into it, so demanding an
  // answer would be make-work on every assessment to serve a handful.
  if (belowBronze && licenceCompliant === null) {
    blockers.push("licence compliance not recorded — needed for the Development Committed badge");
  }

  const messages = [lockState, unlockState, publishState, withdrawState, reopenState, licenceState];

  return (
    <div className="card card-pad space-y-4">
      <div>
        <h2 className="font-semibold text-ink-900">Finalise</h2>
        <p className="mt-1 text-xs text-ink-500">
          {publishedAt
            ? `Released to the club ${formatDate(publishedAt)}.`
            : lockedAt
              ? `Locked ${formatDate(lockedAt)}. The club can't see it yet.`
              : "Resolve every criterion and verify every check, then lock."}
        </p>
      </div>

      {!lockedAt && (
        <>
          <form action={licenceAction} className="space-y-2 border-t border-ink-200 pt-3">
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <fieldset>
              <legend className="label">
                Licence compliant, non-technical{" "}
                <span className="font-normal text-ink-400">
                  {belowBronze
                    ? "(decides the Development Committed badge)"
                    : "(only matters below the Bronze bar)"}
                </span>
              </legend>
              <div className="flex flex-wrap gap-3">
                {[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "", label: "Not established" },
                ].map((o) => (
                  <label key={o.label} className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="radio"
                      name="licenceCompliant"
                      value={o.value}
                      className="h-4 w-4 accent-maroon-600"
                      checked={licence === o.value}
                      onChange={() => setLicence(o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton className="btn-secondary btn-sm w-full" pendingLabel="Saving…">
              Record compliance
            </SubmitButton>
          </form>

          {blockers.length > 0 && (
            <ul className="space-y-1 text-xs text-maroon-700">
              {blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          )}

          <form action={lockAction}>
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <SubmitButton
              className="btn-primary w-full"
              pendingLabel="Locking…"
              disabled={blockers.length > 0}
              confirm="Lock this assessment? The result is computed and frozen at this point."
            >
              Lock scores
            </SubmitButton>
          </form>

          <form action={reopenAction}>
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <SubmitButton
              className="btn-secondary btn-sm w-full"
              pendingLabel="Reopening…"
              confirm="Hand this back to the club to edit? Their submission reopens."
              disabled={status === "IN_PROGRESS" || status === "NOT_STARTED"}
            >
              Reopen for the club
            </SubmitButton>
          </form>
        </>
      )}

      {lockedAt && !publishedAt && (
        <>
          <form action={publishAction} className="space-y-2">
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <label className="label" htmlFor="summary">
              Summary for the club
            </label>
            <textarea
              id="summary"
              name="summary"
              rows={4}
              className="input"
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              placeholder="What the club did well, and what the Unit will work through with them."
            />
            <SubmitButton
              className="btn-primary w-full"
              pendingLabel="Releasing…"
              confirm="Release this rating to the club?"
            >
              Release to the club
            </SubmitButton>
          </form>

          <form action={unlockAction}>
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <SubmitButton
              className="btn-secondary btn-sm w-full"
              pendingLabel="Unlocking…"
              confirm="Unlock? The frozen result is cleared and recomputed when you lock again."
            >
              Unlock to make changes
            </SubmitButton>
          </form>
        </>
      )}

      {publishedAt && (
        <form action={withdrawAction}>
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <SubmitButton
            className="btn-danger btn-sm w-full"
            pendingLabel="Withdrawing…"
            confirm="Withdraw this rating? The club will no longer be able to see it."
          >
            Withdraw from the club
          </SubmitButton>
        </form>
      )}

      <div className="space-y-2">
        {messages.map((m, i) =>
          m.status === "error" ? (
            <FormError key={i} message={m.message} />
          ) : m.status === "ok" ? (
            <FormSuccess key={i} message={m.message} />
          ) : null,
        )}
      </div>
    </div>
  );
}
