"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { formatHours } from "@/lib/attendance";
import {
  addCourseDay,
  deleteCourseDay,
  updateCourseDay,
  type DayActionState,
} from "../../../actions/days";

const initialState: DayActionState = { status: "idle" };

export type DayRow = {
  id: string;
  dayNo: number;
  /** `yyyy-mm-dd`, which is what a date input wants. */
  date: string;
  weekday: string | null;
  startTime: string | null;
  endTime: string | null;
  minutes: number;
  /** Attendance marks, coaches' and staff's, recorded against this day. */
  marked: number;
  makeUps: number;
};

export function DayList({ courseId, days }: { courseId: string; days: DayRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">
          {days.length ? `${days.length} day${days.length === 1 ? "" : "s"}` : "No days yet"}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          A day is worth the hours it is scheduled for, and a day with no times is worth none —
          nothing here guesses at eight. Days are numbered by date, so adding one in the middle
          renumbers the rest.
        </p>
      </div>

      {days.length > 0 && (
        <ul className="divide-y divide-ink-200">
          {days.map((day) => (
            <li key={day.id} className="py-3">
              <DayForm day={day} />
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-ink-200 pt-5">
        <AddDayForm
          courseId={courseId}
          lastDate={days.at(-1)?.date ?? null}
          dayCount={days.length}
        />
      </div>
    </div>
  );
}

/** One day, editable in place. */
function DayForm({ day }: { day: DayRow }) {
  const [state, formAction] = useActionState(updateCourseDay, initialState);
  const [removeState, removeAction] = useActionState(deleteCourseDay, initialState);

  // Controlled, and re-seeded whenever the row the server sent changes: React
  // 19 clears an uncontrolled form once an action settles, which on a refused
  // save would blank the date somebody was correcting.
  const [date, setDate] = useState(day.date);
  const [startTime, setStartTime] = useState(day.startTime ?? "");
  const [endTime, setEndTime] = useState(day.endTime ?? "");

  useEffect(() => {
    setDate(day.date);
    setStartTime(day.startTime ?? "");
    setEndTime(day.endTime ?? "");
  }, [day.date, day.startTime, day.endTime]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-16">
          <p className="section-title">Day {day.dayNo}</p>
          <p className="text-xs text-ink-500">{day.weekday ?? ""}</p>
        </div>

        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="dayId" value={day.id} />
          <div>
            <label className="label" htmlFor={`date-${day.id}`}>
              Date
            </label>
            <input
              id={`date-${day.id}`}
              name="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>
          <div className="w-28">
            <label className="label" htmlFor={`start-${day.id}`}>
              Starts
            </label>
            <input
              id={`start-${day.id}`}
              name="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="input"
            />
          </div>
          <div className="w-28">
            <label className="label" htmlFor={`end-${day.id}`}>
              Ends
            </label>
            <input
              id={`end-${day.id}`}
              name="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input"
            />
          </div>
          <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </form>

        <div className="flex items-center gap-2">
          <Badge tone={day.minutes ? "muted" : "warn"}>
            {day.minutes ? formatHours(day.minutes) : "no times"}
          </Badge>
          {day.marked > 0 && <Badge tone="good">{day.marked} marked</Badge>}
        </div>

        <form action={removeAction} className="ml-auto">
          <input type="hidden" name="dayId" value={day.id} />
          <SubmitButton
            className="btn-secondary btn-sm"
            pendingLabel="…"
            confirm={`Remove Day ${day.dayNo}? The days after it are renumbered.`}
          >
            Remove
          </SubmitButton>
        </form>
      </div>

      <FormError message={state.status === "error" ? state.message : null} />
      <FormError message={removeState.status === "error" ? removeState.message : null} />
    </div>
  );
}

function AddDayForm({
  courseId,
  lastDate,
  dayCount,
}: {
  courseId: string;
  lastDate: string | null;
  dayCount: number;
}) {
  const [state, formAction] = useActionState(addCourseDay, initialState);

  // The day after the last one, which is the common case for a block. Only a
  // starting point: the date is a field, not a pattern, because FQ's blocks run
  // across weekends and nothing here should invent a schedule.
  const [date, setDate] = useState(lastDate ? nextDay(lastDate) : "");
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("16:30");

  // Re-seeded on the day count as well as the last date. Adding a day in the
  // middle of a block leaves the last date where it was, and without the count
  // the form would sit there still holding the date just added — offering to
  // add it again, which the action would then refuse.
  useEffect(() => {
    setDate(lastDate ? nextDay(lastDate) : "");
    setStartTime("08:30");
    setEndTime("16:30");
  }, [lastDate, dayCount]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />
      <p className="section-title">Add a day</p>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="new-day-date">
            Date
          </label>
          <input
            id="new-day-date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </div>
        <div className="w-28">
          <label className="label" htmlFor="new-day-start">
            Starts
          </label>
          <input
            id="new-day-start"
            name="startTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="input"
          />
        </div>
        <div className="w-28">
          <label className="label" htmlFor="new-day-end">
            Ends
          </label>
          <input
            id="new-day-end"
            name="endTime"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="input"
          />
        </div>
        <SubmitButton pendingLabel="Adding…">Add day</SubmitButton>
      </div>

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />
    </form>
  );
}

/** The next calendar day, in UTC, which is how these dates are stored. */
function nextDay(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) return "";
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
