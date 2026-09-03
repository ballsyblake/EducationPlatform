"use client";

import { useActionState, useState } from "react";
import { Stars } from "@/components/cda/stars";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError } from "@/components/ui";
import { starLabel } from "@/lib/cda/rubric";
import { AGREEMENT_LABELS, type AgreementLevel } from "@/lib/cda/scoring";
import { resolveCriterion, type CduFormState } from "../../../actions";

const initialState: CduFormState = { status: "idle" };

export type ResolveRowData = {
  criterionId: string;
  code: string;
  title: string;
  weight: number;
  maxScore: number;
  area: string | null;
  level: AgreementLevel;
  spread: number;
  suggested: number | null;
  final: number | null;
  rationale: string;
  entries: { assessorId: string; assessorName: string; stars: number | null; comment: string | null }[];
};

const LEVEL_TONE = {
  UNSCORED: "muted",
  AGREED: "good",
  PARTIAL: "warn",
  MINOR: "warn",
  MAJOR: "bad",
} as const;

export function ResolveRow({
  assessmentId,
  row,
  locked,
}: {
  assessmentId: string;
  row: ResolveRowData;
  locked: boolean;
}) {
  const [state, formAction] = useActionState(resolveCriterion, initialState);

  // Pre-selected to the median when nothing has been resolved yet. The CDU
  // still has to press the button — the suggestion is a starting point, not a
  // decision made on their behalf.
  const [stars, setStars] = useState<number | null>(row.final ?? row.suggested);
  const [rationale, setRationale] = useState(row.rationale);
  const [open, setOpen] = useState(false);

  const hasComments = row.entries.some((e) => e.comment);
  const departing = stars !== null && row.suggested !== null && stars !== row.suggested;

  return (
    <div className={`px-4 py-3 ${row.final === null ? "bg-white" : "bg-ink-50/60"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-ink-400">{row.code}</span>
            <span className="font-medium text-ink-900">{row.title}</span>
            {row.weight > 1 && <Badge tone="info">×{row.weight}</Badge>}
            <Badge tone={LEVEL_TONE[row.level]}>{AGREEMENT_LABELS[row.level]}</Badge>
            {row.final !== null && <Badge tone="ok">Resolved</Badge>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
            {row.entries.map((e) => (
              <span key={e.assessorId} className="flex items-center gap-1.5 text-xs">
                <span className="text-ink-500">{e.assessorName}</span>
                <Stars value={e.stars} max={row.maxScore} size="sm" />
              </span>
            ))}
          </div>

          {hasComments && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-1.5 text-xs font-medium text-maroon-700 hover:text-maroon-800"
            >
              {open ? "Hide assessor comments" : "Read assessor comments"}
            </button>
          )}

          {open && (
            <ul className="mt-2 space-y-2">
              {row.entries
                .filter((e) => e.comment)
                .map((e) => (
                  <li key={e.assessorId} className="rounded bg-ink-50 px-3 py-2 text-xs">
                    <span className="font-medium text-ink-700">{e.assessorName}</span>
                    <span className="ml-2 text-ink-400">
                      {e.stars !== null ? starLabel(e.stars) : "not scored"}
                    </span>
                    <p className="mt-0.5 text-ink-600">{e.comment}</p>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <form action={formAction} className="w-full shrink-0 space-y-2 sm:w-64">
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <input type="hidden" name="criterionId" value={row.criterionId} />
          <input type="hidden" name="stars" value={stars ?? ""} />

          <div className="flex gap-1" role="radiogroup" aria-label={`Final rating for ${row.code}`}>
            {Array.from({ length: row.maxScore + 1 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                disabled={locked}
                onClick={() => setStars(n)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  stars === n
                    ? "border-maroon-600 bg-maroon-600 text-white"
                    : "border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                }`}
                title={starLabel(n)}
              >
                {n}
              </button>
            ))}
          </div>

          {departing && (
            <textarea
              name="rationale"
              rows={2}
              className="input"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why you're departing from the assessors' median."
            />
          )}
          {!departing && <input type="hidden" name="rationale" value={rationale} />}

          {state.status === "error" && <FormError message={state.message} />}

          {!locked && (
            <SubmitButton
              className={row.final === null ? "btn-primary btn-sm w-full" : "btn-secondary btn-sm w-full"}
              pendingLabel="Saving…"
              disabled={stars === null}
            >
              {row.final === null ? "Resolve" : "Change"}
            </SubmitButton>
          )}
        </form>
      </div>

      {row.rationale && (
        <p className="mt-2 text-xs text-ink-500">
          <span className="font-medium">Rationale:</span> {row.rationale}
        </p>
      )}
    </div>
  );
}
