"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import {
  EMPLOYMENT_LABELS,
  GENDER_LABELS,
  QUALIFICATION_STREAM_LABELS,
  STAFF_ROLE_ORDER,
  STAFF_ROLE_SPECS,
} from "@/lib/cda/rubric";
import { saveStaffMember, type ClubFormState } from "../actions";

export type QualificationOption = {
  id: string;
  label: string;
  stream: "OUTFIELD" | "GOALKEEPING" | "COMMUNITY";
};

export type StaffValues = {
  id?: string;
  name: string;
  email: string;
  staffRole: string;
  qualificationId: string;
  yearsExperience: string;
  employment: string;
  gender: string;
  blueCard: boolean;
  blueCardExpiry: string;
  notes: string;
};

export const EMPTY_STAFF: StaffValues = {
  name: "",
  email: "",
  staffRole: "YOUTH_HEAD_COACH",
  qualificationId: "",
  yearsExperience: "0",
  employment: "VOLUNTEER",
  gender: "UNDISCLOSED",
  blueCard: false,
  blueCardExpiry: "",
  notes: "",
};

const initialState: ClubFormState = { status: "idle" };

/**
 * Every field is controlled.
 *
 * React 19 resets an uncontrolled form once the action settles, so a rejected
 * submission would hand back an empty form — and this one is long enough that
 * retyping it after a typo in the email field would be genuinely infuriating.
 */
export function StaffForm({
  qualifications,
  initial = EMPTY_STAFF,
  onDone,
  compact = false,
}: {
  qualifications: QualificationOption[];
  initial?: StaffValues;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(
    async (prev: ClubFormState, formData: FormData) => {
      const result = await saveStaffMember(prev, formData);
      if (result.status === "ok") {
        // Clearing only on success is the whole point of holding this state.
        if (!initial.id) setValues(EMPTY_STAFF);
        onDone?.();
      }
      return result;
    },
    initialState,
  );

  const [values, setValues] = useState<StaffValues>(initial);
  const set = <K extends keyof StaffValues>(key: K, value: StaffValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const spec = STAFF_ROLE_SPECS[values.staffRole as keyof typeof STAFF_ROLE_SPECS];

  // Qualifications are grouped by stream so the goalkeeping ladder doesn't sit
  // in the middle of the outfield one, and the discount for picking off-stream
  // is explained before they pick rather than after.
  const grouped = (["OUTFIELD", "GOALKEEPING", "COMMUNITY"] as const).map((stream) => ({
    stream,
    options: qualifications.filter((q) => q.stream === stream),
  }));

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="staffId" value={initial.id} />}

      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label className="label" htmlFor={`name-${initial.id ?? "new"}`}>
            Name
          </label>
          <input
            id={`name-${initial.id ?? "new"}`}
            name="name"
            className="input"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Full name"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor={`email-${initial.id ?? "new"}`}>
            Email <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id={`email-${initial.id ?? "new"}`}
            name="email"
            type="email"
            className="input"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="name@club.com.au"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`role-${initial.id ?? "new"}`}>
          Role at the club
        </label>
        <select
          id={`role-${initial.id ?? "new"}`}
          name="staffRole"
          className="input"
          value={values.staffRole}
          onChange={(e) => set("staffRole", e.target.value)}
        >
          {STAFF_ROLE_ORDER.map((role) => (
            <option key={role} value={role}>
              {STAFF_ROLE_SPECS[role].label}
            </option>
          ))}
        </select>
        <p className="hint">{spec.blurb}</p>
      </div>

      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label className="label" htmlFor={`qual-${initial.id ?? "new"}`}>
            Highest qualification held
          </label>
          <select
            id={`qual-${initial.id ?? "new"}`}
            name="qualificationId"
            className="input"
            value={values.qualificationId}
            onChange={(e) => set("qualificationId", e.target.value)}
          >
            <option value="">Not recorded</option>
            {grouped.map((group) =>
              group.options.length ? (
                <optgroup key={group.stream} label={QUALIFICATION_STREAM_LABELS[group.stream]}>
                  {group.options.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
          <p className="hint">
            {spec.stream === "GOALKEEPING"
              ? "This is a goalkeeping role — an outfield licence counts at half value here."
              : spec.stream === "OUTFIELD"
                ? "This is an outfield role — a goalkeeping licence counts at half value here."
                : "Any stream counts in full for this role."}
          </p>
        </div>

        <div>
          <label className="label" htmlFor={`years-${initial.id ?? "new"}`}>
            Years of experience in this role
          </label>
          <input
            id={`years-${initial.id ?? "new"}`}
            name="yearsExperience"
            type="number"
            min={0}
            max={60}
            className="input"
            value={values.yearsExperience}
            onChange={(e) => set("yearsExperience", e.target.value)}
          />
        </div>
      </div>

      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label className="label" htmlFor={`employment-${initial.id ?? "new"}`}>
            Employment type
          </label>
          <select
            id={`employment-${initial.id ?? "new"}`}
            name="employment"
            className="input"
            value={values.employment}
            onChange={(e) => set("employment", e.target.value)}
          >
            {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor={`gender-${initial.id ?? "new"}`}>
            Gender
          </label>
          <select
            id={`gender-${initial.id ?? "new"}`}
            name="gender"
            className="input"
            value={values.gender}
            onChange={(e) => set("gender", e.target.value)}
          >
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="hint">Used for the female coaching presence Non-Negotiable.</p>
        </div>
      </div>

      <fieldset className="rounded-lg border border-ink-200 p-3">
        <legend className="px-1 text-sm font-medium text-ink-700">Blue Card</legend>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="blueCard"
            className="h-4 w-4 accent-maroon-600"
            checked={values.blueCard}
            onChange={(e) => set("blueCard", e.target.checked)}
          />
          Holds a current Working with Children Check
        </label>
        <div className="mt-3">
          <label className="label" htmlFor={`bc-${initial.id ?? "new"}`}>
            Expiry
          </label>
          <input
            id={`bc-${initial.id ?? "new"}`}
            name="blueCardExpiry"
            type="date"
            className="input max-w-52"
            value={values.blueCardExpiry}
            onChange={(e) => set("blueCardExpiry", e.target.value)}
          />
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor={`cert-${initial.id ?? "new"}`}>
          Qualification certificate <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <input
          id={`cert-${initial.id ?? "new"}`}
          name="certificate"
          type="file"
          className="input"
          accept="image/*,application/pdf"
        />
        <p className="hint">PDF or image. Attaching one saves the assessor asking for it later.</p>
      </div>

      <div>
        <label className="label" htmlFor={`notes-${initial.id ?? "new"}`}>
          Notes <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <textarea
          id={`notes-${initial.id ?? "new"}`}
          name="notes"
          rows={2}
          className="input"
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything Football Queensland should know about this appointment."
        />
      </div>

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "ok" && <FormSuccess message={state.message} />}

      <div className="flex gap-2">
        <SubmitButton className="btn-primary" pendingLabel="Saving…">
          {initial.id ? "Save changes" : "Add staff member"}
        </SubmitButton>
        {onDone && initial.id && (
          <button type="button" className="btn-secondary" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
