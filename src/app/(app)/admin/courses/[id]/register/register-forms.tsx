"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { bandFor, RATING_SCALE, VERDICT_LABEL } from "@/lib/support-rubric";
import {
  saveAttendance,
  saveResults,
  saveStaffAttendance,
  type RegisterState,
} from "../../../actions/register";

const idle: RegisterState = { status: "idle" };

export type DayColumn = { id: string; dayNo: number; weekday: string | null; label: string };

export type RegisterRow = {
  id: string;
  name: string;
  subtitle: string | null;
  /// Day id -> present. A day the register has no mark for is absent from this.
  marks: Record<string, boolean>;
};

/* ---------------------------- Attendance grid ----------------------------- */

/**
 * The grid, saved in one go.
 *
 * Ticking a box only changes local state; nothing is written until Save. That
 * is how the spreadsheet this replaces behaves, and an educator running a
 * register on a touchline needs to be able to correct a mistake before it
 * counts.
 */
function AttendanceGrid({
  courseId,
  days,
  rows,
  action,
  emptyLabel,
}: {
  courseId: string;
  days: DayColumn[];
  rows: RegisterRow[];
  action: typeof saveAttendance;
  emptyLabel: string;
}) {
  const [state, formAction] = useActionState(action, idle);
  const [marks, setMarks] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const row of rows) {
      for (const day of days) initial[`${day.id}:${row.id}`] = row.marks[day.id] ?? false;
    }
    return initial;
  });

  if (rows.length === 0) {
    return <p className="card card-pad text-sm text-ink-500">{emptyLabel}</p>;
  }

  function toggleDay(dayId: string) {
    // A whole day at once: the common case is everybody turned up.
    const keys = rows.map((r) => `${dayId}:${r.id}`);
    const allOn = keys.every((k) => marks[k]);
    setMarks({ ...marks, ...Object.fromEntries(keys.map((k) => [k, !allOn])) });
  }

  const present = (dayId: string) => rows.filter((r) => marks[`${dayId}:${r.id}`]).length;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              <th className="sticky left-0 z-10 bg-ink-50 px-4 py-2 text-left font-semibold text-ink-700">
                Coach
              </th>
              {days.map((day) => (
                <th key={day.id} className="px-2 py-2 text-center font-semibold text-ink-700">
                  <button
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    title="Mark everybody present or absent for this day"
                    className="block w-full rounded px-1 py-0.5 hover:bg-ink-200"
                  >
                    <span className="block text-xs">Day {day.dayNo}</span>
                    <span className="block text-[10px] font-normal text-ink-500">{day.label}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-ink-50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap">
                  <span className="font-medium text-ink-900">{row.name}</span>
                  {row.subtitle && (
                    <span className="ml-2 text-xs text-ink-500">{row.subtitle}</span>
                  )}
                </td>
                {days.map((day) => {
                  const key = `${day.id}:${row.id}`;
                  return (
                    <td key={day.id} className="px-2 py-2 text-center">
                      <input type="hidden" name="cell" value={key} />
                      <input
                        type="checkbox"
                        name="present"
                        value={key}
                        checked={marks[key] ?? false}
                        onChange={(e) => setMarks({ ...marks, [key]: e.target.checked })}
                        aria-label={`${row.name} — day ${day.dayNo}`}
                        className="h-4 w-4 accent-maroon-600"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-ink-50 text-xs font-semibold text-ink-600">
              <td className="sticky left-0 z-10 bg-ink-50 px-4 py-2">Present</td>
              {days.map((day) => (
                <td key={day.id} className="px-2 py-2 text-center">
                  {present(day.id)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

export function CoachAttendanceGrid(props: {
  courseId: string;
  days: DayColumn[];
  rows: RegisterRow[];
}) {
  return (
    <AttendanceGrid
      {...props}
      action={saveAttendance}
      emptyLabel="Nobody on this part of the register."
    />
  );
}

export function StaffAttendanceGrid(props: {
  courseId: string;
  days: DayColumn[];
  rows: RegisterRow[];
}) {
  return (
    <AttendanceGrid
      {...props}
      action={saveStaffAttendance}
      emptyLabel="No course team recorded on this register."
    />
  );
}

/* ------------------------------- Results ---------------------------------- */

export type ResultRow = {
  id: string;
  name: string;
  subtitle: string | null;
  rating: number | null;
  outcome: string;
  attendanceMet: boolean | null;
  journalComplete: boolean | null;
  readiness: string | null;
  comments: string | null;
  deliveries: number;
};

const READINESS = ["Now", "1-3 Years", "3-5 Years", "Never"];

export function ResultsTable({
  courseId,
  rows,
  threshold,
}: {
  courseId: string;
  rows: ResultRow[];
  threshold: number;
}) {
  const [state, formAction] = useActionState(saveResults, idle);
  const [values, setValues] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.id, { ...r }])),
  );

  function set(id: string, patch: Partial<ResultRow>) {
    const next = { ...values[id], ...patch };
    // Keep the outcome honest as the rating moves: the action rejects a
    // mismatch, and having the form quietly produce one is a worse way to find
    // out than having it follow along.
    if (patch.rating !== undefined && next.outcome !== "WITHDRAWN") {
      next.outcome =
        patch.rating === null
          ? "IN_PROGRESS"
          : patch.rating >= threshold
            ? "PASSED"
            : "POST_COURSE_SUPPORT";
    }
    setValues({ ...values, [id]: next });
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs font-semibold text-ink-700">
              <th className="px-4 py-2">Coach</th>
              <th className="px-2 py-2 text-center">Att.</th>
              <th className="px-2 py-2 text-center">Journal</th>
              <th className="px-2 py-2">Rating</th>
              <th className="px-2 py-2">Outcome</th>
              <th className="px-2 py-2">Readiness</th>
              <th className="px-2 py-2">Comments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((row) => {
              const v = values[row.id];
              const band = bandFor(v.rating);
              // What the row currently says, in the same words the coach sees
              // on their own page.
              const verdict =
                v.outcome === "WITHDRAWN"
                  ? { label: "Withdrawn", tone: "muted" as const }
                  : v.outcome === "PASSED"
                    ? VERDICT_LABEL.passed
                    : v.outcome === "POST_COURSE_SUPPORT"
                      ? VERDICT_LABEL.needs_support
                      : VERDICT_LABEL.in_progress;
              return (
                <tr key={row.id} className="align-top hover:bg-ink-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="font-medium text-ink-900">{row.name}</span>
                    {row.subtitle && (
                      <span className="ml-2 text-xs text-ink-500">{row.subtitle}</span>
                    )}
                    {row.deliveries > 0 && (
                      <span className="ml-2 text-xs text-ink-400">
                        {row.deliveries} deliver{row.deliveries === 1 ? "y" : "ies"}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      name={`attended_${row.id}`}
                      checked={v.attendanceMet ?? false}
                      onChange={(e) => set(row.id, { attendanceMet: e.target.checked })}
                      aria-label={`${row.name} met attendance`}
                      className="h-4 w-4 accent-maroon-600"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      name={`journal_${row.id}`}
                      checked={v.journalComplete ?? false}
                      onChange={(e) => set(row.id, { journalComplete: e.target.checked })}
                      aria-label={`${row.name} journal complete`}
                      className="h-4 w-4 accent-maroon-600"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      name={`rating_${row.id}`}
                      value={v.rating ?? ""}
                      onChange={(e) =>
                        set(row.id, { rating: e.target.value ? Number(e.target.value) : null })
                      }
                      aria-label={`${row.name} rating`}
                      className="input px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {RATING_SCALE.map((value) => (
                        <option key={value} value={value}>
                          {value.toFixed(1)}
                        </option>
                      ))}
                    </select>
                    {band && <p className="mt-1 text-[10px] text-ink-500">{band.faRating}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <select
                      name={`outcome_${row.id}`}
                      value={v.outcome}
                      onChange={(e) => setValues({
                        ...values,
                        [row.id]: { ...v, outcome: e.target.value },
                      })}
                      aria-label={`${row.name} outcome`}
                      className="input px-2 py-1 text-xs"
                    >
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="PASSED">Pass on course</option>
                      <option value="POST_COURSE_SUPPORT">Post-course support</option>
                      <option value="WITHDRAWN">Withdrawn</option>
                    </select>
                    <p className="mt-1">
                      <Badge tone={verdict.tone}>{verdict.label}</Badge>
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      name={`readiness_${row.id}`}
                      value={v.readiness ?? ""}
                      onChange={(e) => set(row.id, { readiness: e.target.value || null })}
                      aria-label={`${row.name} readiness`}
                      className="input px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {READINESS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      name={`comments_${row.id}`}
                      value={v.comments ?? ""}
                      onChange={(e) => set(row.id, { comments: e.target.value })}
                      aria-label={`${row.name} comments`}
                      placeholder="—"
                      className="input min-w-48 px-2 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save results</SubmitButton>
        <p className="text-xs text-ink-500">
          Pass mark {threshold} — the rubric puts anything below it in post-course support.
        </p>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}
