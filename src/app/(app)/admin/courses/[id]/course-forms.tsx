"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import {
  addMaterial,
  addQuestion,
  saveAssignment,
  saveQuiz,
  type ActionState,
} from "../../actions/courses";

const initialState: ActionState = { status: "idle" };

function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />
    </>
  );
}

/* -------------------------------- Materials ------------------------------- */

export function MaterialForm({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(addMaterial, initialState);
  const [kind, setKind] = useState("FILE");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="material-title">
            Title
          </label>
          <input
            id="material-title"
            name="title"
            required
            placeholder="Cover 3 beaters — cut-ups"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="material-kind">
            Type
          </label>
          <select
            id="material-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="input"
          >
            <option value="FILE">Upload a file</option>
            <option value="VIDEO">Video link</option>
            <option value="LINK">Web link</option>
          </select>
        </div>
      </div>

      {kind === "FILE" ? (
        <div>
          <label className="label" htmlFor="material-file">
            File
          </label>
          <input
            id="material-file"
            name="file"
            type="file"
            className="block w-full text-sm text-chalk-600 file:mr-3 file:rounded-lg file:border-0 file:bg-chalk-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-chalk-700 hover:file:bg-chalk-200"
          />
          <p className="hint">
            Playbook PDFs, install docs, or images. Post film as a video link instead — uploads
            are capped, and YouTube/Vimeo play inline.
          </p>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="material-url">
            URL
          </label>
          <input
            id="material-url"
            name="url"
            type="url"
            placeholder="https://www.youtube.com/watch?v=…"
            className="input"
          />
          <p className="hint">YouTube and Vimeo links play inline.</p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="material-description">
          Notes
        </label>
        <textarea id="material-description" name="description" rows={2} className="input" />
      </div>

      <Feedback state={state} />
      <SubmitButton pendingLabel="Adding…">Add to library</SubmitButton>
    </form>
  );
}

/* ------------------------------- Assignments ------------------------------ */

export function AssignmentForm({
  courseId,
  assignment,
}: {
  courseId: string;
  assignment?: {
    id: string;
    title: string;
    instructions: string | null;
    points: number;
    dueAt: string;
    allowText: boolean;
    allowFiles: boolean;
    published: boolean;
  };
}) {
  const [state, formAction] = useActionState(saveAssignment, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      {assignment && <input type="hidden" name="assignmentId" value={assignment.id} />}

      <div>
        <label className="label" htmlFor="assignment-title">
          Title
        </label>
        <input
          id="assignment-title"
          name="title"
          required
          defaultValue={assignment?.title}
          placeholder="Self-scout: 3rd &amp; medium tendencies"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="assignment-instructions">
          Instructions
        </label>
        <textarea
          id="assignment-instructions"
          name="instructions"
          rows={4}
          defaultValue={assignment?.instructions ?? ""}
          placeholder="What the coach needs to turn in, and what you're looking for."
          className="input"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="assignment-points">
            Points
          </label>
          <input
            id="assignment-points"
            name="points"
            type="number"
            min={1}
            defaultValue={assignment?.points ?? 100}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="assignment-due">
            Due
          </label>
          <input
            id="assignment-due"
            name="dueAt"
            type="datetime-local"
            defaultValue={assignment?.dueAt ?? ""}
            className="input"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-chalk-700">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="allowText"
            defaultChecked={assignment?.allowText ?? true}
            className="accent-field-600"
          />
          Written response
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="allowFiles"
            defaultChecked={assignment?.allowFiles ?? true}
            className="accent-field-600"
          />
          File uploads
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="published"
            defaultChecked={assignment?.published ?? true}
            className="accent-field-600"
          />
          Visible to coaches
        </label>
      </div>

      <Feedback state={state} />
      <SubmitButton pendingLabel="Saving…">
        {assignment ? "Save changes" : "Post assignment"}
      </SubmitButton>
    </form>
  );
}

/* --------------------------------- Quizzes -------------------------------- */

export function QuizSettingsForm({
  courseId,
  quiz,
}: {
  courseId: string;
  quiz?: {
    id: string;
    title: string;
    description: string | null;
    dueAt: string;
    maxAttempts: number | null;
    published: boolean;
  };
}) {
  const [state, formAction] = useActionState(saveQuiz, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      {quiz && <input type="hidden" name="quizId" value={quiz.id} />}

      <div>
        <label className="label" htmlFor="quiz-title">
          Title
        </label>
        <input
          id="quiz-title"
          name="title"
          required
          defaultValue={quiz?.title}
          placeholder="Cover 3 rules check"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="quiz-description">
          Description
        </label>
        <textarea
          id="quiz-description"
          name="description"
          rows={2}
          defaultValue={quiz?.description ?? ""}
          className="input"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="quiz-due">
            Due
          </label>
          <input
            id="quiz-due"
            name="dueAt"
            type="datetime-local"
            defaultValue={quiz?.dueAt ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="quiz-attempts">
            Attempts allowed
          </label>
          <input
            id="quiz-attempts"
            name="maxAttempts"
            type="number"
            min={0}
            defaultValue={quiz?.maxAttempts ?? 1}
            className="input"
          />
          <p className="hint">Use 0 for unlimited retakes.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-chalk-700">
        <input
          type="checkbox"
          name="published"
          defaultChecked={quiz?.published ?? true}
          className="accent-field-600"
        />
        Visible to coaches
      </label>

      <Feedback state={state} />
      <SubmitButton pendingLabel="Saving…">{quiz ? "Save changes" : "Create quiz"}</SubmitButton>
    </form>
  );
}

/* -------------------------------- Questions ------------------------------- */

export function QuestionForm({ quizId, courseId }: { quizId: string; courseId: string }) {
  const [state, formAction] = useActionState(addQuestion, initialState);
  const [kind, setKind] = useState("MULTIPLE_CHOICE");
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful add so the next question starts blank.
  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="courseId" value={courseId} />

      <div>
        <label className="label" htmlFor="question-prompt">
          Question
        </label>
        <textarea
          id="question-prompt"
          name="prompt"
          rows={2}
          required
          placeholder="With Cover 3, who has the flat to the field?"
          className="input"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="question-kind">
            Type
          </label>
          <select
            id="question-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="input"
          >
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="TRUE_FALSE">True / false</option>
            <option value="SHORT_ANSWER">Written answer</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="question-points">
            Points
          </label>
          <input
            id="question-points"
            name="points"
            type="number"
            min={1}
            defaultValue={1}
            className="input"
          />
        </div>
      </div>

      {kind === "MULTIPLE_CHOICE" && (
        <fieldset className="space-y-2">
          <legend className="label">Options — select the correct one</legend>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="radio"
                name="correctChoice"
                value={i}
                defaultChecked={i === 0}
                aria-label={`Option ${i + 1} is correct`}
                className="accent-field-600"
              />
              <input
                name={`choice_${i}`}
                placeholder={i < 2 ? `Option ${i + 1} (required)` : `Option ${i + 1} (optional)`}
                className="input"
              />
            </div>
          ))}
        </fieldset>
      )}

      {kind === "TRUE_FALSE" && (
        <div>
          <label className="label" htmlFor="question-bool">
            Correct answer
          </label>
          <select id="question-bool" name="correctBool" className="input">
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </div>
      )}

      {kind === "SHORT_ANSWER" && (
        <p className="rounded-lg bg-chalk-100 px-3 py-2 text-sm text-chalk-600">
          Written answers can&apos;t be auto-graded — this quiz will land in your grading queue
          after a coach submits it.
        </p>
      )}

      <div>
        <label className="label" htmlFor="question-rationale">
          Explanation shown after grading
        </label>
        <input
          id="question-rationale"
          name="rationale"
          placeholder="Optional — the coaching point behind the answer."
          className="input"
        />
      </div>

      <Feedback state={state} />
      <SubmitButton pendingLabel="Adding…">Add question</SubmitButton>
    </form>
  );
}
