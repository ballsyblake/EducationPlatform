"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  lockAssessment,
  publishAssessment,
  recordClubNotified,
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
  clubNotifiedAt,
  today,
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
  /** When the Unit recorded telling the club, outside this system. */
  clubNotifiedAt: Date | null;
  /** Today as YYYY-MM-DD, from the server — a client `new Date()` here would
      disagree with the server render and trip hydration. */
  today: string;
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
  const [notifiedState, notifiedAction] = useActionState(recordClubNotified, initialState);

  const [summaryText, setSummaryText] = useState(summary);
  const [notifiedOn, setNotifiedOn] = useState(
    clubNotifiedAt ? clubNotifiedAt.toISOString().slice(0, 10) : today,
  );
  const [correcting, setCorrecting] = useState(false);
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

  const messages = [
    lockState,
    unlockState,
    publishState,
    withdrawState,
    reopenState,
    licenceState,
    notifiedState,
  ];

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

      {/* Released, and the club has to be told before their eight days can
          start. Every notification FQ sends happens outside this system, so
          this is the only place that date can come from — and without it the
          window would run from a portal event the club never saw. */}
      {publishedAt && !clubNotifiedAt && (
        <form action={notifiedAction} className="space-y-2 rounded-lg bg-maroon-50 p-3">
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <p className="text-sm font-medium text-maroon-800">Club not yet told</p>
          <p className="text-xs text-maroon-700">
            Their eight days to ask for a review start from the day you write to them, not from
            the release. Record that date once you have.
          </p>
          <label className="label" htmlFor="notifiedOn">
            Date the club was told
          </label>
          <input
            id="notifiedOn"
            name="notifiedOn"
            type="date"
            className="input"
            max={today}
            value={notifiedOn}
            onChange={(e) => setNotifiedOn(e.target.value)}
          />
          <SubmitButton className="btn-primary btn-sm w-full" pendingLabel="Recording…">
            Record that the club was told
          </SubmitButton>
        </form>
      )}

      {publishedAt && clubNotifiedAt && (
        <div className="space-y-2 border-t border-ink-200 pt-3">
          <p className="text-xs text-ink-500">
            Club told {formatDate(clubNotifiedAt)}. Their review window runs from that date.
          </p>
          {correcting ? (
            <form action={notifiedAction} className="space-y-2">
              <input type="hidden" name="assessmentId" value={assessmentId} />
              <label className="label" htmlFor="notifiedOnFix">
                Date the club was told
              </label>
              <input
                id="notifiedOnFix"
                name="notifiedOn"
                type="date"
                className="input"
                max={today}
                value={notifiedOn}
                onChange={(e) => setNotifiedOn(e.target.value)}
              />
              <SubmitButton className="btn-secondary btn-sm w-full" pendingLabel="Saving…">
                Save the corrected date
              </SubmitButton>
            </form>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-maroon-700 hover:underline"
              onClick={() => setCorrecting(true)}
            >
              Correct this date
            </button>
          )}
        </div>
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
