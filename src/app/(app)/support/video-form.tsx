"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { submitVideo, type SubmitVideoState } from "./actions";

const initialState: SubmitVideoState = { status: "idle" };

/**
 * Controlled throughout: React 19 resets an uncontrolled form once the action
 * settles, and a coach who mistypes a URL should not lose the notes they wrote
 * underneath it along with the error.
 */
export function VideoSubmissionForm({
  attemptId,
  defaultUrl,
  defaultNotes,
  resubmitting,
}: {
  attemptId: string;
  defaultUrl: string;
  defaultNotes: string;
  resubmitting: boolean;
}) {
  const [state, formAction] = useActionState(submitVideo, initialState);
  const [videoUrl, setVideoUrl] = useState(defaultUrl);
  const [coachNotes, setCoachNotes] = useState(defaultNotes);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="attemptId" value={attemptId} />

      <div>
        <label className="label" htmlFor="videoUrl">
          Link to your session
        </label>
        <input
          id="videoUrl"
          name="videoUrl"
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className="input"
        />
        <p className="hint">
          YouTube or Vimeo plays right on your educator&apos;s page. Set it to unlisted rather than
          private — private film can&apos;t be opened by anyone but you, which is the most common
          reason a review stalls.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="coachNotes">
          Anything your educator should know
        </label>
        <textarea
          id="coachNotes"
          name="coachNotes"
          rows={4}
          value={coachNotes}
          onChange={(e) => setCoachNotes(e.target.value)}
          placeholder="Age group, theme, how many players you had, anything that shaped the session."
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="files">
          Session plan (optional)
        </label>
        <input
          id="files"
          name="files"
          type="file"
          multiple
          className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200"
        />
        <p className="hint">
          The plan you ran to, and anything else on paper. Don&apos;t upload the film itself —
          send it as a link above.
        </p>
      </div>

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />

      <SubmitButton pendingLabel="Sending…">
        {resubmitting ? "Update my submission" : "Submit for review"}
      </SubmitButton>
    </form>
  );
}
