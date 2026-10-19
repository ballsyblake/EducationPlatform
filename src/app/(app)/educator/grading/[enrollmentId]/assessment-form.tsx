"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import {
  DELIVERY_AREAS,
  DELIVERY_LEVELS,
  MAX_ACTION_STEPS,
  MAX_DELIVERY_POINTS,
  outcomeFor,
  totalPoints,
} from "@/lib/delivery-rubric";
import { bandFor, RATING_SCALE, VERDICT_LABEL } from "@/lib/support-rubric";
import { saveDelivery, type DeliveryState } from "../../../admin/actions/deliveries";
import { saveCoachResult, type RegisterState } from "../../../admin/actions/register";

const idleDelivery: DeliveryState = { status: "idle" };
const idleRegister: RegisterState = { status: "idle" };

const BLOCKS = ["Block 1", "Block 2", "Block 3"];
const COMPONENTS = ["Play", "Practice"];

export type CoachHeader = {
  id: string;
  name: string;
  email: string;
  photoId: string | null;
  rating: number | null;
  outcome: string;
  comments: string | null;
};

export type DeliveryEntry = {
  id: string;
  deliveryNo: number;
  assessor: string | null;
  block: string | null;
  session: string | null;
  component: string | null;
  topic: string | null;
  /// "2026-03-04" — the day it was delivered, for a date input.
  deliveredOn: string | null;
  comment: string | null;
  actions: string[];
  rating: number | null;
  /// Area code -> 0-3. An area missing from here has no score yet.
  scores: Record<string, number>;
};

/**
 * Football Australia's assessment form for one delivery.
 *
 * Every field is controlled. React 19 resets an uncontrolled form once an
 * action settles, and this form is forty minutes of somebody's evening — a
 * missing comment coming back as "write what you saw" must not take the
 * scoresheet and the action plan with it.
 */
export function AssessmentForm({
  coach,
  delivery,
  assessors,
  defaultAssessor,
  thresholds,
}: {
  coach: CoachHeader;
  delivery?: DeliveryEntry;
  assessors: string[];
  defaultAssessor: string;
  thresholds: { competent: number; highlyCompetent: number };
}) {
  const [state, formAction] = useActionState(saveDelivery, idleDelivery);

  // React 19 resets the form once the action settles. For an input with a
  // `value` it then writes the state back and nothing is lost, but a radio's
  // `checked` is not tracked that way: the reset clears the DOM, React still
  // believes the box is ticked, and re-rendering changes nothing. A failed save
  // took all six scores off the page while the state behind them was intact.
  //
  // So the radios are remounted whenever the action settles. New nodes get
  // `checked` written into them fresh, which puts the scoresheet back.
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (state.status !== "idle") setSettled((n) => n + 1);
  }, [state]);

  const [assessor, setAssessor] = useState(delivery?.assessor ?? defaultAssessor);
  const [block, setBlock] = useState(delivery?.block ?? "");
  const [session, setSession] = useState(delivery?.session ?? "");
  const [component, setComponent] = useState(delivery?.component ?? "");
  const [topic, setTopic] = useState(delivery?.topic ?? "");
  const [deliveredOn, setDeliveredOn] = useState(delivery?.deliveredOn ?? "");
  const [comment, setComment] = useState(delivery?.comment ?? "");
  const [actions, setActions] = useState<string[]>(() =>
    Array.from({ length: MAX_ACTION_STEPS }, (_, i) => delivery?.actions[i] ?? ""),
  );
  const [rating, setRating] = useState(delivery?.rating?.toString() ?? "");
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      DELIVERY_AREAS.map((area) => [
        area.code,
        delivery?.scores[area.code] !== undefined ? String(delivery.scores[area.code]) : "",
      ]),
    ),
  );

  const scored = totalPoints(
    new Map(
      Object.entries(scores).map(([code, value]) => [code, value === "" ? null : Number(value)]),
    ),
  );
  const outcome = outcomeFor(scored.points, thresholds);
  const band = bandFor(rating ? Number(rating) : null);
  const componentOptions =
    component && !COMPONENTS.includes(component) ? [...COMPONENTS, component] : COMPONENTS;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="enrollmentId" value={coach.id} />
      {delivery && <input type="hidden" name="deliveryId" value={delivery.id} />}

      {/* ------------------------- The session's facts ----------------------- */}
      <section className="card card-pad">
        <h2 className="mb-4 text-lg font-semibold text-ink-900">The session</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Assessor</span>
            <input
              name="assessor"
              value={assessor}
              onChange={(e) => setAssessor(e.target.value)}
              list="assessment-assessors"
              className="input"
            />
            <datalist id="assessment-assessors">
              {assessors.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="label">Block / when</span>
            <input
              name="block"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              list="assessment-blocks"
              placeholder="Block 2"
              className="input"
            />
            <datalist id="assessment-blocks">
              {BLOCKS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="label">Component</span>
            <select
              name="component"
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              className="input"
            >
              <option value="">—</option>
              {componentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Session</span>
            <input
              name="session"
              value={session}
              onChange={(e) => setSession(e.target.value)}
              placeholder="Session 3"
              className="input"
            />
          </label>

          <label className="block">
            <span className="label">Topic</span>
            <input
              name="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Staying on ball to escape pressure"
              className="input"
            />
          </label>

          <label className="block">
            <span className="label">Date delivered</span>
            <input
              type="date"
              name="deliveredOn"
              value={deliveredOn}
              onChange={(e) => setDeliveredOn(e.target.value)}
              className="input"
            />
            <p className="hint">The day the coach delivered it, not the day you write it up.</p>
          </label>
        </div>
      </section>

      {/* ----------------------------- The rubric ---------------------------- */}
      <section className="card card-pad">
        <h2 className="text-lg font-semibold text-ink-900">The rubric</h2>
        <p className="mt-1 mb-4 text-sm text-ink-500">
          Six areas, {MAX_DELIVERY_POINTS} points in all. Score each on the best fit of what the
          session showed rather than on a single moment, and leave an area blank until you have an
          answer for it — blank is not nought.
        </p>

        <div className="space-y-3">
          {DELIVERY_AREAS.map((area) => {
            const value = scores[area.code] ?? "";
            const level = DELIVERY_LEVELS.find((l) => String(l.score) === value);
            return (
              <div
                key={area.code}
                className="rounded-lg border border-ink-200 px-4 py-3 sm:flex sm:items-start sm:gap-4"
              >
                <div className="min-w-0 sm:flex-1">
                  <p className="text-sm font-semibold text-ink-900">{area.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{area.detail}</p>
                </div>

                {/* Four buttons rather than a dropdown: an assessor scores six
                    areas in a row, often on a phone on the sideline, and a
                    select is four taps where this is one. */}
                <fieldset key={`${area.code}-${settled}`} className="mt-3 shrink-0 sm:mt-0">
                  <legend className="sr-only">{area.title}</legend>
                  <div className="flex gap-1">
                    {DELIVERY_LEVELS.map((option) => {
                      const selected = value === String(option.score);
                      return (
                        <label
                          key={option.score}
                          title={`${option.label} — ${option.description}`}
                          className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-semibold ${
                            selected
                              ? "border-maroon-600 bg-maroon-600 text-white"
                              : "border-ink-300 bg-white text-ink-700 hover:border-maroon-600"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`score-${area.code}`}
                            value={option.score}
                            checked={selected}
                            onChange={() =>
                              setScores((prev) => ({ ...prev, [area.code]: String(option.score) }))
                            }
                            className="sr-only"
                          />
                          {option.score}
                        </label>
                      );
                    })}
                    {/* Clearing a score back to unanswered has to be possible,
                        and with radios it takes a control of its own. */}
                    <button
                      type="button"
                      onClick={() => setScores((prev) => ({ ...prev, [area.code]: "" }))}
                      disabled={value === ""}
                      className="rounded-md px-2 py-1.5 text-xs text-ink-500 hover:text-maroon-700 disabled:opacity-0"
                    >
                      Clear
                    </button>
                  </div>
                  {level && <p className="mt-1 text-right text-xs text-ink-500">{level.label}</p>}
                </fieldset>

                {/* A score of nothing still has to post, or an area cleared on
                    an existing scoresheet would look like a form that never
                    carried the rubric and the old score would stand. */}
                {value === "" && (
                  <input type="hidden" name={`score-${area.code}`} value="" />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
          <p className="text-sm font-semibold text-ink-900">
            Total {scored.points} / {MAX_DELIVERY_POINTS}
          </p>
          {scored.complete ? (
            <Badge tone={outcome.tone}>{outcome.label}</Badge>
          ) : (
            <span className="text-sm text-ink-500">
              {scored.scored === 0
                ? "Not scored yet."
                : `${scored.scored} of ${DELIVERY_AREAS.length} areas scored — the outcome needs all six.`}
            </span>
          )}
          {scored.complete && (
            <span className="text-xs text-ink-500">
              {thresholds.competent} is competent on this course, {thresholds.highlyCompetent} is
              highly competent.
            </span>
          )}
        </div>
      </section>

      {/* -------------------- Evidence and the action plan ------------------- */}
      <section className="card card-pad space-y-4">
        <label className="block">
          <span className="label">Assessor comment / evidence</span>
          <textarea
            name="comment"
            rows={7}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What you saw in the session — the frame, the practice, the coaching, the moments. Justify the scores with examples from the session."
            className="input"
          />
          <p className="hint">
            The scores say how the session went; this says why. It is what the coach reads.
          </p>
        </label>

        <fieldset>
          <legend className="label">Coach&apos;s action plan</legend>
          <p className="mb-2 text-xs text-ink-500">
            Up to {MAX_ACTION_STEPS} recommendations, specific and measurable, aimed at the areas
            that scored lowest.
          </p>
          <div className="space-y-2">
            {actions.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 text-sm text-ink-500">{i + 1}.</span>
                <input
                  name="action"
                  value={value}
                  onChange={(e) =>
                    setActions((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                  }
                  placeholder={i < 2 ? "What they work on next" : "Optional"}
                  className="input"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="sm:w-1/2">
          <label className="label" htmlFor="session-rating">
            Session rating (1&ndash;5)
          </label>
          <select
            id="session-rating"
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
            {band
              ? `${band.faRating} — ${band.outcome}.`
              : `The register's own column, in the 1-5 figures every course before this one was
                 kept in. Optional: the rubric above is what scores the session.`}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary" pendingLabel="Saving…">
          {delivery ? "Save changes" : "Save the assessment"}
        </SubmitButton>
        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
      </div>
    </form>
  );
}

/**
 * The course's word on the coach: the rating and the register's comment.
 *
 * The same action and the same two fields as the card on the course page — the
 * grading queue counts a coach with a delivery in and no course rating as still
 * outstanding, so an educator who finishes an assessment here has to be able to
 * clear that without going looking for the register.
 *
 * The outcome is not asked for. It follows the rating, and the form says which
 * one it is about to record before anything is saved.
 */
export function CourseRatingForm({
  coach,
  threshold,
}: {
  coach: CoachHeader;
  threshold: number;
}) {
  const [state, formAction] = useActionState(saveCoachResult, idleRegister);
  const [rating, setRating] = useState(coach.rating?.toString() ?? "");
  const [comments, setComments] = useState(coach.comments ?? "");

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
    <form action={formAction} className="card card-pad space-y-4">
      <input type="hidden" name="enrollmentId" value={coach.id} />

      <div className="sm:w-1/2">
        <label className="label" htmlFor="course-rating">
          Course rating
        </label>
        <span className="flex items-center gap-2">
          <select
            id="course-rating"
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
          {band ? `${band.faRating}. ${band.definition}` : `Pass mark ${threshold}.`}
        </p>
      </div>

      <label className="block">
        <span className="label">General comment</span>
        <textarea
          name="comments"
          rows={3}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder={`How ${coach.name.split(" ")[0]} is going on the course as a whole.`}
          className="input"
        />
        <p className="hint">
          Goes in the register&apos;s Comments column against this coach, and reads alongside their
          result.
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
