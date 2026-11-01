import { redirect } from "next/navigation";

/**
 * Post-course support is now one line on the assessor's own list.
 *
 * Only the reviewing half was ever an assessor's: booking a visit, chasing film
 * and recording somebody's availability are the program's, and they are still
 * on the desk at `/admin/support`. Kept as a redirect for the same reason as
 * the grading queue above it.
 */
export default function EducatorSupportPage() {
  redirect("/educator");
}
