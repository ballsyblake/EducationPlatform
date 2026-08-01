"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { submitAttempt, type QuizSubmitState } from "../../actions";

export type QuizQuestion = {
  id: string;
  prompt: string;
  kind: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  points: number;
  choices: { id: string; text: string }[];
};

const initialState: QuizSubmitState = { status: "idle" };

export function QuizForm({
  attemptId,
  questions,
}: {
  attemptId: string;
  questions: QuizQuestion[];
}) {
  const [state, formAction] = useActionState(submitAttempt, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="attemptId" value={attemptId} />

      {questions.map((question, index) => (
        <fieldset key={question.id} className="card card-pad">
          <legend className="sr-only">Question {index + 1}</legend>

          <div className="mb-3 flex items-start justify-between gap-4">
            <p className="font-medium text-chalk-900">
              <span className="mr-2 text-chalk-400">{index + 1}.</span>
              {question.prompt}
            </p>
            <span className="shrink-0 text-xs text-chalk-500">
              {question.points} pt{question.points === 1 ? "" : "s"}
            </span>
          </div>

          {question.kind === "SHORT_ANSWER" ? (
            <textarea
              name={`q_${question.id}`}
              rows={4}
              className="input text-sm"
              placeholder="Type your answer…"
            />
          ) : (
            <div className="space-y-2">
              {question.choices.map((choice) => (
                <label
                  key={choice.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-chalk-200 px-3 py-2 text-sm hover:bg-chalk-50 has-checked:border-field-400 has-checked:bg-field-50"
                >
                  <input
                    type="radio"
                    name={`q_${question.id}`}
                    value={choice.id}
                    className="mt-0.5 accent-field-600"
                  />
                  <span className="text-chalk-800">{choice.text}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}

      <FormError message={state.status === "error" ? state.message : null} />

      <div className="flex items-center gap-3">
        <SubmitButton
          pendingLabel="Submitting…"
          confirm="Submit this quiz? You can't change your answers afterward."
        >
          Submit quiz
        </SubmitButton>
        <p className="text-xs text-chalk-500">
          Unanswered questions are marked incorrect.
        </p>
      </div>
    </form>
  );
}
