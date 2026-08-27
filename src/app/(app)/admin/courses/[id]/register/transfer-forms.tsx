"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import {
  setEnrolmentWindow,
  transferEnrolment,
  undoTransfer,
  type TransferState,
} from "../../../actions/transfers";

const idle: TransferState = { status: "idle" };

export type DayOption = { id: string; dayNo: number; date: string; label: string };
export type CourseOption = { id: string; title: string; days: DayOption[] };

export type MoveRow = {
  enrollmentId: string;
  name: string;
  subtitle: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  /** Where they went, when the move has been recorded. */
  transferredTo: { courseId: string; courseTitle: string; note: string | null } | null;
  /** Where they came from, when this is the far end of somebody else's move. */
  transferredFrom: { courseId: string; courseTitle: string } | null;
  /** Days the register has marked them on that fall outside their window. */
  daysOutsideWindow: number;
};

function DaySelect({
  name,
  days,
  value,
  onChange,
  blankLabel,
  label,
}: {
  name: string;
  days: DayOption[];
  value: string;
  onChange: (next: string) => void;
  blankLabel: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input px-2 py-1 text-xs"
      >
        <option value="">{blankLabel}</option>
        {days.map((d) => (
          <option key={d.id} value={d.date}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Records a coach moving to another course.
 *
 * Both ends are picked as course days rather than typed as dates. The educator
 * knows the move as "he did Block 1 with us and started again at Sunny Coast",
 * not as a pair of ISO dates, and a day picker can't produce the 2025 that a
 * date field accepts without complaint.
 */
export function MoveForm({
  rows,
  days,
  otherCourses,
}: {
  rows: MoveRow[];
  days: DayOption[];
  otherCourses: CourseOption[];
}) {
  const [state, formAction] = useActionState(transferEnrolment, idle);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [toCourseId, setToCourseId] = useState("");
  const [leftAt, setLeftAt] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [note, setNote] = useState("");

  const movable = rows.filter((r) => !r.transferredTo);
  const destination = otherCourses.find((c) => c.id === toCourseId);

  if (movable.length === 0) {
    return <p className="text-sm text-ink-500">Everybody on this register has been accounted for.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Coach</span>
        <select
          name="enrollmentId"
          value={enrollmentId}
          onChange={(e) => setEnrollmentId(e.target.value)}
          className="input min-w-48 px-2 py-1 text-xs"
        >
          <option value="">Pick a coach</option>
          {movable.map((r) => (
            <option key={r.enrollmentId} value={r.enrollmentId}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Moved to</span>
        <select
          name="toCourseId"
          value={toCourseId}
          onChange={(e) => {
            setToCourseId(e.target.value);
            setJoinedAt("");
          }}
          className="input min-w-48 px-2 py-1 text-xs"
        >
          <option value="">Pick a course</option>
          {otherCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>

      <DaySelect
        name="leftAt"
        label="Last day here"
        blankLabel="Pick a day"
        days={days}
        value={leftAt}
        onChange={setLeftAt}
      />

      <DaySelect
        name="joinedAt"
        label="First day there"
        blankLabel={destination ? "From its first day" : "Pick the course first"}
        days={destination?.days ?? []}
        value={joinedAt}
        onChange={setJoinedAt}
      />

      <label className="block min-w-56 flex-1">
        <span className="mb-1 block text-xs font-medium text-ink-600">
          Why <span className="font-normal text-ink-400">(optional)</span>
        </span>
        <input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Work moved him to the coast"
          className="input w-full px-2 py-1 text-xs"
        />
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Recording…">
          Record the move
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

/**
 * Sets a window for somebody who isn't in the panel yet.
 *
 * The commonest of these has no move to record at all: a coach listed on the
 * register from Day 1 who actually joined at Block 2, with Block 1 sat
 * somewhere else or still to do. Without this they can only be given a window
 * by first pretending they transferred, which would be a lie in the record.
 */
export function PartIntakeForm({ rows, days }: { rows: MoveRow[]; days: DayOption[] }) {
  const [state, formAction] = useActionState(setEnrolmentWindow, idle);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [leftAt, setLeftAt] = useState("");

  const available = rows.filter((r) => !r.transferredTo);
  if (available.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Coach</span>
        <select
          name="enrollmentId"
          value={enrollmentId}
          onChange={(e) => {
            const row = available.find((r) => r.enrollmentId === e.target.value);
            setEnrollmentId(e.target.value);
            // Show what is already set rather than silently clearing it.
            setJoinedAt(row?.joinedAt ?? "");
            setLeftAt(row?.leftAt ?? "");
          }}
          className="input min-w-48 px-2 py-1 text-xs"
        >
          <option value="">Pick a coach</option>
          {available.map((r) => (
            <option key={r.enrollmentId} value={r.enrollmentId}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <DaySelect
        name="joinedAt"
        label="First day here"
        blankLabel="From the start"
        days={days}
        value={joinedAt}
        onChange={setJoinedAt}
      />
      <DaySelect
        name="leftAt"
        label="Last day here"
        blankLabel="To the end"
        days={days}
        value={leftAt}
        onChange={setLeftAt}
      />

      <div className="flex items-center gap-3">
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
          Save the window
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

/** Sets the days a coach was actually on this course, with no move involved. */
export function WindowForm({ row, days }: { row: MoveRow; days: DayOption[] }) {
  const [state, formAction] = useActionState(setEnrolmentWindow, idle);
  const [joinedAt, setJoinedAt] = useState(row.joinedAt ?? "");
  const [leftAt, setLeftAt] = useState(row.leftAt ?? "");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
      <DaySelect
        name="joinedAt"
        label="First day here"
        blankLabel="From the start"
        days={days}
        value={joinedAt}
        onChange={setJoinedAt}
      />
      <DaySelect
        name="leftAt"
        label="Last day here"
        blankLabel="To the end"
        days={days}
        value={leftAt}
        onChange={setLeftAt}
      />
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
        Save window
      </SubmitButton>
      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />
    </form>
  );
}

/** One coach whose time on this course wasn't the whole of it. */
export function MoveCard({ row, days }: { row: MoveRow; days: DayOption[] }) {
  const [state, formAction] = useActionState(undoTransfer, idle);
  const dayLabel = (date: string | null) =>
    days.find((d) => d.date === date)?.label ?? date ?? null;

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-ink-900">{row.name}</span>
        {row.transferredTo ? (
          <Badge tone="ok">Transferred</Badge>
        ) : (
          <Badge tone="muted">Part intake</Badge>
        )}
        {row.subtitle && <span className="text-xs text-ink-500">{row.subtitle}</span>}
      </div>

      <p className="mb-3 text-sm text-ink-700">
        {row.joinedAt || row.leftAt ? (
          <>
            On this course {row.joinedAt ? `from ${dayLabel(row.joinedAt)}` : "from the start"}{" "}
            {row.leftAt ? `to ${dayLabel(row.leftAt)}` : "to the end"}.
          </>
        ) : (
          "On this course throughout."
        )}
        {row.transferredTo && (
          <>
            {" "}
            Moved to{" "}
            <Link
              href={`/admin/courses/${row.transferredTo.courseId}/register`}
              className="font-medium text-maroon-700 hover:underline"
            >
              {row.transferredTo.courseTitle}
            </Link>
            {row.transferredTo.note && ` — ${row.transferredTo.note}`}.
          </>
        )}
        {row.transferredFrom && (
          <>
            {" "}
            Came from{" "}
            <Link
              href={`/admin/courses/${row.transferredFrom.courseId}/register`}
              className="font-medium text-maroon-700 hover:underline"
            >
              {row.transferredFrom.courseTitle}
            </Link>
            .
          </>
        )}
      </p>

      {row.daysOutsideWindow > 0 && (
        <p className="mb-3 text-xs text-ink-500">
          The register has {row.daysOutsideWindow} mark
          {row.daysOutsideWindow === 1 ? "" : "s"} against them outside that window. Those days no
          longer count either way — kept rather than deleted, because the register is the record of
          what was written down on the day.
        </p>
      )}

      {row.transferredTo ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
          <SubmitButton
            className="text-xs text-ink-500 underline hover:text-maroon-700"
            confirm="Undo this transfer? The other enrolment stays where it is."
            pendingLabel="Undoing…"
          >
            Undo the move
          </SubmitButton>
          <FormError message={state.status === "error" ? state.message : null} />
          <FormSuccess message={state.status === "ok" ? state.message : null} />
        </form>
      ) : (
        <WindowForm row={row} days={days} />
      )}
    </div>
  );
}
