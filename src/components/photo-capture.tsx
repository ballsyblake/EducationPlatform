"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { FormError, FormSuccess } from "@/components/ui";
import {
  removeCoachPhoto,
  setCoachPhoto,
  type PhotoState,
} from "@/app/(app)/actions/photos";

const idle: PhotoState = { status: "idle" };

/** The longest edge of a stored photo. A face on a register row, nothing more. */
const EDGE = 512;

/**
 * Shrinks a camera photo to a square thumbnail, in the browser.
 *
 * A phone takes three to five megabytes. A register showing twenty-five coaches
 * would pull a hundred of them on every load, and every byte would sit in the
 * database and travel the wire twice. Resizing here means the big file never
 * leaves the phone.
 *
 * The centre square is kept rather than the whole frame: these are taken
 * one-handed on a touchline, and a circle is what every screen draws.
 */
async function shrink(file: File): Promise<File> {
  const source = await loadImage(file);
  const edge = Math.min(source.width, source.height);
  const sx = (source.width - edge) / 2;
  const sy = (source.height - edge) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = EDGE;
  canvas.height = EDGE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't resize the photo.");
  ctx.drawImage(source, sx, sy, edge, edge, 0, 0, EDGE, EDGE);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) throw new Error("This browser can't resize the photo.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/** `createImageBitmap` where it exists, an `<img>` where it doesn't. */
async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    // Phone cameras record rotation in EXIF rather than in the pixels, so a
    // portrait photo arrives sideways unless the decoder is told to apply it.
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file isn't an image this browser can read."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Takes or replaces one coach's photo.
 *
 * `capture="environment"` is the whole of the camera story: on a phone it opens
 * the camera directly, and on a laptop the same control is an ordinary file
 * picker. No permissions prompt, no getUserMedia, nothing to install — which
 * matters when the person using it is standing on grass.
 */
export function PhotoCapture({
  user,
  compact = false,
}: {
  user: { id: string; name: string | null; email: string; photoId: string | null };
  compact?: boolean;
}) {
  const [state, save, saving] = useActionState(setCoachPhoto, idle);
  const [removed, remove, removing] = useActionState(removeCoachPhoto, idle);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setProblem(null);
    try {
      const small = await shrink(file);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(small);
      });
      const data = new FormData();
      data.set("userId", user.id);
      data.set("photo", small);
      // Inside a transition, because the resize is async and React only tracks
      // pending state for a dispatch it can see start — without this the
      // button never says "Saving…" on the slow connection this is used on.
      startTransition(() => save(data));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That photo couldn't be read.");
    } finally {
      // So picking the same file twice still fires a change.
      if (input.current) input.current.value = "";
    }
  }

  const busy = saving || removing;
  const showing = preview ?? (user.photoId ? `/api/files/${user.photoId}` : null);

  return (
    <div className={compact ? "flex items-center gap-3" : "flex items-start gap-4"}>
      {showing ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={showing}
          alt={user.name ?? user.email}
          className={`${compact ? "h-10 w-10" : "h-28 w-28"} shrink-0 rounded-full bg-ink-100 object-cover ${
            busy ? "opacity-50" : ""
          }`}
        />
      ) : (
        <Avatar user={user} size={compact ? "md" : "xl"} className={busy ? "opacity-50" : ""} />
      )}

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`btn-secondary btn-sm cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ? "Saving…" : showing ? "Retake" : "Take a photo"}
            <input
              ref={input}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPick(file);
              }}
            />
          </label>

          {user.photoId && (
            <form action={remove}>
              <input type="hidden" name="userId" value={user.id} />
              <button
                type="submit"
                disabled={busy}
                className="text-xs text-ink-500 underline hover:text-maroon-700 disabled:opacity-60"
              >
                Remove
              </button>
            </form>
          )}
        </div>

        {!compact && (
          <p className="mt-2 max-w-sm text-xs text-ink-500">
            Head and shoulders, so an educator on the grass knows who is who. Shown to coach
            education staff and to the coach themselves — never to other coaches. It can be
            replaced or removed here at any time.
          </p>
        )}

        <FormError message={problem ?? (state.status === "error" ? state.message : null)} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
        <FormError message={removed.status === "error" ? removed.message : null} />
        <FormSuccess message={removed.status === "ok" ? removed.message : null} />
      </div>
    </div>
  );
}
