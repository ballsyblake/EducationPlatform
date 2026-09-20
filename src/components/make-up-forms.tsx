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
import { formatHours, makeUpAmount, MAKE_UP_STATUS } from "@/lib/attendance";
import type { MakeUpStatus } from "@prisma-client";

const idle: MakeUpState = { status: "idle" };

/** Minutes as a field's value: 480 -> "8", 90 -> "1.5". Days or hours alike. */
function fieldValue(minutes: number, per: number): string {
  return String(Math.round((minutes / per) * 100) / 100);
}

export type MakeUpDayOption = { id: string; label: string; minutes: number };

/**
 * Raises a debt against one enrolment, in days.
 *
 * Days are the unit because they are the unit of the thing being arranged: a
 * coach makes up a day by sitting a day, on another course, with the register
 * it belongs to. The hours field is still here for the debts that really are
 * hours — "3 hours missed on Day 2" is half of the real ones — and the unit
 * beside the number is what keeps those from being rounded up to a day
 * somebody then has to sit.
 */
export function OpenMakeUpForm({
  enrollmentId,
  days,
  dayLength,
  defaultDayId,
  defaultMinutes,
  compact = false,
}: {
  enrollmentId: string;
  days: MakeUpDayOption[];
  /// How long a standard day runs on this course. Zero when the register kept
  /// no times, and then there is nothing to count days in but hours.
  dayLength: number;
  defaultDayId?: string;
  /// Minutes, like everything else below the form.
  defaultMinutes?: number;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(openMakeUp, idle);
  const [dayId, setDayId] = useState(defaultDayId ?? "");
  // Whole days where the shortfall is whole days, and hours otherwise — which
  // is the form arriving already saying the true thing about this coach.
  const startsInDays =
    dayLength > 0 && defaultMinutes !== undefined && defaultMinutes % dayLength === 0;
  const [unit, setUnit] = useState<"days" | "hours">(
    dayLength > 0 && (startsInDays || defaultMinutes === undefined) ? "days" : "hours",
  );
  const [amount, setAmount] = useState(
    defaultMinutes === undefined
      ? ""
      : fieldValue(defaultMinutes, startsInDays ? dayLength : 60),
  );
  const [note, setNote] = useState("");

  function pickDay(next: string) {
    setDayId(next);
    const day = days.find((d) => d.id === next);
    // Only fill an empty field: an educator who has already typed 3 hours
    // against Day 2 should not have it overwritten by the dropdown.
    if (!day || amount) return;
    if (unit === "days" && dayLength > 0) setAmount("1");
    else setAmount(fieldValue(day.minutes, 60));
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
        <span className="mb-1 block text-xs font-medium text-ink-600">To make up</span>
        <span className="flex items-center gap-1">
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={unit === "days" ? "1" : "3"}
            className="input w-16 px-2 py-1 text-xs"
          />
          <select
            name="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as "days" | "hours")}
            className="input w-auto px-2 py-1 text-xs"
          >
            {/* Days only where the course says how long one is. */}
            {dayLength > 0 && <option value="days">days</option>}
            <option value="hours">hours</option>
          </select>
        </span>
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
export function MakeUpCard({ row, dayLength }: { row: MakeUpRow; dayLength: number }) {
  const [state, formAction] = useActionState(settleMakeUp, idle);
  const [remove, removeAction] = useActionState(deleteMakeUp, idle);
  const [status, setStatus] = useState<MakeUpStatus>(row.status);
  const [note, setNote] = useState(row.arrangedNote ?? "");
  const [creditedNote, setCreditedNote] = useState(row.creditedNote ?? "");

  const meta = MAKE_UP_STATUS[row.status];
  const owed = makeUpAmount(row.minutesOwed, dayLength);
  const outstanding =
    row.status === "COMPLETED" || row.status === "WAIVED"
      ? 0
      : Math.max(0, row.minutesOwed - row.minutesCredited);

  // Part of a debt can be made up, but only a debt of more than one day can
  // have that progress said in days — and below a day there is nothing to
  // report but done or not, which the status already says. The field stays
  // wherever something has already been credited, so no record is stranded.
  const partial = row.minutesOwed > dayLength || row.minutesCredited > 0;
  const settled = status === "COMPLETED" || status === "WAIVED";
  const creditUnit = dayLength > 0 && row.minutesOwed > dayLength ? "days" : "hours";
  const [creditAmount, setCreditAmount] = useState(
    row.minutesCredited
      ? fieldValue(row.minutesCredited, creditUnit === "days" ? dayLength : 60)
      : "",
  );

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {row.coachName && <span className="font-medium text-ink-900">{row.coachName}</span>}
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-sm text-ink-700">
          <strong className="text-ink-900">{owed.label}</strong>
          {/* The hours, where a day is not what is owed. Without this a coach
              owing three hours reads as owing a day, and sits five he doesn't. */}
          {owed.note && <span className="text-ink-500"> {owed.note}</span>}
          {outstanding > 0 && outstanding !== row.minutesOwed && (
            <>
              {" · "}
              <strong className="text-maroon-700">
                {makeUpAmount(outstanding, dayLength).label} still to sit
              </strong>
            </>
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

        {partial && status !== "COMPLETED" && status !== "WAIVED" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">
              {creditUnit === "days" ? "Days sat" : "Hours sat"}
            </span>
            <input
              name="creditAmount"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="input w-20 px-2 py-1 text-xs"
            />
            <input type="hidden" name="creditUnit" value={creditUnit} />
          </label>
        )}

        {/* One note, and it is whichever question is live. Until the day is
            sat that is where it is being sat; afterwards it is how. Both are
            kept; only the one worth asking for is on screen. */}
        {settled ? (
          <label className="block min-w-48 flex-1">
            <span className="mb-1 block text-xs font-medium text-ink-600">How it was made up</span>
            <input
              name="creditedNote"
              value={creditedNote}
              onChange={(e) => setCreditedNote(e.target.value)}
              placeholder="Sat Day 3 at GCK, or written task"
              className="input w-full px-2 py-1 text-xs"
            />
            <input type="hidden" name="note" value={note} />
          </label>
        ) : (
          <label className="block min-w-48 flex-1">
            <span className="mb-1 block text-xs font-medium text-ink-600">
              Where it is being made up
            </span>
            <input
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="GCK Day 3, or Sunny Coast Day 3"
              className="input w-full px-2 py-1 text-xs"
            />
            <input type="hidden" name="creditedNote" value={creditedNote} />
          </label>
        )}

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
