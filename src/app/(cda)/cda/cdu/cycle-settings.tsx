"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { updateCycle, type CduFormState } from "./actions";

const initialState: CduFormState = { status: "idle" };

export type CycleSettingsData = {
  id: string;
  name: string;
  status: string;
  technicalMaxPoints: number;
  bronzeMin: number;
  silverMin: number;
  goldMin: number;
};

const STATUSES = [
  { value: "SETUP", label: "Setup — hidden from clubs" },
  { value: "CLUB_ENTRY", label: "Club entry — clubs submitting" },
  { value: "ASSESSING", label: "Assessing — assessors scoring" },
  { value: "RECONCILING", label: "Reconciling — CDU finalising" },
  { value: "PUBLISHED", label: "Published — ratings released" },
];

export function CycleSettings({ cycle }: { cycle: CycleSettingsData }) {
  const [state, formAction] = useActionState(updateCycle, initialState);

  const [technicalMaxPoints, setTechnicalMaxPoints] = useState(String(cycle.technicalMaxPoints));
  const [thresholds, setThresholds] = useState({
    bronzeMin: String(cycle.bronzeMin),
    silverMin: String(cycle.silverMin),
    goldMin: String(cycle.goldMin),
  });
  const [status, setStatus] = useState(cycle.status);

  const thresholdFields = [
    { key: "bronzeMin", label: "Bronze" },
    { key: "silverMin", label: "Silver" },
    { key: "goldMin", label: "Gold" },
  ] as const;

  return (
    <form action={formAction} className="card card-pad space-y-4">
      <input type="hidden" name="cycleId" value={cycle.id} />

      <div>
        <h2 className="font-semibold text-ink-900">Cycle settings</h2>
        <p className="mt-1 text-xs text-ink-500">
          These apply to this cycle only. Ratings already released keep the numbers they were locked
          with.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="cycle-status">
          Stage
        </label>
        <select
          id="cycle-status"
          name="status"
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="technical-max">
          Technical Qualifications points
        </label>
        <input
          id="technical-max"
          name="technicalMaxPoints"
          type="number"
          min={0}
          max={5000}
          className="input"
          value={technicalMaxPoints}
          onChange={(e) => setTechnicalMaxPoints(e.target.value)}
        />
        {/* The only domain whose maximum is set rather than derived: it has no
            line items to add up. Raising it raises Technical's share of the
            rating and lowers everything else's. */}
        <p className="hint">
          Planning, Delivery and Outcomes take their points from their own line items. Technical has
          none, so its maximum is set here — and that decides its share of the rating.
        </p>
      </div>

      <fieldset>
        <legend className="label">Shield thresholds</legend>
        <div className="grid grid-cols-3 gap-2">
          {thresholdFields.map((f) => (
            <label key={f.key} className="text-xs text-ink-600">
              {f.label}
              <input
                name={f.key}
                type="number"
                min={0}
                max={100}
                className="input mt-1"
                value={thresholds[f.key]}
                onChange={(e) => setThresholds((t) => ({ ...t, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="hint mt-1">
          Three shields, Gold at the top. A club scoring below Bronze receives the FQ Development
          Committed badge instead, provided you have recorded it as licence compliant.
        </p>
      </fieldset>

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "ok" && <FormSuccess message={state.message} />}

      <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">
        Save cycle settings
      </SubmitButton>
    </form>
  );
}
