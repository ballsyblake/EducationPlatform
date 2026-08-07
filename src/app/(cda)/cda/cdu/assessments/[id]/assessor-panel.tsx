"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError } from "@/components/ui";
import { MAX_ASSESSORS_PER_CLUB } from "@/lib/cda/rubric";
import { formatDate } from "@/lib/format";
import { assignAssessor, unassignAssessor, type CduFormState } from "../../actions";

const initialState: CduFormState = { status: "idle" };

export type AssignedAssessor = {
  id: string;
  name: string;
  email: string;
  submittedAt: Date | null;
  scored: number;
};

export function AssessorPanel({
  assessmentId,
  assigned,
  available,
  criteriaCount,
  locked,
}: {
  assessmentId: string;
  assigned: AssignedAssessor[];
  available: { id: string; name: string; email: string; load: number }[];
  criteriaCount: number;
  locked: boolean;
}) {
  const [state, formAction] = useActionState(assignAssessor, initialState);

  const full = assigned.length >= MAX_ASSESSORS_PER_CLUB;

  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink-900">Assessors</h2>
        <span className="text-xs text-ink-500">
          {assigned.length} of {MAX_ASSESSORS_PER_CLUB}
        </span>
      </div>

      {assigned.length === 0 ? (
        <p className="mb-3 text-sm text-ink-500">Nobody assigned yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {assigned.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{a.name}</p>
                <p className="text-xs text-ink-500">
                  {a.submittedAt
                    ? `Submitted ${formatDate(a.submittedAt)}`
                    : `${a.scored}/${criteriaCount} scored`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.submittedAt ? <Badge tone="good">In</Badge> : <Badge tone="warn">Working</Badge>}
                {!locked && (
                  <form action={unassignAssessor}>
                    <input type="hidden" name="assessmentId" value={assessmentId} />
                    <input type="hidden" name="assessorId" value={a.id} />
                    <SubmitButton
                      className="btn-danger btn-sm"
                      pendingLabel="…"
                      confirm={`Remove ${a.name} from this club? Their ${a.scored} scores will be deleted.`}
                    >
                      Remove
                    </SubmitButton>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!locked && !full && (
        <form action={formAction} className="space-y-2 border-t border-ink-200 pt-3">
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <label className="label" htmlFor={`assign-${assessmentId}`}>
            Assign an assessor
          </label>
          <select id={`assign-${assessmentId}`} name="assessorId" className="input" defaultValue="">
            <option value="">Choose…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.load} club{a.load === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          {/* Current load is on every option so the CDU spreads the pool rather
              than repeatedly picking the first name they recognise. */}
          <p className="hint">Assessors are listed with how many clubs they already carry.</p>

          {state.status === "error" && <FormError message={state.message} />}

          <SubmitButton className="btn-secondary btn-sm w-full" pendingLabel="Assigning…">
            Assign
          </SubmitButton>
        </form>
      )}

      {full && <p className="border-t border-ink-200 pt-3 text-xs text-ink-500">
        This club has the maximum of {MAX_ASSESSORS_PER_CLUB} assessors.
      </p>}
    </div>
  );
}
