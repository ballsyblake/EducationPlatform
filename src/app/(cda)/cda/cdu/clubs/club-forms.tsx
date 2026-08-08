"use client";

import { useActionState, useState } from "react";
import { InviteCallout } from "@/app/(app)/admin/people/invite-callout";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { addPortalUser, saveClub, type CduFormState } from "../actions";

const initialState: CduFormState = { status: "idle" };

const EMPTY = { name: "", zone: "", tier: "", contactName: "", contactEmail: "" };

export function ClubForm({
  initial,
  onDone,
}: {
  initial?: typeof EMPTY & { id: string };
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(
    async (prev: CduFormState, formData: FormData) => {
      const result = await saveClub(prev, formData);
      if (result.status === "ok") {
        if (!initial) setValues(EMPTY);
        onDone?.();
      }
      return result;
    },
    initialState,
  );

  const [values, setValues] = useState(initial ?? EMPTY);
  const set = (key: keyof typeof EMPTY, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const fields = [
    { key: "name", label: "Club name", placeholder: "Brisbane Cityside FC" },
    { key: "zone", label: "Zone", placeholder: "Brisbane Metro" },
    { key: "tier", label: "Tier", placeholder: "NPL, FQPL or Community" },
    { key: "contactName", label: "Primary contact", placeholder: "Name" },
    { key: "contactEmail", label: "Contact email", placeholder: "admin@club.com.au" },
  ] as const;

  return (
    <form action={formAction} className="space-y-3">
      {initial && <input type="hidden" name="clubId" value={initial.id} />}

      {fields.map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={`${f.key}-${initial?.id ?? "new"}`}>
            {f.label}
          </label>
          <input
            id={`${f.key}-${initial?.id ?? "new"}`}
            name={f.key}
            className="input"
            value={values[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            required={f.key === "name"}
          />
        </div>
      ))}

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "ok" && <FormSuccess message={state.message} />}

      <div className="flex gap-2">
        <SubmitButton className="btn-primary" pendingLabel="Saving…">
          {initial ? "Save changes" : "Add club"}
        </SubmitButton>
        {onDone && initial && (
          <button type="button" className="btn-secondary" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** Creates a club administrator account and shows the sign-in link once. */
export function AddClubAdminForm({ clubs }: { clubs: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(addPortalUser, initialState);
  const [values, setValues] = useState({ email: "", name: "", clubId: "" });

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="role" value="CLUB" />

        <div>
          <label className="label" htmlFor="admin-club">
            Club
          </label>
          <select
            id="admin-club"
            name="clubId"
            className="input"
            value={values.clubId}
            onChange={(e) => setValues((v) => ({ ...v, clubId: e.target.value }))}
            required
          >
            <option value="">Choose a club…</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="admin-name">
            Name
          </label>
          <input
            id="admin-name"
            name="name"
            className="input"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            placeholder="Full name"
          />
        </div>

        <div>
          <label className="label" htmlFor="admin-email">
            Email
          </label>
          <input
            id="admin-email"
            name="email"
            type="email"
            className="input"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            placeholder="admin@club.com.au"
            required
          />
          <p className="hint">No password. They sign in with the link you hand them.</p>
        </div>

        {state.status === "error" && <FormError message={state.message} />}

        <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
          Add club administrator
        </SubmitButton>
      </form>

      {state.status === "ok" && state.invite && (
        <InviteCallout invite={state.invite} message={state.message} />
      )}
    </div>
  );
}
