import { OutcomeSheetPage, PrintBar } from "@/components/outcome-sheet";
import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { courseOutcomeSheets } from "@/lib/outcome";

export const metadata = { title: "Coach assessments" };

/**
 * Every coach on a course, one sheet each.
 *
 * The shape of the file FQ already sends round — twenty-five coaches in one
 * document, a page apiece — which is why this exists alongside the single-coach
 * page rather than instead of it. `assertCourseStaff` rather than
 * `requireStaff`: being staff somewhere is not being staff on this course, and
 * this page is a whole cohort's assessments at once.
 */
export default async function CourseOutcomesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  await assertCourseStaff(user, id);

  const { course, sheets } = await courseOutcomeSheets(id);

  return (
    <>
      <PrintBar
        title={`${course.title} — coach assessments`}
        subtitle={`${sheets.length} coach${sheets.length === 1 ? "" : "es"}, one page each`}
      />
      {sheets.map((sheet) => (
        <OutcomeSheetPage key={sheet.enrollmentId} sheet={sheet} />
      ))}
      {sheets.length === 0 && (
        <p className="mx-auto max-w-[820px] bg-white p-8 text-sm text-ink-600">
          Nobody is enrolled on this course yet, so there is nothing to print.
        </p>
      )}
    </>
  );
}
