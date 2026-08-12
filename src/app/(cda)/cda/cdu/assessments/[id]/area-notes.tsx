"use client";

import { useActionState, useState } from "react";
import { ProgressBar } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { DOMAIN_LABELS } from "@/lib/cda/rubric";
import { saveAreaNote, type CduFormState } from "../../actions";
import type { Domain } from "@prisma-client";

const initialState: CduFormState = { status: "idle" };

export type AreaRow = {
  domain: Domain;
  area: string | null;
  earned: number;
  available: number;
  percent: number;
  total: number;
  scored: number;
  note: string;
};

const DOMAIN_ORDER: Domain[] = ["PLANNING", "DELIVERY", "OUTCOMES"];

/**
 * The macro-area breakdown, with the CDU's paragraph on each.
 *
 * Editable inline rather than on a separate screen: the number and the sentence
 * about it belong together, and writing the feedback somewhere you can't see
 * the score is how a report ends up saying "strong in this area" above 48%.
 */
export function AreaNotes({
  assessmentId,
  areas,
  editable,
}: {
  assessmentId: string;
  areas: AreaRow[];
  editable: boolean;
}) {
  return (
    <div className="space-y-6">
      {DOMAIN_ORDER.map((domain) => {
        const inDomain = areas.filter((a) => a.domain === domain);
        if (inDomain.length === 0) return null;

        const earned = inDomain.reduce((n, a) => n + a.earned, 0);
        const available = inDomain.reduce((n, a) => n + a.available, 0);

        return (
          <section key={domain}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="section-title">{DOMAIN_LABELS[domain]}</h3>
              <p className="text-xs tabular-nums text-ink-500">
                {earned} / {available} points ·{" "}
                {available === 0 ? "—" : `${((earned / available) * 100).toFixed(0)}%`}
              </p>
            </div>

            <div className="card divide-y divide-ink-200">
              {inDomain.map((area) => (
                <AreaRowEditor
                  key={`${area.domain}-${area.area}`}
                  assessmentId={assessmentId}
                  area={area}
                  editable={editable}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AreaRowEditor({
  assessmentId,
  area,
  editable,
}: {
  assessmentId: string;
  area: AreaRow;
  editable: boolean;
}) {
  const [state, formAction] = useActionState(saveAreaNote, initialState);
  const [comment, setComment] = useState(area.note);
  const [open, setOpen] = useState(false);

  const dirty = comment !== area.note;

  return (
    <div className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 font-medium text-ink-900">{area.area ?? "Ungrouped"}</p>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs tabular-nums text-ink-500">
            {area.earned} / {area.available}
          </span>
          <div className="w-20">
            <ProgressBar value={area.percent} />
          </div>
          <span className="w-11 text-right font-semibold tabular-nums text-ink-900">
            {area.percent.toFixed(0)}%
          </span>
        </div>
      </div>

      <p className="mt-0.5 text-xs text-ink-400">
        {area.total} line item{area.total === 1 ? "" : "s"}
        {area.scored < area.total && ` · ${area.total - area.scored} unscored`}
      </p>

      {area.note && !open && <p className="mt-2 prose-note">{area.note}</p>}

      {editable ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 text-xs font-medium text-maroon-700 hover:text-maroon-800"
          >
            {open ? "Close" : area.note ? "Edit feedback" : "Add feedback"}
          </button>

          {open && (
            <form action={formAction} className="mt-2 space-y-2">
              <input type="hidden" name="assessmentId" value={assessmentId} />
              <input type="hidden" name="domain" value={area.domain} />
              <input type="hidden" name="area" value={area.area ?? ""} />
              <textarea
                name="comment"
                rows={4}
                className="input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={`What the club did well in ${area.area ?? "this area"}, and what would move it up.`}
              />
              <p className="hint">The club reads this once the rating is released.</p>

              {state.status === "error" && <FormError message={state.message} />}
              {state.status === "ok" && <FormSuccess message={state.message} />}

              <div className="flex items-center gap-3">
                <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
                  Save feedback
                </SubmitButton>
                {dirty && <span className="text-xs text-maroon-700">Unsaved changes</span>}
              </div>
            </form>
          )}
        </>
      ) : (
        !area.note && <p className="mt-1.5 text-xs text-ink-400">No feedback recorded.</p>
      )}
    </div>
  );
}
