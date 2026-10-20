"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { embedAt, footageSource, formatTimecode } from "@/lib/footage";

export type FootageNoteView = {
  id: string;
  atSeconds: number;
  body: string;
  /// Who pinned it. Null when the account that wrote it has since gone.
  author: string | null;
};

export type FootageView = {
  id: string;
  title: string | null;
  url: string;
  notes: FootageNoteView[];
};

/**
 * Film of a delivery with the feedback pinned down the side of it.
 *
 * Clicking a note seeks the player to the moment it is about, which is the
 * whole point: the written comment on a delivery says "you lost the group in
 * the transition", and this is what lets the coach watch the eleven seconds
 * where it happened.
 *
 * How the seek happens depends on the link, and nothing third-party is loaded
 * into the page to do it:
 *
 * - A direct video file is a `<video>` element, where seeking is a property.
 * - YouTube and Vimeo are iframes that take seek commands over `postMessage`.
 *   Those are dropped silently by a player that hasn't finished loading, so
 *   until the player has said something back the seek is done by remounting
 *   the iframe at the timecode instead. That costs a reload and always works.
 * - Anything else can't be seeked, so the notes are shown with their timecodes
 *   beside a plain link. Still the feedback, just not clickable.
 */
export function FootagePlayer({
  footage,
  noteActions,
  footer,
}: {
  footage: FootageView;
  /// Extra controls rendered under each note — editing, for staff.
  noteActions?: (note: FootageNoteView) => ReactNode;
  /// Rendered under the note list. The "pin a note" form, for staff.
  footer?: ReactNode;
}) {
  const source = footageSource(footage.url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Whether the embedded player has ever spoken to us. A ref rather than
  // state: it is read inside a click handler and must not re-render the page.
  const answered = useRef(false);
  // Set when a seek had to be done by remounting. `nonce` forces the remount
  // even when the same note is clicked twice.
  const [reload, setReload] = useState<{ at: number; nonce: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const notes = [...footage.notes].sort((a, b) => a.atSeconds - b.atSeconds || (a.id < b.id ? -1 : 1));

  /** YouTube only answers once asked to; Vimeo announces itself unprompted. */
  const handshake = useCallback(() => {
    if (source.kind !== "youtube") return;
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
      "*",
    );
  }, [source.kind]);

  useEffect(() => {
    if (source.kind !== "youtube" && source.kind !== "vimeo") return;
    function onMessage(event: MessageEvent) {
      if (event.source && event.source === frameRef.current?.contentWindow) {
        answered.current = true;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [source.kind]);

  const seek = useCallback(
    (note: FootageNoteView) => {
      setActiveId(note.id);
      const at = note.atSeconds;

      if (source.kind === "file") {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = at;
        // Rejects when the browser wants a gesture it doesn't count the click
        // as; seeking already happened either way, so there is nothing to say.
        void video.play().catch(() => {});
        return;
      }

      const frame = frameRef.current?.contentWindow;
      if (!frame || !answered.current) {
        setReload((prev) => ({ at, nonce: (prev?.nonce ?? 0) + 1 }));
        return;
      }

      if (source.kind === "youtube") {
        frame.postMessage(
          JSON.stringify({ event: "command", func: "seekTo", args: [at, true] }),
          "*",
        );
        frame.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      } else if (source.kind === "vimeo") {
        frame.postMessage(JSON.stringify({ method: "setCurrentTime", value: at }), "*");
        frame.postMessage(JSON.stringify({ method: "play" }), "*");
      }
    },
    [source],
  );

  const embedSrc =
    source.kind === "youtube" || source.kind === "vimeo"
      ? (reload && embedAt(source, reload.at)) || source.embed
      : null;

  return (
    <div className="space-y-3">
      {footage.title && <p className="text-sm font-semibold text-ink-900">{footage.title}</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {source.kind === "file" && (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-lg bg-black"
            >
              <source src={source.src} />
            </video>
          )}

          {embedSrc && (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                // Remounting is what seeks a player that hasn't answered yet.
                key={reload?.nonce ?? 0}
                ref={frameRef}
                src={embedSrc}
                title={footage.title ?? "Session footage"}
                onLoad={() => {
                  answered.current = false;
                  handshake();
                }}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {source.kind === "unknown" && (
            <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-center">
              <p className="text-sm text-ink-700">
                This film is hosted somewhere the player can&apos;t open, so the notes below
                can&apos;t jump to a moment. Open it in a new tab and use the timecodes.
              </p>
            </div>
          )}

          <a
            href={footage.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block truncate text-xs font-medium text-maroon-700 hover:underline"
          >
            {footage.url}
          </a>
        </div>

        <div className="lg:col-span-2">
          <p className="section-title mb-1">Feedback at the moment</p>
          {notes.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing pinned to this film yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {notes.map((note) => {
                const seekable = source.kind !== "unknown";
                return (
                  <li
                    key={note.id}
                    className={`rounded-lg border px-3 py-2 ${
                      activeId === note.id
                        ? "border-maroon-300 bg-maroon-50"
                        : "border-ink-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {seekable ? (
                        <button
                          type="button"
                          onClick={() => seek(note)}
                          className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-maroon-700 hover:bg-maroon-100"
                          aria-label={`Play from ${formatTimecode(note.atSeconds)}`}
                        >
                          {formatTimecode(note.atSeconds)}
                        </button>
                      ) : (
                        <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-600">
                          {formatTimecode(note.atSeconds)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="prose-note text-sm">{note.body}</p>
                        {note.author && (
                          <p className="mt-0.5 text-xs text-ink-500">{note.author}</p>
                        )}
                      </div>
                    </div>
                    {noteActions?.(note)}
                  </li>
                );
              })}
            </ol>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
