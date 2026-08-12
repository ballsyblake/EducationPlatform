"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { createCycle, type CduFormState } from "./actions";

const initialState: CduFormState = { status: "idle" };

/**
 * The first thing a fresh instance needs.
 *
 * A brand-new deployment has the rubric and nothing else — no cycle, no clubs,
 * no accounts — and every screen in the portal hangs off a cycle. The action to
 * create one already existed but had no button anywhere, so the empty state read
 * "create a cycle to start assessing clubs" and gave nobody a way to do it.
 */
export function NewCycle({ suggestedYear }: { suggestedYear: number }) {
  const [state, formAction] = useActionState(createCycle, initialState);
  const [year, setYear] = useState(String(suggestedYear));

  return (
    <form action={formAction} className="card card-pad max-w-md space-y-3">
      <div>
        <h2 className="font-semibold text-ink-900">Open an assessment cycle</h2>
        <p className="mt-1 text-sm text-ink-600">
          A cycle holds one season&apos;s assessments. It starts in Setup, where clubs can&apos;t
          see it — add your clubs and their administrators first, then move it to Club entry.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="year">
          Season
        </label>
        <input
          id="year"
          name="year"
          type="number"
          min={2020}
          max={2100}
          className="input"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </div>

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "ok" && <FormSuccess message={state.message} />}

      <SubmitButton className="btn-primary" pendingLabel="Creating…">
        Create cycle
      </SubmitButton>
    </form>
  );
}
