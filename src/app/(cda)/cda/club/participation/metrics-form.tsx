"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { METRIC_SPECS, metricChange } from "@/lib/cda/rubric";
import { saveMetrics, type ClubFormState } from "../actions";

const initialState: ClubFormState = { status: "idle" };

export type MetricValues = Record<string, { value: string; prior: string }>;

export function MetricsForm({
  initial,
  editable,
}: {
  initial: MetricValues;
  editable: boolean;
}) {
  const [state, formAction] = useActionState(saveMetrics, initialState);
  const [values, setValues] = useState<MetricValues>(initial);

  const set = (key: string, field: "value" | "prior", next: string) =>
    setValues((v) => ({ ...v, [key]: { ...v[key], [field]: next } }));

  return (
    <form action={formAction} className="space-y-4">
      <div className="card divide-y divide-ink-200">
        {METRIC_SPECS.map((spec) => {
          const entry = values[spec.key] ?? { value: "", prior: "" };
          const change = metricChange(
            entry.value === "" ? null : Number(entry.value),
            entry.prior === "" ? null : Number(entry.prior),
          );

          return (
            <div key={spec.key} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <div className="min-w-0">
                <label className="label mb-0" htmlFor={`m-${spec.key}`}>
                  {spec.label}
                </label>
                <p className="hint">{spec.hint}</p>
              </div>

              <div>
                <label className="label text-xs" htmlFor={`p-${spec.key}`}>
                  Last cycle
                </label>
                <input
                  id={`p-${spec.key}`}
                  name={`${spec.key}__prior`}
                  type="number"
                  min={0}
                  step={spec.percentage ? "0.1" : "1"}
                  className="input w-28"
                  value={entry.prior}
                  onChange={(e) => set(spec.key, "prior", e.target.value)}
                  disabled={!editable}
                />
              </div>

              <div>
                <label className="label text-xs" htmlFor={`m-${spec.key}`}>
                  This cycle{spec.percentage ? " (%)" : ""}
                </label>
                <input
                  id={`m-${spec.key}`}
                  name={spec.key}
                  type="number"
                  min={0}
                  step={spec.percentage ? "0.1" : "1"}
                  className="input w-28"
                  value={entry.value}
                  onChange={(e) => set(spec.key, "value", e.target.value)}
                  disabled={!editable}
                />
              </div>

              {/* Recomputed as they type, so a transposed digit shows up as an
                  implausible swing while they can still see what they entered. */}
              <div className="w-20 text-right text-sm tabular-nums">
                {change === null ? (
                  <span className="text-ink-300">—</span>
                ) : (
                  <span className={change < 0 ? "text-maroon-700" : "text-status-green-fg"}>
                    {change > 0 ? "+" : ""}
                    {change.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "ok" && <FormSuccess message={state.message} />}

      {editable && (
        <SubmitButton className="btn-primary" pendingLabel="Saving…">
          Save participation figures
        </SubmitButton>
      )}
    </form>
  );
}
