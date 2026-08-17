"use client";

import Link from "next/link";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui";
import { setClubActive } from "../actions";
import { AmbassadorsForm, type AmbassadorOption } from "./ambassadors-form";
import { ClubForm } from "./club-forms";
import { SignInLink } from "../assessors/sign-in-link";

export type ClubRowData = {
  id: string;
  name: string;
  zone: string;
  tier: string;
  contactName: string;
  contactEmail: string;
  active: boolean;
  assessmentId: string | null;
  /** The club's standing assessment tier, so editing doesn't silently clear it. */
  assessmentTierId: string;
  assessmentTierName: string;
  /** The CDAs who look after this club through the year. */
  ambassadorIds: string[];
  ambassadorNames: string[];
  members: { id: string; name: string; email: string; active: boolean; lastSeenAt: Date | null }[];
};

export function ClubRow({
  club,
  tiers = [],
  ambassadors = [],
}: {
  club: ClubRowData;
  tiers?: { id: string; code: string; name: string }[];
  ambassadors?: AmbassadorOption[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="space-y-4 bg-ink-50 px-5 py-4">
        <ClubForm initial={club} tiers={tiers} onDone={() => setEditing(false)} />

        <div className="border-t border-ink-200 pt-3">
          <h3 className="mb-1 text-sm font-semibold text-ink-900">
            Club Development Ambassadors
          </h3>
          <p className="mb-2 text-xs text-ink-600">
            Who looks after {club.name} through the year. It also decides what they can see: an
            assessor reaches this club only if they are its CDA <em>and</em> hold a line item in
            its pool.
          </p>
          <AmbassadorsForm
            clubId={club.id}
            clubName={club.name}
            assigned={club.ambassadorIds}
            options={ambassadors}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink-900">{club.name}</p>
            {!club.active && <Badge tone="bad">Inactive</Badge>}
            {club.members.length === 0 && <Badge tone="warn">No administrator</Badge>}
            {club.assessmentTierName ? (
              <Badge tone="muted">{club.assessmentTierName}</Badge>
            ) : (
              <Badge tone="warn">No assessment tier</Badge>
            )}
            {club.ambassadorIds.length === 0 && <Badge tone="warn">No CDA</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {[club.zone, club.tier].filter(Boolean).join(" · ") || "No zone recorded"}
            {club.contactEmail && ` · ${club.contactEmail}`}
            {club.ambassadorNames.length > 0 && ` · CDA: ${club.ambassadorNames.join(", ")}`}
          </p>

          {club.members.length > 0 && (
            <ul className="mt-2 space-y-1">
              {club.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ink-700">{m.name}</span>
                  <span className="text-ink-400">{m.email}</span>
                  {!m.active && <Badge tone="bad">Deactivated</Badge>}
                  {!m.lastSeenAt && m.active && <Badge tone="warn">Never signed in</Badge>}
                  <SignInLink userId={m.id} disabled={!m.active} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {club.assessmentId && (
            <Link href={`/cda/cdu/assessments/${club.assessmentId}`} className="btn-secondary btn-sm">
              Assessment
            </Link>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
          <form action={setClubActive}>
            <input type="hidden" name="clubId" value={club.id} />
            <input type="hidden" name="active" value={club.active ? "false" : "true"} />
            <SubmitButton
              className={club.active ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
              pendingLabel="…"
              confirm={
                club.active
                  ? `Mark ${club.name} inactive? They stay in past cycles but won't be assessed again.`
                  : undefined
              }
            >
              {club.active ? "Deactivate" : "Reactivate"}
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
