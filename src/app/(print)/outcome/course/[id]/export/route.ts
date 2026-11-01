import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { shortCourseTitle } from "@/lib/coaches";
import { courseOutcomeSheets } from "@/lib/outcome";
import { docxFilename, outcomeDocx } from "@/lib/outcome-docx";

/**
 * Every coach on a course, one sheet each, as a Word file.
 *
 * The shape FQ already circulate — twenty-five coaches in one document — and
 * the reason the cover page exists. `assertCourseStaff` rather than
 * `requireStaff` alone: this is a whole cohort's assessments in one download,
 * and being staff somewhere is not being staff here.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  await assertCourseStaff(user, id);

  const { course, sheets } = await courseOutcomeSheets(id);
  const file = await outcomeDocx(sheets, course.title);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="assessments.docx"; filename*=UTF-8''${encodeURIComponent(
        docxFilename(shortCourseTitle(course.title), "coach assessments"),
      )}`,
      "Cache-Control": "no-store",
    },
  });
}
