"use client";

import { useState } from "react";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { toDateTimeLocal } from "@/lib/format";
import {
  bandFor,
  criteriaByGroup,
  DEFAULT_RATING_THRESHOLD,
  PATHWAY_DESCRIPTION,
  PATHWAY_LABEL,
  RATING_SCALE,
  reviewGate,
  SUPPORT_CRITERIA,
} from "@/lib/support-rubric";
import type { SupportPathway } from "@prisma-client";
import {
  arrangeAttempt,
  closeCase,
  rearrangeAttempt,
  recordReview,
  referToSupport,
  updateCase,
  type SupportState,
} from "../actions/support";

const idle: SupportState = { status: "idle" };

export type EducatorOption = { id: string; label: string };

/* --------------------------- Shared bits ---------------------------------- */

/**
 * The pathway choice and the logistics that follow from it.
 *
 * Both routes need a date, and they mean different things — the slot an
 * educator is driving to, or the day film is due — so the label changes with
 * the choice rather than reading "Date" for both.
 */
function PathwayFields({
  pathway,
  onPathway,
  dueAt,
  onDueAt,
  venue,
  onVenue,
  lockedNotice,
}: {
  pathway: SupportPathway;
  onPathway: (value: SupportPathway) => void;
  dueAt: string;
  onDueAt: (value: string) => void;
  venue: string;
  onVenue: (value: string) => void;
  lockedNotice?: string;
}) {
  const live = pathway === "LIVE_ASSESSMENT";

  return (
    <>
      <input type="hidden" name="pathway" value={pathway} />
      <fieldset>
        <legend className="label">Pathway</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["LIVE_ASSESSMENT", "VIDEO_REVIEW"] as const).map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors ${
                pathway === value
                  ? "border-maroon-600 bg-maroon-50"
                  : "border-ink-300 bg-white hover:bg-ink-50"
              } ${lockedNotice ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span className="flex items-center gap-2 font-semibold text-ink-900">
                <input
                  type="radio"
                  checked={pathway === value}
                  onChange={() => onPathway(value)}
                  disabled={Boolean(lockedNotice)}
                  className="accent-maroon-600"
                />
                {PATHWAY_LABEL[value]}
              </span>
              <span className="text-xs text-ink-500">{PATHWAY_DESCRIPTION[value]}</span>
            </label>
          ))}
        </div>
        {lockedNotice && <p className="hint">{lockedNotice}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="dueAt">
            {live ? "Session date and time" : "Video due by"}
          </label>
          <input
            id="dueAt"
            name="dueAt"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => onDueAt(e.target.value)}
            className="input"
          />
          <p className="hint">
            {live
              ? "The session you'll be attending."
              : "The date the coach's link has to be in by."}
          </p>
        </div>
        {live && (
          <div>
            <label className="label" htmlFor="venue">
              Ground
            </label>
            <input
              id="venue"
              name="venue"
              value={venue}
              onChange={(e) => onVenue(e.target.value)}
              placeholder="e.g. Wolter Park, field 3"
              className="input"
            />
            <p className="hint">Where you're going, so the coach can confirm it.</p>
          </div>
        )}
      </div>
    </>
  );
}

function EducatorSelect({
  educators,
  value,
  onChange,
}: {
  educators: EducatorOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor="educatorId">
        Educator
      </label>
      <select
        id="educatorId"
        name="educatorId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      >
        <option value="">Unassigned</option>
        {educators.map((educator) => (
          <option key={educator.id} value={educator.id}>
            {educator.label}
          </option>
        ))}
      </select>
      <p className="hint">Who the coach contacts. Any admin can still act on the case.</p>
    </div>
  );
}

/* ------------------------------ Referral ---------------------------------- */

export function ReferralForm({
  educators,
  defaultEducatorId,
  fixed,
  coaches,
  courses,
}: {
  educators: EducatorOption[];
  defaultEducatorId: string;
  /// Set when referring straight off a "hasn't passed" row.
  fixed?: { userId: string; courseId: string; coachName: string; courseTitle: string };
  coaches?: { id: string; label: string }[];
  courses?: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(referToSupport, idle);
  const [pathway, setPathway] = useState<SupportPathway>("LIVE_ASSESSMENT");
  const [dueAt, setDueAt] = useState("");
  const [venue, setVenue] = useState("");
  const [reason, setReason] = useState("");
  const [educatorId, setEducatorId] = useState(defaultEducatorId);
  const [userId, setUserId] = useState(fixed?.userId ?? "");
  const [courseId, setCourseId] = useState(fixed?.courseId ?? "");

  return (
    <form action={formAction} className="space-y-4">
      {fixed ? (
        <>
          <input type="hidden" name="userId" value={fixed.userId} />
          <input type="hidden" name="courseId" value={fixed.courseId} />
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="userId">
              Coach
            </label>
            <select
              id="userId"
              name="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="input"
            >
              <option value="">Choose a coach…</option>
              {coaches?.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="courseId">
              Course
            </label>
            <select
              id="courseId"
              name="courseId"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="input"
            >
              <option value="">Choose a course…</option>
              {courses?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="reason">
          Why they're being referred
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What the coursework didn't show, and what you want to see on the grass."
          className="input"
        />
        <p className="hint">The coach reads this. Being referred without being told why is the thing this process exists to avoid.</p>
      </div>

      <PathwayFields
        pathway={pathway}
        onPathway={setPathway}
        dueAt={dueAt}
        onDueAt={setDueAt}
        venue={venue}
        onVenue={setVenue}
      />

      <EducatorSelect educators={educators} value={educatorId} onChange={setEducatorId} />

      <FormError message={state.status === "error" ? state.message : null} />
      <SubmitButton pendingLabel="Opening…">Open support case</SubmitButton>
    </form>
  );
}

/* ------------------------------ Arranging --------------------------------- */

export function ArrangeAttemptForm({ caseId }: { caseId: string }) {
  const [state, formAction] = useActionState(arrangeAttempt, idle);
  const [pathway, setPathway] = useState<SupportPathway>("LIVE_ASSESSMENT");
  const [dueAt, setDueAt] = useState("");
  const [venue, setVenue] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="caseId" value={caseId} />
      <PathwayFields
        pathway={pathway}
        onPathway={setPathway}
        dueAt={dueAt}
        onDueAt={setDueAt}
        venue={venue}
        onVenue={setVenue}
      />
      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />
      <SubmitButton pendingLabel="Arranging…">Arrange assessment</SubmitButton>
    </form>
  );
}

export function RearrangeForm({
  attempt,
}: {
  attempt: {
    id: string;
    pathway: SupportPathway;
    status: string;
    dueAt: Date | string | null;
    venue: string | null;
  };
}) {
  const [state, formAction] = useActionState(rearrangeAttempt, idle);
  const [pathway, setPathway] = useState<SupportPathway>(attempt.pathway);
  const [dueAt, setDueAt] = useState(
    toDateTimeLocal(attempt.dueAt ? new Date(attempt.dueAt) : null),
  );
  const [venue, setVenue] = useState(attempt.venue ?? "");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="attemptId" value={attempt.id} />
      <PathwayFields
        pathway={pathway}
        onPathway={setPathway}
        dueAt={dueAt}
        onDueAt={setDueAt}
        venue={venue}
        onVenue={setVenue}
        lockedNotice={
          attempt.status === "SUBMITTED"
            ? "The coach's video is already in, so the pathway is fixed for this assessment."
            : undefined
        }
      />
      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}

/* -------------------------------- Review ---------------------------------- */

export type ExistingRating = { code: string; rating: number; comment: string | null };

export function ReviewForm({
  attemptId,
  ratings,
  defaultFeedback,
  threshold = DEFAULT_RATING_THRESHOLD,
}: {
  attemptId: string;
  ratings: ExistingRating[];
  defaultFeedback: string | null;
  threshold?: number;
}) {
  const [state, formAction] = useActionState(recordReview, idle);

  const [marks, setMarks] = useState<Record<string, number | 0>>(() =>
    Object.fromEntries(
      SUPPORT_CRITERIA.map((c) => [c.code, ratings.find((r) => r.code === c.code)?.rating ?? 0]),
    ),
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      SUPPORT_CRITERIA.map((c) => [c.code, ratings.find((r) => r.code === c.code)?.comment ?? ""]),
    ),
  );
  const [outcome, setOutcome] = useState("");
  const [feedback, setFeedback] = useState(defaultFeedback ?? "");

  // The same gate the action applies on save, so the form never offers an
  // outcome the server is going to reject.
  const gate = reviewGate(
    new Map(Object.entries(marks).map(([k, v]) => [k, v || null])),
    threshold,
  );

  function setMark(code: string, rating: number) {
    const next = { ...marks, [code]: rating };
    setMarks(next);
    const after = reviewGate(
      new Map(Object.entries(next).map(([k, v]) => [k, v || null])),
      threshold,
    );
    if (!after.canPass && outcome === "SUCCESSFUL") setOutcome("");
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="attemptId" value={attemptId} />

      {criteriaByGroup().map(({ group, criteria }) => (
        <section key={group}>
          <h3 className="section-title mb-2">{group}</h3>
          <div className="space-y-3">
            {criteria.map((criterion) => (
              <div key={criterion.code} className="rounded-lg border border-ink-200 p-3">
                <input
                  type="hidden"
                  name={`rating_${criterion.code}`}
                  value={marks[criterion.code] || ""}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">{criterion.title}</p>
                  <p className="text-xs font-semibold text-ink-500">
                    {marks[criterion.code] ? marks[criterion.code].toFixed(1) : "—"}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">{criterion.detail}</p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RATING_SCALE.map((value) => {
                    const selected = marks[criterion.code] === value;
                    const band = bandFor(value)!;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMark(criterion.code, value)}
                        aria-pressed={selected}
                        title={`${value} — ${band.faRating}`}
                        className={`w-11 rounded-lg border px-0 py-1 text-xs font-semibold transition-colors ${
                          selected
                            ? "border-maroon-600 bg-maroon-600 text-white"
                            : value < threshold
                              ? "border-ink-300 bg-ink-50 text-ink-500 hover:bg-ink-100"
                              : "border-ink-300 bg-white text-ink-700 hover:bg-ink-50"
                        }`}
                      >
                        {value.toFixed(1)}
                      </button>
                    );
                  })}
                </div>

                <input
                  name={`comment_${criterion.code}`}
                  value={comments[criterion.code]}
                  onChange={(e) =>
                    setComments({ ...comments, [criterion.code]: e.target.value })
                  }
                  placeholder="Note (optional) — what you saw."
                  className="input mt-2 text-xs"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="rounded-lg bg-ink-50 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="section-title">Outcome</p>
          {gate.overall !== null && (
            <p className="text-sm font-semibold text-ink-800">
              {gate.overall.toFixed(1)}
              <span className="ml-2 font-normal text-ink-500">
                {gate.band?.faRating} · {gate.band?.outcome}
              </span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label
            className={`flex items-start gap-2 text-sm ${
              gate.canPass ? "text-ink-800" : "text-ink-400"
            }`}
          >
            <input
              type="radio"
              name="outcome"
              value="SUCCESSFUL"
              checked={outcome === "SUCCESSFUL"}
              onChange={() => setOutcome("SUCCESSFUL")}
              disabled={!gate.canPass}
              className="mt-1 accent-maroon-600"
            />
            <span>
              <span className="font-semibold">Successful</span> — the delivery met the standard and
              the course is passed.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-800">
            <input
              type="radio"
              name="outcome"
              value="NOT_YET_SUCCESSFUL"
              checked={outcome === "NOT_YET_SUCCESSFUL"}
              onChange={() => setOutcome("NOT_YET_SUCCESSFUL")}
              className="mt-1 accent-maroon-600"
            />
            <span>
              <span className="font-semibold">Not yet successful</span> — the case stays open for
              the next assessment.
            </span>
          </label>
        </div>

        {!gate.complete ? (
          <p className="hint">
            {gate.missing.length} criteri{gate.missing.length === 1 ? "on" : "a"} still unrated.
          </p>
        ) : (
          !gate.canPass && (
            <p className="hint">
              {gate.overall?.toFixed(1)} is below {threshold}, so the rubric puts this in
              post-course support. Move the marks or record it as not yet successful.
            </p>
          )
        )}
      </div>

      <div>
        <label className="label" htmlFor="feedback">
          Feedback for the coach
        </label>
        <textarea
          id="feedback"
          name="feedback"
          rows={5}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="What worked, what didn't, and what you want to see next time."
          className="input"
        />
      </div>

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />
      <SubmitButton pendingLabel="Recording…" confirm="Record this assessment? The coach sees it straight away.">
        Record assessment
      </SubmitButton>
    </form>
  );
}

/* ---------------------------- Case settings ------------------------------- */

export function CaseSettingsForm({
  supportCase,
  educators,
}: {
  supportCase: {
    id: string;
    educatorId: string | null;
    attemptsAllowed: number;
    reason: string | null;
  };
  educators: EducatorOption[];
}) {
  const [state, formAction] = useActionState(updateCase, idle);
  const [educatorId, setEducatorId] = useState(supportCase.educatorId ?? "");
  const [allowed, setAllowed] = useState(String(supportCase.attemptsAllowed));
  const [reason, setReason] = useState(supportCase.reason ?? "");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="caseId" value={supportCase.id} />
      <EducatorSelect educators={educators} value={educatorId} onChange={setEducatorId} />
      <div>
        <label className="label" htmlFor="attemptsAllowed">
          Assessments allowed
        </label>
        <input
          id="attemptsAllowed"
          name="attemptsAllowed"
          type="number"
          min={1}
          max={5}
          value={allowed}
          onChange={(e) => setAllowed(e.target.value)}
          className="input"
        />
        <p className="hint">Two by default — the reassessment and one further opportunity.</p>
      </div>
      <div>
        <label className="label" htmlFor="case-reason">
          Referral reason
        </label>
        <textarea
          id="case-reason"
          name="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="input"
        />
      </div>
      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
        Save case
      </SubmitButton>
    </form>
  );
}

export function CloseCaseForm({ caseId }: { caseId: string }) {
  const [state, formAction] = useActionState(closeCase, idle);
  const [status, setStatus] = useState("UNSUCCESSFUL");
  const [note, setNote] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1.5">
        <label className="flex items-start gap-2 text-sm text-ink-800">
          <input
            type="radio"
            name="status"
            value="UNSUCCESSFUL"
            checked={status === "UNSUCCESSFUL"}
            onChange={() => setStatus("UNSUCCESSFUL")}
            className="mt-1 accent-maroon-600"
          />
          <span>
            <span className="font-semibold">Not successful</span> — assessed, and the standard
            wasn't reached.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink-800">
          <input
            type="radio"
            name="status"
            value="WITHDRAWN"
            checked={status === "WITHDRAWN"}
            onChange={() => setStatus("WITHDRAWN")}
            className="mt-1 accent-maroon-600"
          />
          <span>
            <span className="font-semibold">Withdrawn</span> — no assessment took place. The coach
            left, moved clubs, or was referred in error.
          </span>
        </label>
      </div>
      <textarea
        name="closingNote"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why this case is being closed. The coach reads this."
        className="input"
      />
      <FormError message={state.status === "error" ? state.message : null} />
      <SubmitButton
        className="btn-danger btn-sm"
        pendingLabel="Closing…"
        confirm="Close this case? Any assessment still booked on it is cancelled."
      >
        Close case
      </SubmitButton>
    </form>
  );
}
