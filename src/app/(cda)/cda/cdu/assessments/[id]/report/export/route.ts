import { NextResponse } from "next/server";
import { requireCdu } from "@/lib/cda/access";
import { loadAssessment } from "@/lib/cda/assessment";
import { buildReportWorkbook } from "@/lib/cda/report-workbook";

/**
 * The club's rating as a workbook, built fresh on every request.
 *
 * Nothing is stored. The scores live in the database and the sheet is a view
 * of them, so a download is always current and there is no stale copy on a
 * shared drive for somebody to work from by mistake — which is the failure the
 * old process had, with a per-club rubric sheet copied by hand from the
 * overall workbooks and no way to tell which one was behind.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCdu();
  const { id } = await params;
  const overview = await loadAssessment(id);

  const buffer = await buildReportWorkbook(overview);
  const filename = `${overview.assessment.club.name} ${overview.assessment.cycle.year} Rating.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(buffer.byteLength),
      // The ASCII fallback keeps older clients from choking on a club name
      // with an apostrophe or an accent; filename* carries the real one.
      "Content-Disposition": `attachment; filename="${filename.replace(
        /[^\x20-\x7e]/g,
        "_",
      )}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
