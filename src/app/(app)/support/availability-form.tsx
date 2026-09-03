"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { saveAvailability, type SubmitVideoState } from "./actions";

const initialState: SubmitVideoState = { status: "idle" };

/**
 * When a visit suits the coach, asked on the page they are already on.
 *
 * This used to be a Microsoft Form sent by email, with a column on a
 * spreadsheet tracking who had filled it in. Free text on both fields on
 * purpose: "Tuesdays or Thursdays" and "after the 5:30 session" are the real
 * answers, and a date picker would turn a standing arrangement into one
 * evening.
 *
 * Controlled throughout, like the video form and for the same reason — React 19
 * resets an uncontrolled form once the action settles.
 */
export function AvailabilityForm({
  caseId,
  defaultDay,
  defaultTime,
  defaultNote,
  answered,
}: {
  caseId: string;
  defaultDay: string;
  defaultTime: string;
  defaultNote: string;
  answered: boolean;
}) {
  const [state, formAction] = useActionState(saveAvailability, initialState);
  const [day, setDay] = useState(defaultDay);
  const [time, setTime] = useState(defaultTime);
  const [note, setNote] = useState(defaultNote);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="caseId" value={caseId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="availabilityDay">
            Which day suits
          </label>
          <input
            id="availabilityDay"
            name="availabilityDay"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            placeholder="Tuesdays or Thursdays"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="availabilityTime">
            What time
          </label>
          <input
            id="availabilityTime"
            name="availabilityTime"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="5:30pm training"
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="availabilityNote">
          Anything else
        </label>
        <textarea
          id="availabilityNote"
          name="availabilityNote"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Which ground, which team, or weeks you're away."
          className="input"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving…">
          {answered ? "Update this" : "Send it to my educator"}
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}
