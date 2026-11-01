"use client";

import { useActionState, useState } from "react";
import { FootagePlayer, type FootageNoteView, type FootageView } from "@/components/footage-player";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { formatTimecode } from "@/lib/footage";
import {
  addFootage,
  removeFootage,
  removeNote,
  saveNote,
  type FootageState,
} from "../../../actions/footage";

const idle: FootageState = { status: "idle" };

/**
 * Film of one delivery, as the educator who watched it works on it.
 *
 * The same player the coach sees, with the pinning forms around it — rather
 * than a separate editor that would let staff build up feedback they have never
 * seen the way it reads.
 */
export function FootageSection({
  deliveryId,
  deliveryNo,
  coachName,
  footage,
}: {
  deliveryId: string;
  deliveryNo: number;
  coachName: string;
  footage: FootageView[];
}) {
  return (
    <div className="mt-3 border-t border-ink-200 pt-3">
      <p className="section-title mb-2">Session footage</p>

      <div className="space-y-4">
        {footage.map((clip) => (
          <div key={clip.id} className="rounded-lg border border-ink-200 bg-ink-50 p-3">
            <FootagePlayer
              footage={clip}
              noteActions={(note) => <NoteControls note={note} footageId={clip.id} />}
              footer={<NoteForm footageId={clip.id} />}
            />
            <RemoveFootageForm
              footageId={clip.id}
              label={clip.title ?? `Delivery ${deliveryNo}`}
              coachName={coachName}
            />
          </div>
        ))}

        <details>
          <summary className="cursor-pointer text-xs font-medium text-maroon-700">
            {footage.length ? "Post another clip" : "Post film of this delivery"}
          </summary>
          <div className="mt-3">
            <AddFootageForm deliveryId={deliveryId} />
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * Where the film lives.
 *
 * Controlled inputs: React 19 clears an uncontrolled form once the action
 * settles, and an educator who pastes a link the player can't seek gets an
 * error with a tickbox beside it — losing the link they just pasted while
 * reading that would be absurd.
 */
function AddFootageForm({ deliveryId }: { deliveryId: string }) {
  const [state, formAction] = useActionState(addFootage, idle);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [anyway, setAnyway] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="deliveryId" value={deliveryId} />

      <div>
        <label className="label" htmlFor={`url-${deliveryId}`}>
          Link to the film
        </label>
        <input
          id={`url-${deliveryId}`}
          name="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className="input"
        />
        <p className="hint">
          YouTube or Vimeo, or a direct link to a video file. Set it unlisted rather than private —
          private film can&apos;t be opened by the coach it is for. Don&apos;t upload the recording;
          uploads here are capped at a few megabytes.
        </p>
      </div>

      <div>
        <label className="label" htmlFor={`title-${deliveryId}`}>
          Label (optional)
        </label>
        <input
          id={`title-${deliveryId}`}
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="First half"
          className="input"
        />
        <p className="hint">Only needed when there is more than one clip of the same session.</p>
      </div>

      {state.status === "error" && (
        <label className="flex items-start gap-2 text-xs text-ink-600">
          <input
            type="checkbox"
            name="anyway"
            value="1"
            checked={anyway}
            onChange={(e) => setAnyway(e.target.checked)}
            className="mt-0.5"
          />
          <span>Keep it anyway — the coach gets the link and the timecodes, without seeking.</span>
        </label>
      )}

      <FormError message={state.status === "error" ? state.message : null} />
      <FormSuccess message={state.status === "ok" ? state.message : null} />

      <SubmitButton className="btn-primary btn-sm" pendingLabel="Posting…">
        Post film
      </SubmitButton>
    </form>
  );
}

function RemoveFootageForm({
  footageId,
  label,
  coachName,
}: {
  footageId: string;
  label: string;
  coachName: string;
}) {
  const [state, formAction] = useActionState(removeFootage, idle);

  return (
    <form action={formAction} className="mt-3 flex items-center gap-3">
      <input type="hidden" name="footageId" value={footageId} />
      <SubmitButton
        className="btn-danger btn-sm"
        pendingLabel="Removing…"
        confirm={`Remove "${label}" and its notes from ${coachName}'s record?`}
      >
        Remove film
      </SubmitButton>
      <FormError message={state.status === "error" ? state.message : null} />
    </form>
  );
}

/** Pins a new note, or corrects one already pinned. */
function NoteForm({
  footageId,
  note,
  onDone,
}: {
  footageId: string;
  note?: FootageNoteView;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(saveNote, idle);
  const [at, setAt] = useState(note ? formatTimecode(note.atSeconds) : "");
  const [body, setBody] = useState(note?.body ?? "");

  return (
    <form
      action={async (formData: FormData) => {
        await formAction(formData);
        onDone?.();
      }}
      className={note ? "space-y-2" : "mt-3 space-y-2 border-t border-ink-200 pt-3"}
    >
      <input type="hidden" name="footageId" value={footageId} />
      {note && <input type="hidden" name="noteId" value={note.id} />}

      <div className="flex gap-2">
        <input
          name="at"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          placeholder="1:07"
          aria-label="Moment in the recording"
          className="input w-24 font-mono"
        />
        <input
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happens here"
          aria-label="The note"
          className="input flex-1"
        />
      </div>

      <FormError message={state.status === "error" ? state.message : null} />

      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
        {note ? "Save note" : "Pin note"}
      </SubmitButton>
    </form>
  );
}

/** Edit and remove, under a note already pinned. */
function NoteControls({ note, footageId }: { note: FootageNoteView; footageId: string }) {
  const [state, formAction] = useActionState(removeNote, idle);
  const [editing, setEditing] = useState(false);

  return (
    <div className="mt-2 border-t border-ink-200 pt-2">
      {editing ? (
        <NoteForm footageId={footageId} note={note} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-maroon-700 hover:underline"
          >
            Edit
          </button>
          <form action={formAction}>
            <input type="hidden" name="noteId" value={note.id} />
            <SubmitButton
              className="text-xs font-medium text-ink-500 hover:text-maroon-700"
              pendingLabel="Removing…"
              confirm={`Remove the note at ${formatTimecode(note.atSeconds)}?`}
            >
              Remove
            </SubmitButton>
          </form>
        </div>
      )}
      <FormError message={state.status === "error" ? state.message : null} />
    </div>
  );
}
