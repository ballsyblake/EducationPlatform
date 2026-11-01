import { requireStaff } from "@/lib/auth";
import { docxFilename, outcomeDocx } from "@/lib/outcome-docx";
import { outcomeSheetFor } from "@/lib/outcome";

/**
 * One coach's assessment sheet, as the Word file FQ circulate.
 *
 * A route handler rather than a page because the response is a download.
 * `outcomeSheetFor` does the scoping, so an educator off this coach's roster
 * gets the same 404 the page gives them rather than a file.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const user = await requireStaff();
  const { enrollmentId } = await params;
  const sheet = await outcomeSheetFor(user, enrollmentId);

  const file = await outcomeDocx([sheet]);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // `filename*` carries the real name: course titles hold em dashes and
      // accented club names, and the plain `filename` is the ASCII fallback
      // for whatever still cannot read it.
      "Content-Disposition": `attachment; filename="assessment.docx"; filename*=UTF-8''${encodeURIComponent(
        docxFilename(sheet.name, sheet.qualification),
      )}`,
      // The register changes under it, so a cached copy is a stale record.
      "Cache-Control": "no-store",
    },
  });
}
