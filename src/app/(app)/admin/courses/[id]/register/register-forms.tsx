"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { formatHours } from "@/lib/attendance";
import { bandFor, RATING_SCALE, VERDICT_LABEL } from "@/lib/support-rubric";
import {
  saveAttendance,
  saveResults,
  saveStaffAttendance,
  type RegisterState,
} from "../../../actions/register";

const idle: RegisterState = { status: "idle" };

export type DayColumn = {
  id: string;
  dayNo: number;
  weekday: string | null;
  label: string;
  /// How long the day is scheduled for. Zero when the register kept no times.
  minutes: number;
};

export type RegisterRow = {
  id: string;
  name: string;
  subtitle: string | null;
  /// Day id -> minutes attended. A day the register has no mark for is absent
  /// from this, which is not the same as a zero: nobody has taken it yet.
  marks: Record<string, number>;
  /// Hours credited from elsewhere, and hours still owed. Shown beside the row
  /// so the educator marking the grid can see that the gap is being handled.
  creditedMinutes: number;
  outstandingMinutes: number;
  /// Everything raised on the ledger, settled or not. What the row is short by
  /// beyond this is what nobody has looked at.
  raisedMinutes: number;
  /// Days this coach wasn't on the course for — they joined late, left early,
  /// or moved to another intake. Not absences, and not theirs to answer for.
  outsideDayIds: string[];
};

export type StaffRow = {
  id: string;
  name: string;
  subtitle: string | null;
  marks: Record<string, boolean>;
};

/* ---------------------------- Attendance grid ----------------------------- */

/**
 * The coaches' grid, saved in one go.
 *
 * Ticking a box only changes local state; nothing is written until Save. That
 * is how the spreadsheet this replaces behaves, and an educator running a
 * register on a touchline needs to be able to correct a mistake before it
 * counts.
 *
 * A tick is the whole day, because that is what nearly every cell is. The
 * exceptions — "Missed Day 2 PM", "1.5 hours Day 3" — are typed into the cell
 * itself: click the hours under a ticked box and it becomes a field. Those
 * exceptions are the reason the register holds minutes at all, so they belong
 * on the grid rather than in a comment nobody can total.
 */
export function CoachAttendanceGrid({
  courseId,
  days,
  rows,
}: {
  courseId: string;
  days: DayColumn[];
  rows: RegisterRow[];
}) {
  const [state, formAction] = useActionState(saveAttendance, idle);
  // Undefined is a day nobody has taken the roll for, which is not the same as
  // a day everybody missed. Only cells the register already has a mark for
  // start with a number.
  const [marks, setMarks] = useState<Record<string, number | undefined>>(() => {
    const initial: Record<string, number | undefined> = {};
    for (const row of rows) {
      for (const day of days) initial[`${day.id}:${row.id}`] = row.marks[day.id];
    }
    return initial;
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (rows.length === 0) {
    return (
      <p className="card card-pad text-sm text-ink-500">Nobody on this part of the register.</p>
    );
  }

  const dayById = new Map(days.map((d) => [d.id, d]));

  /**
   * Writes one cell, and with it takes the roll for that whole day.
   *
   * Marking one coach on a day nobody has been marked on yet says the day was
   * run, and a day that was run has an answer for everybody on the roster. The
   * alternative — one coach marked and the rest left blank — reads as a course
   * that ran for a single person.
   */
  function set(key: string, minutes: number) {
    const dayId = key.split(":")[0];
    setMarks((current) => {
      const next = { ...current, [key]: minutes };
      for (const row of rows) {
        const k = `${dayId}:${row.id}`;
        if (next[k] === undefined) next[k] = 0;
      }
      return next;
    });
  }

  function toggleDay(day: DayColumn) {
    // A whole day at once: the common case is everybody turned up.
    const keys = rows.map((r) => `${day.id}:${r.id}`);
    const allOn = keys.every((k) => (marks[k] ?? 0) > 0);
    setMarks({
      ...marks,
      ...Object.fromEntries(keys.map((k) => [k, allOn ? 0 : day.minutes])),
    });
  }

  function commitDraft(key: string) {
    const day = dayById.get(key.split(":")[0]);
    const hours = Number(draft);
    setEditing(null);
    if (draft.trim() === "" || !Number.isFinite(hours) || hours < 0) return;
    const minutes = Math.round(hours * 60);
    // Clamped rather than rejected: an educator typing 9 into an eight-hour day
    // means "all of it", and a validation error mid-grid loses the rest of the
    // marks they have not saved yet.
    set(key, day && day.minutes > 0 ? Math.min(minutes, day.minutes) : minutes);
  }

  const outside = new Map(rows.map((r) => [r.id, new Set(r.outsideDayIds)]));
  const isOutside = (dayId: string, rowId: string) => outside.get(rowId)?.has(dayId) ?? false;

  const attended = (dayId: string) =>
    rows.filter((r) => !isOutside(dayId, r.id) && (marks[`${dayId}:${r.id}`] ?? 0) > 0).length;
  const rowMinutes = (rowId: string) =>
    days.reduce(
      (sum, d) => sum + (isOutside(d.id, rowId) ? 0 : (marks[`${d.id}:${rowId}`] ?? 0)),
      0,
    );
  /**
   * Only days the register has actually taken count towards the denominator.
   *
   * A course in its first block has six days ahead of it, and measuring anybody
   * against days nobody has run would put the whole roster forty-eight hours
   * short of a standard they have not been held to yet.
   */
  const taken = new Set(
    days.filter((d) => rows.some((r) => marks[`${d.id}:${r.id}`] !== undefined)).map((d) => d.id),
  );
  /** The denominator for one coach: taken days, less the ones they missed the
   *  course for entirely. */
  const requiredFor = (rowId: string) =>
    days
      .filter((d) => taken.has(d.id) && !isOutside(d.id, rowId))
      .reduce((sum, d) => sum + d.minutes, 0);
  const requiredMinutes = days
    .filter((d) => taken.has(d.id))
    .reduce((sum, d) => sum + d.minutes, 0);

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
                    onClick={() => toggleDay(day)}
                    title="Mark everybody present or absent for this day"
                    className="block w-full rounded px-1 py-0.5 hover:bg-ink-200"
                  >
                    <span className="block text-xs">Day {day.dayNo}</span>
                    <span className="block text-[10px] font-normal text-ink-500">{day.label}</span>
                    <span className="block text-[10px] font-normal text-ink-400">
                      {day.minutes ? formatHours(day.minutes) : "no times"}
                    </span>
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold text-ink-700">
                <span className="block text-xs">Hours</span>
                <span className="block text-[10px] font-normal text-ink-500">
                  of {formatHours(requiredMinutes)}
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((row) => {
              const sat = rowMinutes(row.id);
              const short = Math.max(0, requiredFor(row.id) - sat);
              const unaccounted = Math.max(0, short - row.raisedMinutes);
              return (
                <tr key={row.id} className="hover:bg-ink-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap">
                    <span className="font-medium text-ink-900">{row.name}</span>
                    {row.subtitle && (
                      <span className="ml-2 text-xs text-ink-500">{row.subtitle}</span>
                    )}
                  </td>
                  {days.map((day) => {
                    const key = `${day.id}:${row.id}`;
                    const marked = marks[key];
                    const minutes = marked ?? 0;
                    const full = day.minutes > 0 && minutes >= day.minutes;
                    const notTheirs = isOutside(day.id, row.id);

                    // A day the coach wasn't on the course for is shown as a
                    // dash, not an empty box. An empty box on a register means
                    // "didn't turn up", and that is the wrong thing to say
                    // about somebody who had already moved to another intake.
                    if (notTheirs) {
                      return (
                        <td
                          key={day.id}
                          title="Not on the course for this day"
                          className="px-2 py-2 text-center align-middle text-ink-300"
                        >
                          —
                        </td>
                      );
                    }

                    return (
                      <td key={day.id} className="group px-2 py-2 text-center align-middle">
                        {/* A day nobody has been marked on posts nothing, so it
                            stays unrecorded rather than becoming an absence for
                            the whole roster the first time anyone hits Save. */}
                        {taken.has(day.id) && (
                          <input type="hidden" name="cell" value={`${key}|${minutes}`} />
                        )}
                        {editing === key ? (
                          <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commitDraft(key)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitDraft(key);
                              }
                              if (e.key === "Escape") setEditing(null);
                            }}
                            inputMode="decimal"
                            aria-label={`${row.name} — day ${day.dayNo}, hours attended`}
                            className="input w-16 px-1 py-0.5 text-center text-xs"
                          />
                        ) : (
                          <>
                            <input
                              type="checkbox"
                              checked={minutes > 0}
                              onChange={(e) => set(key, e.target.checked ? day.minutes : 0)}
                              aria-label={`${row.name} — day ${day.dayNo}`}
                              title={marked === undefined ? "Not taken yet" : undefined}
                              className={`h-4 w-4 accent-maroon-600 ${
                                marked === undefined ? "opacity-40" : ""
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setDraft(minutes ? String(minutes / 60) : "");
                                setEditing(key);
                              }}
                              title="Record part of a day"
                              // Only a part day is worth a label of its own.
                              // Nine columns by twenty-five rows of the word
                              // "part" would bury the two cells that differ, so
                              // on a whole day it appears on hover.
                              className={`mt-0.5 block w-full text-[10px] ${
                                minutes > 0 && !full
                                  ? "font-semibold text-maroon-700"
                                  : "text-ink-400 opacity-0 group-hover:opacity-100 focus:opacity-100"
                              }`}
                            >
                              {minutes > 0 && !full ? formatHours(minutes) : "part"}
                            </button>
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={short > 0 ? "font-semibold text-maroon-700" : "text-ink-700"}>
                      {formatHours(sat)}
                    </span>
                    {requiredFor(row.id) !== requiredMinutes && (
                      <span className="block text-[10px] text-ink-400">
                        of {formatHours(requiredFor(row.id))}
                      </span>
                    )}
                    {row.creditedMinutes > 0 && (
                      <span className="block text-[10px] text-ink-500">
                        +{formatHours(row.creditedMinutes)} made up
                      </span>
                    )}
                    {row.outstandingMinutes > 0 && (
                      <span className="block text-[10px] text-ink-500">
                        {formatHours(row.outstandingMinutes)} owed
                      </span>
                    )}
                    {unaccounted > 0 && (
                      <span className="block text-[10px] font-semibold text-maroon-700">
                        {formatHours(unaccounted)} unaccounted
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-ink-50 text-xs font-semibold text-ink-600">
              <td className="sticky left-0 z-10 bg-ink-50 px-4 py-2">Attended</td>
              {days.map((day) => (
                <td key={day.id} className="px-2 py-2 text-center">
                  {attended(day.id)}
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                {formatHours(rows.reduce((sum, r) => sum + rowMinutes(r.id), 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
        <p className="text-xs text-ink-500">
          A tick is the whole day. For part of one, click <em>part</em> and type the hours sat.
        </p>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

/**
 * The course team's row of the register.
 *
 * Deliberately still a yes/no. An educator's hours are not measured against a
 * requirement, and nobody makes up a morning of somebody else's course.
 */
export function StaffAttendanceGrid({
  courseId,
  days,
  rows,
}: {
  courseId: string;
  days: DayColumn[];
  rows: StaffRow[];
}) {
  const [state, formAction] = useActionState(saveStaffAttendance, idle);
  const [marks, setMarks] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const row of rows) {
      for (const day of days) initial[`${day.id}:${row.id}`] = row.marks[day.id] ?? false;
    }
    return initial;
  });

  if (rows.length === 0) {
    return (
      <p className="card card-pad text-sm text-ink-500">
        No course team recorded on this register.
      </p>
    );
  }

  function toggleDay(dayId: string) {
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
                Name
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
        <SubmitButton pendingLabel="Saving…">Save staff attendance</SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

/* ------------------------------- Results ---------------------------------- */

export type ResultRow = {
  id: string;
  name: string;
  subtitle: string | null;
  /// Hours to their name, and the hours the course has run so far.
  hours: string;
  hoursOf: string;
  /// Open on the ledger, and missing with nothing on the ledger at all.
  outstanding: number;
  unaccounted: number;
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
              <th className="px-2 py-2">Hours</th>
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
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="text-ink-700">
                      {row.hours} <span className="text-ink-400">of {row.hoursOf}</span>
                    </span>
                    {row.outstanding > 0 && (
                      <span className="mt-0.5 block text-[10px] text-ink-500">
                        {formatHours(row.outstanding)} owed
                      </span>
                    )}
                    {row.unaccounted > 0 && (
                      <span className="mt-0.5 block text-[10px] font-semibold text-maroon-700">
                        {formatHours(row.unaccounted)} unaccounted
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
