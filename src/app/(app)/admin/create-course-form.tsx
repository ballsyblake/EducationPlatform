"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import { createCourse, type ActionState } from "./actions/courses";

const initialState: ActionState = { status: "idle" };

export function CreateCourseForm() {
  const [state, formAction] = useActionState(createCourse, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="course-title">
          Title
        </label>
        <input
          id="course-title"
          name="title"
          required
          placeholder="Defending Principles"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="course-season">
          Season / term
        </label>
        <input id="course-season" name="season" placeholder="2026 Spring" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="course-description">
          Description
        </label>
        <textarea
          id="course-description"
          name="description"
          rows={3}
          placeholder="What this course covers and who it's for."
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="course-pass-mark">
          Pass mark
        </label>
        <input
          id="course-pass-mark"
          name="passMark"
          type="number"
          min={1}
          max={100}
          placeholder="e.g. 70"
          className="input"
        />
        <p className="hint">
          Leave blank if the course can&apos;t be failed. With a mark set, a coach who finishes
          every item below it is flagged for post-course support.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" name="published" className="accent-maroon-600" />
        Publish immediately
      </label>

      <FormError message={state.status === "error" ? state.message : null} />

      <SubmitButton className="btn-primary w-full" pendingLabel="Creating…">
        Create course
      </SubmitButton>
    </form>
  );
}
