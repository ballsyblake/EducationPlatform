"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { saveDraft, type SubmissionFormState } from "./actions";

const initialState: SubmissionFormState = { status: "idle" };

export function SubmissionForm({
  assignmentId,
  allowText,
  allowFiles,
  defaultText,
}: {
  assignmentId: string;
  allowText: boolean;
  allowFiles: boolean;
  defaultText: string;
}) {
  const [state, formAction] = useActionState(saveDraft, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="assignmentId" value={assignmentId} />

      {allowText && (
        <div>
          <label className="label" htmlFor="text">
            Your response
          </label>
          <textarea
            id="text"
            name="text"
            rows={10}
            defaultValue={defaultText}
            placeholder="Write your response here…"
            className="input text-sm"
          />
        </div>
      )}

      {allowFiles && (
        <div>
          <label className="label" htmlFor="files">
            Attachments
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200"
          />
          <p className="hint">
            PDFs, documents or images. For video, ask your coordinator to post it as a link.
          </p>
        </div>
      )}

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess
        message={state.status === "saved" || state.status === "submitted" ? state.message : null}
      />

      {/* The submitter's name/value lands in FormData, so one action handles both. */}
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          name="intent"
          value="submit"
          pendingLabel="Turning in…"
          confirm="Turn this in? You won't be able to edit it afterward."
        >
          Turn in
        </SubmitButton>
        <SubmitButton name="intent" value="save" className="btn-secondary" pendingLabel="Saving…">
          Save draft
        </SubmitButton>
      </div>
    </form>
  );
}
