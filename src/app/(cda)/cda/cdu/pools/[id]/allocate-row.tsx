"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError } from "@/components/ui";
import { MAX_ASSESSORS_PER_CLUB } from "@/lib/cda/rubric";
import {
  assignCriterion,
  reopenAssignment,
  unassignCriterion,
  type CduFormState,
} from "../../actions";

const initialState: CduFormState = { status: "idle" };

export type AllocationRow = {
  criterionId: string;
  code: string;
  title: string;
  mode: "EVIDENCE" | "OBSERVATION";
  weight: number;
  scored: number;
  /** Clubs in the pool this line item actually applies to. */
  clubs: number;
  /** Clubs in the pool at all, so a tier mismatch can be shown as one. */
  poolClubs: number;
  slots: {
    slot: number;
    assignmentId: string | null;
    assessorId: string | null;
    assessorName: string | null;
    submittedAt: Date | null;
    scored: number;
    /** Clubs on this item that this assessor is also the CDA for. */
    covers: number;
  }[];
};

export function AllocateRow({
  poolId,
  row,
  assessors,
}: {
  poolId: string;
  row: AllocationRow;
  assessors: { id: string; name: string; load: number }[];
}) {
  const [state, formAction] = useActionState(assignCriterion, initialState);

  const filled = row.slots.filter((s) => s.assignmentId);
  const taken = new Set(filled.map((s) => s.assessorId));

  // Slot 3 is offered only once 1 and 2 are in — it exists to break a split
  // between them, so offering it up front invites a third opinion nobody needs.
  const nextSlot = row.slots.find((s) => !s.assignmentId && (s.slot < 3 || filled.length >= 2));

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-ink-400">{row.code}</span>
            <span className="font-medium text-ink-900">{row.title}</span>
            {row.weight > 1 && <Badge tone="info">×{row.weight}</Badge>}
            {row.mode === "OBSERVATION" && <Badge tone="muted">Observation</Badge>}
            {filled.length === 0 && <Badge tone="bad">Unallocated</Badge>}
            {row.clubs < row.poolClubs && (
              <Badge tone="warn">
                {row.clubs} of {row.poolClubs} clubs
              </Badge>
            )}
          </div>

          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {filled.map((s) => (
              <li key={s.slot} className="flex items-center gap-2 text-xs">
                <span className="text-ink-400">
                  {s.slot === 3 ? "Tiebreak" : `Assessor ${s.slot}`}
                </span>
                <span className="text-ink-700">{s.assessorName}</span>
                <span className="tabular-nums text-ink-400">
                  {s.scored}/{s.covers}
                </span>
                {/* An assessor reaches a club only where their portfolio and
                    this allocation overlap, so an item can read "allocated"
                    and still leave clubs nobody can score. */}
                {s.covers < row.clubs && (
                  <Badge tone={s.covers === 0 ? "bad" : "warn"}>
                    {s.covers === 0
                      ? "not their CDA on any"
                      : `CDA for ${s.covers} of ${row.clubs}`}
                  </Badge>
                )}
                {s.submittedAt ? (
                  <form action={reopenAssignment} className="inline">
                    <input type="hidden" name="assignmentId" value={s.assignmentId ?? ""} />
                    <SubmitButton
                      className="btn-secondary btn-sm"
                      pendingLabel="…"
                      confirm="Reopen this line item? The pool's clubs come back out of reconciliation."
                    >
                      Reopen
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={unassignCriterion} className="inline">
                    <input type="hidden" name="assignmentId" value={s.assignmentId ?? ""} />
                    <SubmitButton
                      className="btn-danger btn-sm"
                      pendingLabel="…"
                      confirm={`Remove ${s.assessorName} from ${row.code}? Their ${s.scored} scores for it will be deleted.`}
                    >
                      Remove
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>

        {nextSlot && (
          <form action={formAction} className="flex shrink-0 flex-wrap items-end gap-2">
            <input type="hidden" name="poolId" value={poolId} />
            <input type="hidden" name="criterionId" value={row.criterionId} />
            <input type="hidden" name="slot" value={nextSlot.slot} />
            <div>
              <label className="label text-xs" htmlFor={`a-${row.criterionId}`}>
                {nextSlot.slot === 3 ? "Tiebreaker" : `Assessor ${nextSlot.slot}`}
              </label>
              <select
                id={`a-${row.criterionId}`}
                name="assessorId"
                className="input w-52"
                defaultValue=""
              >
                <option value="">Choose…</option>
                {assessors
                  .filter((a) => !taken.has(a.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.load} item{a.load === 1 ? "" : "s"}
                    </option>
                  ))}
              </select>
            </div>
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
              Assign
            </SubmitButton>
          </form>
        )}

        {!nextSlot && filled.length >= MAX_ASSESSORS_PER_CLUB && (
          <span className="shrink-0 text-xs text-ink-400">All slots filled</span>
        )}
      </div>

      {state.status === "error" && (
        <div className="mt-2">
          <FormError message={state.message} />
        </div>
      )}
    </div>
  );
}
