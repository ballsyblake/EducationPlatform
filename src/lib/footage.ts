/**
 * Session footage: timecodes, and what a player can do with a link.
 *
 * Deliberately pure and client-safe. The educator's form parses what they type,
 * the server action parses it again before writing, and the player formats it
 * back — three places that have to agree about what "1:07" means, so there is
 * one function for it rather than three near-misses.
 */

/** How long a recording may be pointed into: six hours, in seconds. */
export const MAX_AT_SECONDS = 6 * 60 * 60;

/**
 * A timecode as somebody writes it on a touchline, into whole seconds.
 *
 * Accepts `1:07`, `01:07`, `1:02:30` and a bare `67`. Returns null for anything
 * else — including a negative, and a minutes or seconds field past 59, because
 * `1:75` is a typo and guessing which half of it was meant is worse than
 * saying so.
 */
export function parseTimecode(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const parts = text.split(":");
  if (parts.length > 3) return null;
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return null;

  const nums = parts.map(Number);
  // Only the leading field may exceed 59: "90" is a minute and a half, and
  // "90:00" is an hour and a half.
  if (nums.slice(1).some((n) => n > 59)) return null;

  const seconds =
    nums.length === 1
      ? nums[0]
      : nums.length === 2
        ? nums[0] * 60 + nums[1]
        : nums[0] * 3600 + nums[1] * 60 + nums[2];

  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_AT_SECONDS) return null;
  return seconds;
}

/** Seconds back as `1:07`, or `1:02:30` once there is an hour of it. */
export function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * What kind of thing the link is, which decides how a note seeks into it.
 *
 * - `file` plays in a `<video>` element, where seeking is setting a property.
 * - `youtube` and `vimeo` play in an iframe, seekable by postMessage to the
 *   provider's player API — no third-party script loaded into the page.
 * - `unknown` is still worth keeping: a coach gets the link and the notes with
 *   their timecodes, which is the feedback. It just can't be clicked to seek.
 */
export type FootageSource =
  | { kind: "file"; src: string }
  | { kind: "youtube"; embed: string }
  | { kind: "vimeo"; embed: string }
  | { kind: "unknown" };

const MEDIA_EXTENSIONS = [".mp4", ".m4v", ".webm", ".ogv", ".ogg", ".mov"];

/**
 * Classifies a footage URL.
 *
 * The YouTube embed asks for `enablejsapi`, which is what makes `seekTo`
 * reachable; Vimeo's player answers postMessage without being asked. Both are
 * given `playsinline` so a phone doesn't take the video fullscreen and hide the
 * notes the coach is meant to be reading beside it.
 */
export function footageSource(raw: string): FootageSource {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "unknown" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "unknown" };

  const host = url.hostname.replace(/^www\./, "");

  const youtube = (id: string) =>
    ({
      kind: "youtube",
      embed: `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0`,
    }) as const;

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) return youtube(encodeURIComponent(v));
    const embedded = url.pathname.match(/^\/embed\/([\w-]+)/);
    if (embedded) return youtube(embedded[1]);
  }
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return youtube(encodeURIComponent(id));
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
    if (id) {
      return { kind: "vimeo", embed: `https://player.vimeo.com/video/${id}?playsinline=1` };
    }
  }

  const path = url.pathname.toLowerCase();
  if (MEDIA_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return { kind: "file", src: url.toString() };
  }

  return { kind: "unknown" };
}

/**
 * The same embed, told to start at a moment.
 *
 * The fallback for a player that hasn't answered postMessage yet — remounting
 * the iframe at the timecode always works, where a command sent at an iframe
 * that is still loading is dropped silently.
 */
export function embedAt(source: FootageSource, seconds: number): string | null {
  if (source.kind === "youtube") {
    return `${source.embed}&start=${Math.floor(seconds)}&autoplay=1`;
  }
  if (source.kind === "vimeo") {
    return `${source.embed}#t=${Math.floor(seconds)}s`;
  }
  return null;
}
