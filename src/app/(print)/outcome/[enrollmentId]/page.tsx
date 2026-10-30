import { OutcomeSheetPage, PrintBar } from "@/components/outcome-sheet";
import { requireStaff } from "@/lib/auth";
import { outcomeSheetFor } from "@/lib/outcome";

export const metadata = { title: "Coach assessment" };

/**
 * One coach's assessment outcome document.
 *
 * Reached from the assessment page, so an educator who has just written a
 * delivery up can hand the coach the same paperwork FQ circulates without
 * retyping any of it into a Word file.
 */
export default async function OutcomePage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const user = await requireStaff();
  const { enrollmentId } = await params;
  const sheet = await outcomeSheetFor(user, enrollmentId);

  return (
    <>
      <PrintBar
        title={`${sheet.name} — ${sheet.qualification} coach assessment`}
        subtitle={sheet.courseTitle}
        exportHref={`/outcome/${enrollmentId}/export`}
      />
      <OutcomeSheetPage sheet={sheet} />
    </>
  );
}
