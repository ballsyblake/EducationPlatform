"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Stars } from "@/components/cda/stars";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError } from "@/components/ui";
import { starLabel, starsFromEvidence } from "@/lib/cda/rubric";
import { saveScore, type AssessFormState } from "../actions";

const initialState: AssessFormState = { status: "idle" };

export type ClubScoreData = {
  assessmentId: string;
  clubName: string;
  clubZone: string | null;
  /** null when the club never had this line item scored before. */
  priorScore: number | null;
  savedScore: number | null;
  metIds: string[];
  comment: string;
  /** False when the club's assessment has moved past scoring. */
  open: boolean;
};

export function ClubScoreCard({
  assignmentId,
  club,
  subCriteria,
  thresholds,
  editable,
}: {
  assignmentId: string;
  club: ClubScoreData;
  subCriteria: { id: string; text: string }[];
  thresholds: { oneStarAt: number; twoStarAt: number; threeStarAt: number };
  editable: boolean;
}) {
  const [state, formAction] = useActionState(saveScore, initialState);
  const [met, setMet] = useState<Set<string>>(new Set(club.metIds));
  const [comment, setComment] = useState(club.comment);
  const [touched, setTouched] = useState(false);

  const score = starsFromEvidence(met.size, thresholds);
  const writable = editable && club.open;

  const toggle = (id: string) => {
    setTouched(true);
    setMet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dirty =
    touched &&
    (comment !== club.comment ||
      met.size !== club.metIds.length ||
      club.metIds.some((id) => !met.has(id)));

  // Movement against last year is the first thing to sanity-check a score
  // against, which is why FQ's own sheet carries the prior score in a column.
  const movement =
    club.savedScore !== null && club.priorScore !== null ? club.savedScore - club.priorScore : null;

  return (
    <form action={formAction} className="card card-pad" id={club.assessmentId}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="assessmentId" value={club.assessmentId} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink-900">{club.clubName}</h3>
            {club.savedScore === null && <Badge tone="warn">Not scored</Badge>}
            {!club.open && <Badge tone="info">Closed</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {club.clubZone ?? "No zone recorded"}
            {club.priorScore !== null && ` · last cycle: ${club.priorScore}`}
            {movement !== null && movement !== 0 && (
              <span className={movement > 0 ? "text-status-green-fg" : "text-maroon-700"}>
                {" "}
                ({movement > 0 ? "+" : ""}
                {movement})
              </span>
            )}
          </p>
          <Link
            href={`/cda/assess/club/${club.assessmentId}`}
            className="mt-1 inline-block text-xs font-medium text-maroon-700 hover:text-maroon-800"
          >
            Club&apos;s submitted evidence →
          </Link>
        </div>

        <div className="text-right">
          <Stars value={score} />
          <p className="mt-1 text-xs font-medium text-ink-600">{starLabel(score)}</p>
        </div>
      </div>

      <fieldset className="mt-4 space-y-1.5 border-t border-ink-200 pt-4" disabled={!writable}>
        <legend className="sr-only">Evidence for {club.clubName}</legend>
        {subCriteria.map((sub, i) => (
          <label
            key={sub.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm ${
              met.has(sub.id) ? "bg-maroon-50 text-ink-900" : "text-ink-700 hover:bg-ink-50"
            }`}
          >
            <input
              type="checkbox"
              name="met"
              value={sub.id}
              checked={met.has(sub.id)}
              onChange={() => toggle(sub.id)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-maroon-600"
            />
            <span>
              <span className="mr-1.5 text-xs text-ink-400">{i + 1}</span>
              {sub.text}
            </span>
          </label>
        ))}
      </fieldset>

      <p className="mt-2 text-xs text-ink-500">
        {met.size} of {subCriteria.length} met
      </p>

      <div className="mt-3">
        <label className="label" htmlFor={`c-${club.assessmentId}`}>
          Comment
        </label>
        <textarea
          id={`c-${club.assessmentId}`}
          name="comment"
          rows={2}
          className="input"
          value={comment}
          onChange={(e) => {
            setTouched(true);
            setComment(e.target.value);
          }}
          disabled={!writable}
          placeholder="What you saw for this club, and what would move it up a band."
        />
      </div>

      {state.status === "error" && (
        <div className="mt-3">
          <FormError message={state.message} />
        </div>
      )}

      {writable && (
        <div className="mt-3 flex items-center gap-3">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving…">
            {club.savedScore === null ? "Save" : "Update"}
          </SubmitButton>
          {dirty ? (
            <span className="text-xs text-maroon-700">Unsaved changes</span>
          ) : (
            state.status === "ok" && <span className="text-xs text-ink-500">Saved</span>
          )}
        </div>
      )}
    </form>
  );
}
