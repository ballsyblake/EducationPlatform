"use client";

import { useActionState, useState } from "react";
import { Stars, StarScale } from "@/components/cda/stars";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError } from "@/components/ui";
import { starLabel, starsFromEvidence } from "@/lib/cda/rubric";
import { saveScore, type AssessFormState } from "../actions";

const initialState: AssessFormState = { status: "idle" };

export type CriterionCardData = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  weight: number;
  oneStarAt: number;
  twoStarAt: number;
  threeStarAt: number;
  subCriteria: { id: string; text: string }[];
  /** null when this assessor hasn't scored it yet. */
  savedStars: number | null;
  metIds: string[];
  comment: string;
};

export function CriterionCard({
  assessmentId,
  criterion,
  editable,
}: {
  assessmentId: string;
  criterion: CriterionCardData;
  editable: boolean;
}) {
  const [state, formAction] = useActionState(saveScore, initialState);

  const [met, setMet] = useState<Set<string>>(new Set(criterion.metIds));
  const [comment, setComment] = useState(criterion.comment);

  // Tracked explicitly rather than inferred by comparing against what's saved.
  // A criterion nobody has scored has savedStars === null while the form shows
  // zero stars, and those two are never equal — so a value comparison alone
  // would label every untouched criterion on the page "unsaved changes", which
  // is exactly the warning an assessor needs to be able to trust.
  const [touched, setTouched] = useState(false);

  // Recomputed on every tick with the same function the server uses, so the
  // assessor sees the band move as they work rather than after a round trip —
  // and never sees a preview that disagrees with what gets stored.
  const stars = starsFromEvidence(met.size, criterion);

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
    (comment !== criterion.comment ||
      met.size !== criterion.metIds.length ||
      criterion.metIds.some((id) => !met.has(id)));

  return (
    <form action={formAction} className="card card-pad" id={criterion.code}>
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input type="hidden" name="criterionId" value={criterion.id} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-title">{criterion.code}</span>
            {criterion.weight > 1 && <Badge tone="info">Weighted ×{criterion.weight}</Badge>}
            {criterion.savedStars === null && <Badge tone="warn">Not scored</Badge>}
          </div>
          <h3 className="mt-1 font-semibold text-ink-900">{criterion.title}</h3>
          {criterion.description && (
            <p className="mt-1 text-sm text-ink-600">{criterion.description}</p>
          )}
        </div>

        <div className="text-right">
          <Stars value={stars} />
          <p className="mt-1 text-xs font-medium text-ink-600">{starLabel(stars)}</p>
        </div>
      </div>

      <fieldset className="mt-4 space-y-2 border-t border-ink-200 pt-4" disabled={!editable}>
        <legend className="sr-only">Evidence points for {criterion.title}</legend>
        {criterion.subCriteria.map((sub) => (
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
            <span>{sub.text}</span>
          </label>
        ))}
      </fieldset>

      <div className="mt-3">
        <StarScale
          oneStarAt={criterion.oneStarAt}
          twoStarAt={criterion.twoStarAt}
          threeStarAt={criterion.threeStarAt}
          total={criterion.subCriteria.length}
          met={met.size}
        />
      </div>

      <div className="mt-4">
        <label className="label" htmlFor={`comment-${criterion.id}`}>
          Comment
        </label>
        <textarea
          id={`comment-${criterion.id}`}
          name="comment"
          rows={2}
          className="input"
          value={comment}
          onChange={(e) => {
            setTouched(true);
            setComment(e.target.value);
          }}
          disabled={!editable}
          placeholder="What you saw, and what would move this up a band."
        />
        <p className="hint">
          Read by the Club Development Unit during reconciliation, not by the club.
        </p>
      </div>

      {state.status === "error" && (
        <div className="mt-3">
          <FormError message={state.message} />
        </div>
      )}

      {editable && (
        <div className="mt-3 flex items-center gap-3">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving…">
            {criterion.savedStars === null ? "Save score" : "Update score"}
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
