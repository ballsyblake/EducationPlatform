import { redirect } from "next/navigation";

/**
 * The grading queue is now one line on the assessor's own list.
 *
 * Kept as a redirect rather than deleted: this path is in the navigation
 * somebody learned, in a browser history, and in the breadcrumb of every
 * write-up page under it.
 */
export default function EducatorGradingPage() {
  redirect("/educator");
}
