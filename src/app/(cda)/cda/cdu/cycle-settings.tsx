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
  technicalWeight: number;
  planningWeight: number;
  deliveryWeight: number;
  outcomesWeight: number;
  bronzeMin: number;
  silverMin: number;
  goldMin: number;
  platinumMin: number;
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

  const [weights, setWeights] = useState({
    technicalWeight: String(cycle.technicalWeight),
    planningWeight: String(cycle.planningWeight),
    deliveryWeight: String(cycle.deliveryWeight),
    outcomesWeight: String(cycle.outcomesWeight),
  });
  const [thresholds, setThresholds] = useState({
    bronzeMin: String(cycle.bronzeMin),
    silverMin: String(cycle.silverMin),
    goldMin: String(cycle.goldMin),
    platinumMin: String(cycle.platinumMin),
  });
  const [status, setStatus] = useState(cycle.status);

  const total = Object.values(weights).reduce((n, v) => n + (Number(v) || 0), 0);

  const weightFields = [
    { key: "technicalWeight", label: "Technical" },
    { key: "planningWeight", label: "Planning" },
    { key: "deliveryWeight", label: "Delivery" },
    { key: "outcomesWeight", label: "Outcomes" },
  ] as const;

  const thresholdFields = [
    { key: "bronzeMin", label: "Bronze" },
    { key: "silverMin", label: "Silver" },
    { key: "goldMin", label: "Gold" },
    { key: "platinumMin", label: "Platinum" },
  ] as const;

  return (
    <form action={formAction} className="card card-pad space-y-4">
      <input type="hidden" name="cycleId" value={cycle.id} />

      <div>
        <h2 className="font-semibold text-ink-900">Cycle settings</h2>
        <p className="mt-1 text-xs text-ink-500">
          Weights and thresholds apply to this cycle only. Ratings already released keep the numbers
          they were locked with.
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

      <fieldset>
        <legend className="label">Domain weights</legend>
        <div className="grid grid-cols-2 gap-2">
          {weightFields.map((f) => (
            <label key={f.key} className="text-xs text-ink-600">
              {f.label}
              <input
                name={f.key}
                type="number"
                min={0}
                max={100}
                className="input mt-1"
                value={weights[f.key]}
                onChange={(e) => setWeights((w) => ({ ...w, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {/* Live, because a total that isn't 100 is normalised rather than
            rejected — better to see it than to be surprised by it. */}
        <p className={`hint ${total === 100 ? "" : "text-maroon-700"}`}>
          Totals {total}%{total === 100 ? "" : " — will be normalised when scoring"}
        </p>
      </fieldset>

      <fieldset>
        <legend className="label">Shield thresholds</legend>
        <div className="grid grid-cols-2 gap-2">
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
      </fieldset>

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "ok" && <FormSuccess message={state.message} />}

      <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">
        Save cycle settings
      </SubmitButton>
    </form>
  );
}
