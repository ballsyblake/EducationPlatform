/**
 * Session footage is a link, never an upload — film is hundreds of megabytes
 * and this app keeps its files as database rows.
 *
 * Shared by the coach's own submission and by the staff-side form that records
 * a link which arrived by email instead, so the two cannot disagree about what
 * counts as a usable link.
 */

/** Only http(s): the link is rendered on an educator's page, so no other scheme. */
export function normalizeVideoUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
