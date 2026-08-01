"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { gradeSubmission, reviewAttempt, type GradeState } from "../actions/grading";

const initialState: GradeState = { status: "idle" };

export function GradeSubmissionForm({
  submissionId,
  points,
  defaultScore,
  defaultFeedback,
}: {
  submissionId: string;
  points: number;
  defaultScore: number | null;
  defaultFeedback: string | null;
}) {
  const [state, formAction] = useActionState(gradeSubmission, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="submissionId" value={submissionId} />

      <div className="flex items-end gap-3">
        <div className="w-32">
          <label className="label" htmlFor={`score-${submissionId}`}>
            Score
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`score-${submissionId}`}
              name="score"
              type="number"
              min={0}
              max={points}
              step="0.5"
              defaultValue={defaultScore ?? ""}
              className="input"
            />
            <span className="text-sm whitespace-nowrap text-chalk-500">/ {points}</span>
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`feedback-${submissionId}`}>
          Feedback
        </label>
        <textarea
          id={`feedback-${submissionId}`}
          name="feedback"
          rows={3}
          defaultValue={defaultFeedback ?? ""}
          placeholder="What was good, what to clean up before the next install."
          className="input"
        />
      </div>

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />

      <SubmitButton pendingLabel="Sending…">Send feedback</SubmitButton>
    </form>
  );
}

export type ReviewableAnswer = {
  id: string;
  prompt: string;
  text: string | null;
  maxPoints: number;
  pointsAwarded: number | null;
  graderComment: string | null;
};

export function ReviewAttemptForm({
  attemptId,
  answers,
  defaultFeedback,
}: {
  attemptId: string;
  answers: ReviewableAnswer[];
  defaultFeedback: string | null;
}) {
  const [state, formAction] = useActionState(reviewAttempt, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="attemptId" value={attemptId} />

      {answers.map((answer) => (
        <div key={answer.id} className="rounded-lg border border-chalk-200 p-3">
          <p className="text-sm font-medium text-chalk-800">{answer.prompt}</p>
          <p className="prose-note mt-2 rounded bg-chalk-50 px-3 py-2">
            {answer.text?.trim() || <em className="text-chalk-400">No answer given</em>}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div>
              <label className="label" htmlFor={`points-${answer.id}`}>
                Points
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`points-${answer.id}`}
                  name={`points_${answer.id}`}
                  type="number"
                  min={0}
                  max={answer.maxPoints}
                  step="0.5"
                  defaultValue={answer.pointsAwarded ?? ""}
                  className="input"
                />
                <span className="text-sm whitespace-nowrap text-chalk-500">
                  / {answer.maxPoints}
                </span>
              </div>
            </div>
            <div>
              <label className="label" htmlFor={`comment-${answer.id}`}>
                Note on this answer
              </label>
              <input
                id={`comment-${answer.id}`}
                name={`comment_${answer.id}`}
                defaultValue={answer.graderComment ?? ""}
                className="input"
              />
            </div>
          </div>
        </div>
      ))}

      <div>
        <label className="label" htmlFor={`attempt-feedback-${attemptId}`}>
          Overall feedback
        </label>
        <textarea
          id={`attempt-feedback-${attemptId}`}
          name="feedback"
          rows={3}
          defaultValue={defaultFeedback ?? ""}
          className="input"
        />
      </div>

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />

      <SubmitButton pendingLabel="Saving…">Save review</SubmitButton>
    </form>
  );
}
