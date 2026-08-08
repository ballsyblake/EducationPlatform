"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui";
import { EMPLOYMENT_LABELS, STAFF_ROLE_SPECS } from "@/lib/cda/rubric";
import { deleteStaffMember } from "../actions";
import { StaffForm, type QualificationOption, type StaffValues } from "./staff-form";

export type StaffRowData = StaffValues & {
  id: string;
  qualificationLabel: string | null;
  certificates: { id: string; filename: string }[];
};

export function StaffRow({
  staff,
  qualifications,
  editable,
}: {
  staff: StaffRowData;
  qualifications: QualificationOption[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="bg-ink-50 px-5 py-4">
        <StaffForm
          qualifications={qualifications}
          initial={staff}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink-900">{staff.name}</p>
          {!staff.blueCard && <Badge tone="bad">No Blue Card</Badge>}
          {!staff.qualificationId && <Badge tone="warn">No qualification recorded</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          {STAFF_ROLE_SPECS[staff.staffRole as keyof typeof STAFF_ROLE_SPECS].label} ·{" "}
          {staff.qualificationLabel ?? "No qualification recorded"} ·{" "}
          {EMPLOYMENT_LABELS[staff.employment as keyof typeof EMPLOYMENT_LABELS]} ·{" "}
          {staff.yearsExperience} yr
          {staff.yearsExperience === "1" ? "" : "s"}
        </p>
        {staff.certificates.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-2 text-xs">
            {staff.certificates.map((c) => (
              <a
                key={c.id}
                href={`/api/files/${c.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-maroon-700 underline hover:text-maroon-800"
              >
                {c.filename}
              </a>
            ))}
          </p>
        )}
      </div>

      {editable && (
        <div className="flex gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
          <form action={deleteStaffMember}>
            <input type="hidden" name="staffId" value={staff.id} />
            <SubmitButton
              className="btn-danger btn-sm"
              pendingLabel="…"
              confirm={`Remove ${staff.name} from the register?`}
            >
              Remove
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
