"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import {
  deleteMakeUp,
  openMakeUp,
  settleMakeUp,
  type MakeUpState,
} from "@/app/(app)/admin/actions/make-ups";
import { formatHours, MAKE_UP_STATUS } from "@/lib/attendance";
import type { MakeUpStatus } from "@prisma-client";

const idle: MakeUpState = { status: "idle" };

/** Minutes as an hours field's value: 480 -> "8", 90 -> "1.5". */
function hoursValue(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

export type MakeUpDayOption = { id: string; label: string; minutes: number };

/**
 * Raises a debt against one enrolment.
 *
 * Picking a day fills the hours in from the day's own length, because off a
 * register the shortfall is already known and retyping it is a chance to get
 * it wrong. Both stay editable: half the debts in the real registers are
 * "3 hours on Day 2", not a whole day.
 */
export function OpenMakeUpForm({
  enrollmentId,
  days,
  defaultDayId,
  defaultMinutes,
  compact = false,
}: {
  enrollmentId: string;
  days: MakeUpDayOption[];
  defaultDayId?: string;
  /// Minutes, like everything else below the form. Turned into hours for the
  /// field, which is the only place the two units meet.
  defaultMinutes?: number;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(openMakeUp, idle);
  const [dayId, setDayId] = useState(defaultDayId ?? "");
  const [hours, setHours] = useState(
    defaultMinutes !== undefined ? hoursValue(defaultMinutes) : "",
  );
  const [note, setNote] = useState("");

  function pickDay(next: string) {
    setDayId(next);
    const day = days.find((d) => d.id === next);
    // Only fill an empty field: an educator who has already typed 3 hours
    // against Day 2 should not have it overwritten with 8 by the dropdown.
    if (day && !hours) setHours(hoursValue(day.minutes));
  }

  return (
    <form action={formAction} className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}>
      <input type="hidden" name="enrollmentId" value={enrollmentId} />

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Day missed</span>
        <select
          name="courseDayId"
          value={dayId}
          onChange={(e) => pickDay(e.target.value)}
          className="input px-2 py-1 text-xs"
        >
          <option value="">No particular day</option>
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Hours owed</span>
        <input
          name="hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          inputMode="decimal"
          placeholder="8"
          className="input w-24 px-2 py-1 text-xs"
        />
      </label>

      <label className={compact ? "block min-w-56 flex-1" : "block"}>
        <span className="mb-1 block text-xs font-medium text-ink-600">
          What's been arranged <span className="font-normal text-ink-400">(optional)</span>
        </span>
        <input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="GCK Day 3, or Sunny Coast Day 3"
          className="input w-full px-2 py-1 text-xs"
        />
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Raising…">
          Raise make-up
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

export type MakeUpRow = {
  id: string;
  minutesOwed: number;
  minutesCredited: number;
  status: MakeUpStatus;
  arrangedNote: string | null;
  creditedNote: string | null;
  dayLabel: string | null;
  openedAt: string;
  /** Whose debt it is. Omitted on a page that is already about one coach. */
  coachName?: string;
  courseTitle?: string;
  courseHref?: string;
};

const STATUS_ORDER: MakeUpStatus[] = ["OWED", "ARRANGED", "COMPLETED", "WAIVED"];

/**
 * One debt, with the controls to move it along.
 *
 * The row is a form of its own rather than part of a grid save: settling a
 * make-up is a decision about one coach that an educator makes when the news
 * reaches them, usually weeks after the course, and batching those into a
 * "save everything" button would invite settling one by accident.
 */
export function MakeUpCard({ row }: { row: MakeUpRow }) {
  const [state, formAction] = useActionState(settleMakeUp, idle);
  const [remove, removeAction] = useActionState(deleteMakeUp, idle);
  const [status, setStatus] = useState<MakeUpStatus>(row.status);
  const [note, setNote] = useState(row.arrangedNote ?? "");
  const [creditedNote, setCreditedNote] = useState(row.creditedNote ?? "");
  const [creditHours, setCreditHours] = useState(
    row.minutesCredited ? hoursValue(row.minutesCredited) : "",
  );

  const meta = MAKE_UP_STATUS[row.status];
  const outstanding =
    row.status === "COMPLETED" || row.status === "WAIVED"
      ? 0
      : Math.max(0, row.minutesOwed - row.minutesCredited);

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {row.coachName && <span className="font-medium text-ink-900">{row.coachName}</span>}
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-sm text-ink-700">
          {formatHours(row.minutesOwed)} owed
          {row.minutesCredited > 0 && row.status !== "WAIVED" && (
            <> · {formatHours(row.minutesCredited)} credited</>
          )}
          {outstanding > 0 && (
            <> · <strong className="text-maroon-700">{formatHours(outstanding)} still out</strong></>
          )}
        </span>
        <span className="text-xs text-ink-500">
          {row.dayLabel ?? "No particular day"}
          {row.courseTitle && (
            <>
              {" · "}
              {row.courseHref ? (
                <Link href={row.courseHref} className="underline">
                  {row.courseTitle}
                </Link>
              ) : (
                row.courseTitle
              )}
            </>
          )}
          {" · raised "}
          {row.openedAt}
        </span>
      </div>

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={row.id} />

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Status</span>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as MakeUpStatus)}
            className="input px-2 py-1 text-xs"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {MAKE_UP_STATUS[s].label}
              </option>
            ))}
          </select>
        </label>

        {status !== "COMPLETED" && status !== "WAIVED" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Hours done</span>
            <input
              name="creditHours"
              value={creditHours}
              onChange={(e) => setCreditHours(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="input w-24 px-2 py-1 text-xs"
            />
          </label>
        )}

        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-600">Arrangement</span>
          <input
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Where the hours are being made up"
            className="input w-full px-2 py-1 text-xs"
          />
        </label>

        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-600">How it was made up</span>
          <input
            name="creditedNote"
            value={creditedNote}
            onChange={(e) => setCreditedNote(e.target.value)}
            placeholder="Sat Day 3 at GCK, or written task"
            className="input w-full px-2 py-1 text-xs"
          />
        </label>

        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="text-xs text-ink-500">{MAKE_UP_STATUS[status].blurb}</p>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
        {row.status !== "COMPLETED" && (
          <form action={removeAction}>
            <input type="hidden" name="id" value={row.id} />
            <SubmitButton
              className="text-xs text-ink-500 underline hover:text-maroon-700"
              confirm="Remove this make-up? Use this only for one raised by mistake."
              pendingLabel="Removing…"
            >
              Remove
            </SubmitButton>
          </form>
        )}
        <FormError message={remove.status === "error" ? remove.message : null} />
      </div>
    </div>
  );
}
