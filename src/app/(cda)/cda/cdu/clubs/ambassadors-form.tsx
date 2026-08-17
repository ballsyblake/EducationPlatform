"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { setClubAmbassadors, type CduFormState } from "../actions";

const initial: CduFormState = { status: "idle" };

export type AmbassadorOption = { id: string; name: string; clubs: number };

/**
 * Who looks after this club through the year.
 *
 * Checkboxes rather than a single select: a club can have more than one CDA,
 * and the load figure beside each name is the thing that actually gets used —
 * spreading thirty-seven clubs across a handful of ambassadors is the job, and
 * it can't be done from a list that doesn't say who is already carrying what.
 */
export function AmbassadorsForm({
  clubId,
  clubName,
  assigned,
  options,
}: {
  clubId: string;
  clubName: string;
  assigned: string[];
  options: AmbassadorOption[];
}) {
  const [state, formAction] = useActionState(setClubAmbassadors, initial);
  const [picked, setPicked] = useState<string[]>(assigned);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (options.length === 0) {
    return (
      <p className="text-xs text-ink-500">
        No assessors yet. Add them under Assessors, then come back to say which clubs each looks
        after.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="clubId" value={clubId} />

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              name="ambassadorId"
              value={o.id}
              checked={picked.includes(o.id)}
              onChange={() => toggle(o.id)}
              className="h-4 w-4 accent-maroon-600"
            />
            <span>{o.name}</span>
            <span className="text-ink-400">
              {o.clubs} club{o.clubs === 1 ? "" : "s"}
            </span>
          </label>
        ))}
      </div>

      {picked.length === 0 && (
        <Badge tone="warn">No CDA — nobody can assess {clubName}</Badge>
      )}

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "ok" && <FormSuccess message={state.message} />}

      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
        Save CDAs
      </SubmitButton>
    </form>
  );
}
