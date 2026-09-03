"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { formatHours } from "@/lib/attendance";
import { bandFor, RATING_SCALE, VERDICT_LABEL } from "@/lib/support-rubric";
import { deleteDelivery, saveDelivery, type DeliveryState } from "../../../actions/deliveries";
import {
  saveAttendance,
  saveCoachResult,
  type RegisterState,
} from "../../../actions/register";

const idleRegister: RegisterState = { status: "idle" };
const idleDelivery: DeliveryState = { status: "idle" };

export type AssessDay = {
  id: string;
  dayNo: number;
  /// "Tuesday, 4 March" — the day as a person on the grass would say it.
  label: string;
  /// How long the day is scheduled for. Zero when the register kept no times.
  minutes: number;
};

export type AttendanceRow = {
  id: string;
  name: string;
  email: string;
  photoId: string | null;
  subtitle: string | null;
  /// Day id -> minutes attended. A day with no entry is unmarked, which is not
  /// the same as absent: nobody has taken the roll for it yet.
  marks: Record<string, number>;
  /// Days this coach wasn't on the course for. Not absences, and not theirs to
  /// answer for.
  outsideDayIds: string[];
};

/* ----------------------------- One day's roll ----------------------------- */

/**
 * The roll for a single day, as a list of names with a box beside each.
 *
 * The register's own grid — nine days across, twenty-five coaches down — is the
 * right shape for reading a course back at the end of it, and the wrong shape
 * for the thing an assessor actually does, which is stand in front of one
 * morning's group and mark who is in it. So this page takes the roll a day at a
 * time, on a row big enough to hit with a thumb.
 *
 * Nothing is written until Save, and Save posts every day the register has
 * marks for — so switching days to correct yesterday doesn't quietly lose it.
 */
export function DayAttendance({
  courseId,
  days,
  rows,
  defaultDayId,
}: {
  courseId: string;
  days: AssessDay[];
  rows: AttendanceRow[];
  defaultDayId: string;
}) {
  const [state, formAction] = useActionState(saveAttendance, idleRegister);
  const [dayId, setDayId] = useState(defaultDayId);
  const [marks, setMarks] = useState<Record<string, number | undefined>>(() => {
    const initial: Record<string, number | undefined> = {};
    for (const row of rows) {
      for (const day of days) initial[`${day.id}:${row.id}`] = row.marks[day.id];
    }
    return initial;
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // The day the page opens on is rarely the first one, and on a phone the strip
  // of days is wider than the screen. Bring the open day into view once, on
  // arrival — never afterwards, so it can't fight a thumb.
  const strip = useRef<HTMLDivElement>(null);
  const openDay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (strip.current && openDay.current) {
      strip.current.scrollLeft = Math.max(0, openDay.current.offsetLeft - 8);
    }
  }, []);

  const day = days.find((d) => d.id === dayId) ?? days[0];
  const outside = new Map(rows.map((r) => [r.id, new Set(r.outsideDayIds)]));
  const here = rows.filter((r) => !outside.get(r.id)?.has(day.id));

  /**
   * Marks one coach, and with them opens the roll for the whole day.
   *
   * Marking one name on a day nobody has been marked on says the day was run,
   * and a day that was run has an answer for everybody on it. The alternative —
   * one coach marked, the rest blank — reads as a course that ran for one
   * person.
   */
  function set(rowId: string, minutes: number) {
    setMarks((current) => {
      const next = { ...current, [`${day.id}:${rowId}`]: minutes };
      for (const row of here) {
        const key = `${day.id}:${row.id}`;
        if (next[key] === undefined) next[key] = 0;
      }
      return next;
    });
  }

  function markEveryone(minutes: number) {
    setMarks({
      ...marks,
      ...Object.fromEntries(here.map((r) => [`${day.id}:${r.id}`, minutes])),
    });
  }

  function commitDraft(rowId: string) {
    const hours = Number(draft);
    setEditing(null);
    if (draft.trim() === "" || !Number.isFinite(hours) || hours < 0) return;
    const minutes = Math.round(hours * 60);
    // Clamped rather than rejected: typing 9 into an eight-hour day means "all
    // of it", and an error mid-roll is a worse answer than the obvious one.
    set(rowId, day.minutes > 0 ? Math.min(minutes, day.minutes) : minutes);
  }

  // Every day somebody has a mark on posts with the form, so an edit made on
  // one day and saved from another still lands. A day nobody has touched posts
  // nothing, and stays unmarked rather than becoming an absence for everybody.
  const taken = days.filter((d) => rows.some((r) => marks[`${d.id}:${r.id}`] !== undefined));
  const present = here.filter((r) => (marks[`${day.id}:${r.id}`] ?? 0) > 0).length;
  const unmarked = here.every((r) => marks[`${day.id}:${r.id}`] === undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />
      {taken.map((d) =>
        rows
          .filter((r) => !outside.get(r.id)?.has(d.id))
          .map((r) => (
            <input
              key={`${d.id}:${r.id}`}
              type="hidden"
              name="cell"
              value={`${d.id}:${r.id}|${marks[`${d.id}:${r.id}`] ?? 0}`}
            />
          )),
      )}

      <div className="card overflow-hidden">
        <div
          ref={strip}
          className="flex gap-1 overflow-x-auto border-b border-ink-200 bg-ink-50 p-2"
        >
          {days.map((d) => {
            const done = rows.some((r) => marks[`${d.id}:${r.id}`] !== undefined);
            return (
              <button
                key={d.id}
                ref={d.id === defaultDayId ? openDay : undefined}
                type="button"
                onClick={() => setDayId(d.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-left text-xs ${
                  d.id === day.id
                    ? "bg-maroon-600 text-white"
                    : "text-ink-600 hover:bg-ink-200"
                }`}
              >
                <span className="block font-semibold">Day {d.dayNo}</span>
                <span
                  className={`block ${d.id === day.id ? "text-white/80" : "text-ink-500"}`}
                >
                  {d.label}
                </span>
                <span
                  className={`block ${d.id === day.id ? "text-white/70" : "text-ink-400"}`}
                >
                  {done ? "marked" : "not taken"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-ink-600">
            <span className="font-semibold text-ink-900">Day {day.dayNo}</span> · {day.label}
            {day.minutes > 0 && ` · ${formatHours(day.minutes)}`}
            {unmarked ? (
              <span className="ml-2 text-xs text-ink-400">not taken yet</span>
            ) : (
              <span className="ml-2 text-xs text-ink-500">
                {present} of {here.length} present
              </span>
            )}
          </p>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => markEveryone(day.minutes)}
              className="btn-secondary btn-sm"
            >
              Everyone present
            </button>
            <button
              type="button"
              onClick={() => markEveryone(0)}
              className="btn-secondary btn-sm"
            >
              Clear
            </button>
          </span>
        </div>

        <ul className="divide-y divide-ink-200 border-t border-ink-200">
          {rows.map((row) => {
            const key = `${day.id}:${row.id}`;
            const notTheirs = outside.get(row.id)?.has(day.id) ?? false;
            const marked = marks[key];
            const minutes = marked ?? 0;
            const full = day.minutes > 0 && minutes >= day.minutes;

            return (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                {/* A coach who wasn't on the course this day gets a dash, not
                    an empty box: an empty box says "didn't turn up", which is
                    the wrong thing to say about somebody who had already moved
                    to another intake. */}
                {notTheirs ? (
                  <span
                    title="Not on the course for this day"
                    className="flex h-5 w-5 items-center justify-center text-ink-300"
                  >
                    —
                  </span>
                ) : (
                  <input
                    id={`att-${key}`}
                    type="checkbox"
                    checked={minutes > 0}
                    onChange={(e) => set(row.id, e.target.checked ? day.minutes : 0)}
                    title={marked === undefined ? "Not taken yet" : undefined}
                    className={`h-5 w-5 accent-maroon-600 ${marked === undefined ? "opacity-40" : ""}`}
                  />
                )}

                <Avatar user={row} size="sm" />

                <label
                  htmlFor={notTheirs ? undefined : `att-${key}`}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <span className="block truncate text-sm font-medium text-ink-900">
                    {row.name}
                  </span>
                  {row.subtitle && (
                    <span className="block truncate text-xs text-ink-500">{row.subtitle}</span>
                  )}
                </label>

                {!notTheirs &&
                  (editing === key ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitDraft(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitDraft(row.id);
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      inputMode="decimal"
                      aria-label={`${row.name} — hours attended on day ${day.dayNo}`}
                      className="input w-20 px-2 py-1 text-center text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(minutes ? String(minutes / 60) : "");
                        setEditing(key);
                      }}
                      title="Record part of a day"
                      className={`shrink-0 text-xs ${
                        minutes > 0 && !full
                          ? "font-semibold text-maroon-700"
                          : "text-ink-400 hover:text-maroon-700"
                      }`}
                    >
                      {minutes > 0 && !full ? formatHours(minutes) : "part day"}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
        <p className="text-xs text-ink-500">
          A tick is the whole day. For part of one, tap <em>part day</em> and type the hours sat.
        </p>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

/* ---------------------------- One coach's record --------------------------- */

export type DeliveryEntry = {
  id: string;
  deliveryNo: number;
  assessor: string | null;
  block: string | null;
  component: string | null;
  topic: string | null;
  comment: string | null;
  /// The action plan as its numbered steps, with the numbering stripped.
  actions: string[];
  rating: number | null;
};

export type CoachEntry = {
  id: string;
  name: string;
  email: string;
  photoId: string | null;
  subtitle: string | null;
  catchUp: boolean;
  /// Hours sat, and the hours the course has run for them so far.
  hours: string;
  hoursOf: string;
  /// The course rating, settled at the end of the course. Null until then.
  rating: number | null;
  outcome: string;
  comments: string | null;
  deliveries: DeliveryEntry[];
};

const BLOCKS = ["Block 1", "Block 2", "Block 3"];
const COMPONENTS = ["Play", "Practice"];

/**
 * Everything an assessor writes about one coach, behind one name.
 *
 * Closed by default. A course is twenty-five of these, and an assessor comes to
 * the page for the one they just watched.
 */
export function CoachPanel({
  coach,
  assessors,
  defaultAssessor,
  threshold,
}: {
  coach: CoachEntry;
  assessors: string[];
  defaultAssessor: string;
  threshold: number;
}) {
  // The course rating if there is one, and the last session mark until there
  // is. One badge either way: two ratings on one line, a whole course apart in
  // what they mean, is a line nobody can read at a glance.
  const latest = coach.deliveries.filter((d) => d.rating !== null).at(-1);
  const rating = coach.rating ?? latest?.rating ?? null;
  const band = bandFor(rating);

  return (
    <details className="group">
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 hover:bg-ink-50">
        <Avatar user={coach} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-900">
            {coach.name}
            {coach.catchUp && <span className="ml-2 text-xs font-normal text-ink-500">catch-up</span>}
          </span>
          <span className="block truncate text-xs text-ink-500">
            {coach.subtitle ? `${coach.subtitle} · ` : ""}
            {/* A catch-up has no requirement of its own, and neither has a
                course nobody has taken the roll on yet: "16 h of 0" is not a
                shortfall, it is a denominator that doesn't exist. */}
            {coach.hoursOf === "0" ? `${coach.hours} sat` : `${coach.hours} of ${coach.hoursOf}`}
            {coach.comments ? " · commented on" : ""}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {rating !== null && (
            <Badge tone={band?.tone ?? "muted"}>
              {rating.toFixed(1)}
              {coach.rating === null && <span className="font-normal"> · session</span>}
            </Badge>
          )}
          <Badge tone={coach.deliveries.length ? "ok" : "muted"}>
            {coach.deliveries.length} deliver{coach.deliveries.length === 1 ? "y" : "ies"}
          </Badge>
          <span className="text-xs text-ink-400 group-open:hidden">Open</span>
        </span>
      </summary>

      <div className="space-y-4 border-t border-ink-200 bg-ink-50 px-5 py-4">
        {coach.deliveries.map((delivery) => (
          <DeliveryCard
            key={delivery.id}
            coach={coach}
            delivery={delivery}
            assessors={assessors}
            defaultAssessor={defaultAssessor}
          />
        ))}

        <div className="card card-pad">
          <p className="mb-3 text-sm font-semibold text-ink-900">
            {coach.deliveries.length ? "Another delivery" : "Write up a delivery"}
          </p>
          <DeliveryForm
            coach={coach}
            assessors={assessors}
            defaultAssessor={defaultAssessor}
          />
        </div>

        <CoachResultForm coach={coach} threshold={threshold} />
      </div>
    </details>
  );
}

/** A write-up already on the record, with the form to correct it. */
function DeliveryCard({
  coach,
  delivery,
  assessors,
  defaultAssessor,
}: {
  coach: CoachEntry;
  delivery: DeliveryEntry;
  assessors: string[];
  defaultAssessor: string;
}) {
  const [state, formAction] = useActionState(deleteDelivery, idleDelivery);
  const band = bandFor(delivery.rating);

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">
            Delivery {delivery.deliveryNo}
            {delivery.topic ? ` — ${delivery.topic}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {[delivery.block, delivery.component, delivery.assessor && `by ${delivery.assessor}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {delivery.rating !== null && (
          <Badge tone={band?.tone ?? "muted"}>
            {delivery.rating.toFixed(1)} · {band?.faRating}
          </Badge>
        )}
      </div>

      {delivery.comment && (
        <p className="prose-note mt-3 rounded-lg bg-ink-50 px-3 py-2">{delivery.comment}</p>
      )}
      {delivery.actions.length > 0 && (
        <>
          <p className="section-title mt-3 mb-1">Action plan</p>
          <ol className="list-inside list-decimal space-y-0.5 text-sm text-ink-700">
            {delivery.actions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-maroon-700">Edit</summary>
        <div className="mt-3 border-t border-ink-200 pt-3">
          <DeliveryForm
            coach={coach}
            delivery={delivery}
            assessors={assessors}
            defaultAssessor={defaultAssessor}
          />
        </div>
      </details>

      <form action={formAction} className="mt-3 flex items-center gap-3">
        <input type="hidden" name="deliveryId" value={delivery.id} />
        <SubmitButton
          className="btn-danger btn-sm"
          pendingLabel="Removing…"
          confirm={`Remove delivery ${delivery.deliveryNo} for ${coach.name}?`}
        >
          Remove
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
      </form>
    </div>
  );
}

/**
 * The delivery form, in the order the register writes it: who watched, when,
 * which half of the session, what it was about, what happened, and what the
 * coach does next.
 */
function DeliveryForm({
  coach,
  delivery,
  assessors,
  defaultAssessor,
}: {
  coach: CoachEntry;
  delivery?: DeliveryEntry;
  assessors: string[];
  defaultAssessor: string;
}) {
  const [state, formAction] = useActionState(saveDelivery, idleDelivery);
  const [rating, setRating] = useState<string>(delivery?.rating?.toString() ?? "");
  const form = useRef<HTMLFormElement>(null);

  // A new write-up clears itself once it is saved. The page re-renders with the
  // delivery on the record above, and leaving the same words in the form below
  // invites the same session being written up twice.
  useEffect(() => {
    if (state.status === "ok" && !delivery) {
      form.current?.reset();
      setRating("");
    }
  }, [state, delivery]);

  const band = bandFor(rating ? Number(rating) : null);
  const componentOptions =
    delivery?.component && !COMPONENTS.includes(delivery.component)
      ? [...COMPONENTS, delivery.component]
      : COMPONENTS;

  return (
    <form ref={form} action={formAction} className="space-y-3">
      <input type="hidden" name="enrollmentId" value={coach.id} />
      {delivery && <input type="hidden" name="deliveryId" value={delivery.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Assessor</span>
          <input
            name="assessor"
            defaultValue={delivery?.assessor ?? defaultAssessor}
            list={`assessors-${coach.id}`}
            className="input"
          />
          <datalist id={`assessors-${coach.id}`}>
            {assessors.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="label">When</span>
          <input
            name="block"
            defaultValue={delivery?.block ?? ""}
            list={`blocks-${coach.id}`}
            placeholder="Block 2"
            className="input"
          />
          <datalist id={`blocks-${coach.id}`}>
            {BLOCKS.map((block) => (
              <option key={block} value={block} />
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="label">Component</span>
          <select name="component" defaultValue={delivery?.component ?? ""} className="input">
            <option value="">—</option>
            {componentOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Topic</span>
          <input
            name="topic"
            defaultValue={delivery?.topic ?? ""}
            placeholder="Staying on ball to escape pressure"
            className="input"
          />
        </label>
      </div>

      <label className="block">
        <span className="label">Comment</span>
        <textarea
          name="comment"
          rows={5}
          defaultValue={delivery?.comment ?? ""}
          placeholder="What you saw in the session — the frame, the practice, the coaching, the moments."
          className="input"
        />
      </label>

      <fieldset>
        <legend className="label">Action plan</legend>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 text-sm text-ink-500">{i + 1}.</span>
              <input
                name="action"
                defaultValue={delivery?.actions[i] ?? ""}
                placeholder={i < 2 ? "What they work on next" : "Optional"}
                className="input"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="sm:w-1/2">
        <label className="label" htmlFor={`rating-${delivery?.id ?? coach.id}`}>
          Rating — their level as you saw it
        </label>
        <select
          id={`rating-${delivery?.id ?? coach.id}`}
          name="rating"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="input"
        >
          <option value="">Not rated</option>
          {RATING_SCALE.map((value) => (
            <option key={value} value={value}>
              {value.toFixed(1)}
            </option>
          ))}
        </select>
        <p className="hint">
          {band ? `${band.faRating} — ${band.outcome}.` : "The session's own mark, out of 5."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving…">
          {delivery ? "Save changes" : "Save feedback"}
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

/**
 * The course's word on the coach: the comment, written whenever there is
 * something to say, and the rating, settled at the end.
 *
 * One card and one save for both, because they are the same column of the same
 * register and an assessor closing a course writes them in the same breath. The
 * outcome is not asked for — it follows the rating, and the form says which one
 * it is about to record before anything is saved.
 */
function CoachResultForm({ coach, threshold }: { coach: CoachEntry; threshold: number }) {
  const [state, formAction] = useActionState(saveCoachResult, idleRegister);
  const [rating, setRating] = useState<string>(coach.rating?.toString() ?? "");

  const value = rating ? Number(rating) : null;
  const band = bandFor(value);
  // Withdrawn and transferred are somebody's decision about the enrolment, not
  // a judgement about a delivery, so the rating leaves them where they are.
  const settled = coach.outcome === "WITHDRAWN" || coach.outcome === "TRANSFERRED";
  const verdict = settled
    ? { label: coach.outcome === "WITHDRAWN" ? "Withdrawn" : "Transferred", tone: "muted" as const }
    : value === null
      ? VERDICT_LABEL.in_progress
      : value >= threshold
        ? VERDICT_LABEL.passed
        : VERDICT_LABEL.needs_support;

  return (
    <form action={formAction} className="card card-pad space-y-3">
      <input type="hidden" name="enrollmentId" value={coach.id} />

      <div className="sm:w-1/2">
        <label className="label" htmlFor={`course-rating-${coach.id}`}>
          Course rating
        </label>
        <span className="flex items-center gap-2">
          <select
            id={`course-rating-${coach.id}`}
            name="rating"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="input"
          >
            <option value="">Not rated</option>
            {RATING_SCALE.map((mark) => (
              <option key={mark} value={mark}>
                {mark.toFixed(1)}
              </option>
            ))}
          </select>
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
        </span>
        <p className="hint">
          {band
            ? `${band.faRating}. ${band.definition}`
            : `Set at the end of the course: a judgement across everything they delivered, not an
               average of their sessions. Pass mark ${threshold}.`}
        </p>
      </div>

      <label className="block">
        <span className="label">General comment</span>
        <textarea
          name="comments"
          rows={3}
          defaultValue={coach.comments ?? ""}
          placeholder={`How ${coach.name.split(" ")[0]} is going on the course as a whole.`}
          className="input"
        />
        <p className="hint">
          Goes in the register&apos;s Comments column against this coach, and reads alongside
          their result.
        </p>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
          Save rating &amp; comment
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
        {!settled && value !== null && value < threshold && (
          <p className="text-xs text-ink-500">
            Below the pass mark — they show up as a candidate on the support desk, and referring
            them is a decision somebody makes after the conversation.
          </p>
        )}
      </div>
    </form>
  );
}
