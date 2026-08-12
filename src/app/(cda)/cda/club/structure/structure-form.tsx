"use client";

import { useActionState, useState } from "react";
import { ShieldBadge } from "@/components/cda/shield";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  type StructureResult,
  type StructureRoleSpec,
} from "@/lib/cda/structure";
import { saveStructure, type ClubFormState } from "../actions";
import type { RoleStatus } from "@prisma-client";

const initialState: ClubFormState = { status: "idle" };

export type StructureRow = StructureRoleSpec & {
  status: RoleStatus;
  holderName: string | null;
  note: string | null;
};

export function StructureForm({
  roles,
  result,
  configured,
  editable,
}: {
  roles: StructureRow[];
  result: StructureResult;
  configured: boolean;
  editable: boolean;
}) {
  const [state, formAction] = useActionState(saveStructure, initialState);

  // Controlled, so the saved-and-recomputed result on the left stays in step
  // with the selections on the right after React resettles the form.
  const [status, setStatus] = useState<Record<string, RoleStatus>>(
    Object.fromEntries(roles.map((r) => [r.id, r.status])),
  );
  const [holders, setHolders] = useState<Record<string, string>>(
    Object.fromEntries(roles.map((r) => [r.id, r.holderName ?? ""])),
  );

  const functions = roles.filter((r) => r.counts);
  const documents = roles.filter((r) => !r.counts);

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <section>
          <h2 className="section-title mb-3">Organisational functions</h2>
          <div className="card divide-y divide-ink-200">
            {functions.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                status={status[role.id]}
                holder={holders[role.id]}
                editable={editable}
                onStatus={(v) => setStatus((s) => ({ ...s, [role.id]: v }))}
                onHolder={(v) => setHolders((h) => ({ ...h, [role.id]: v }))}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">Submitted with your structure</h2>
          <div className="card divide-y divide-ink-200">
            {documents.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                status={status[role.id]}
                holder={holders[role.id]}
                editable={editable}
                onStatus={(v) => setStatus((s) => ({ ...s, [role.id]: v }))}
                onHolder={(v) => setHolders((h) => ({ ...h, [role.id]: v }))}
                hideHolder
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Required at every shield level, and not counted among the functions above.
          </p>
        </section>
      </div>

      <aside className="space-y-4">
        <div className="card card-pad">
          <p className="section-title">Standard met</p>
          <div className="mt-2">
            {configured ? (
              <ShieldBadge shield={result.level} size="lg" short />
            ) : (
              <Badge tone="muted">Not set for this cycle</Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-600">
            {result.functionsCovered} of {result.functionsTotal} functions filled.
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Saved answers only — the figure updates when you save.
          </p>
        </div>

        {configured &&
          result.checks.map((check) => (
            <div key={check.shield} className="card card-pad">
              <div className="flex items-center justify-between gap-2">
                <ShieldBadge shield={check.shield} size="sm" />
                <Badge tone={check.met ? "good" : "muted"}>{check.met ? "Met" : "Not met"}</Badge>
              </div>
              {check.failures.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {check.failures.map((f) => (
                    <li key={f} className="text-xs text-ink-600">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

        {editable && (
          <div className="card card-pad space-y-2">
            {state.status === "error" && <FormError message={state.message} />}
            {state.status === "ok" && <FormSuccess message={state.message} />}
            <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">
              Save structure
            </SubmitButton>
          </div>
        )}
      </aside>
    </form>
  );
}

function RoleRow({
  role,
  status,
  holder,
  editable,
  onStatus,
  onHolder,
  hideHolder,
}: {
  role: StructureRow;
  status: RoleStatus;
  holder: string;
  editable: boolean;
  onStatus: (v: RoleStatus) => void;
  onHolder: (v: string) => void;
  hideHolder?: boolean;
}) {
  const options = STATUS_OPTIONS[role.kind];

  return (
    <div className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-ink-900">{role.label}</p>
        {status === "ABSENT" && <Badge tone="muted">Not filled</Badge>}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_14rem]">
        <select
          name={`status:${role.id}`}
          className="input"
          value={status}
          disabled={!editable}
          onChange={(e) => onStatus(e.target.value as RoleStatus)}
          aria-label={`Status for ${role.label}`}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {STATUS_LABELS[o]}
            </option>
          ))}
        </select>

        {!hideHolder && (
          <input
            name={`holder:${role.id}`}
            className="input"
            value={holder}
            disabled={!editable}
            onChange={(e) => onHolder(e.target.value)}
            placeholder="Who holds it"
            aria-label={`Who holds ${role.label}`}
          />
        )}
      </div>
    </div>
  );
}
