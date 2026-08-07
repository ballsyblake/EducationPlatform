import { NextResponse, type NextRequest } from "next/server";
import { canAccessUpload } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  // Authorize against the metadata first, so an unauthorized request never
  // pulls the file contents out of the database.
  const upload = await canAccessUpload(user, id);
  if (!upload) return new NextResponse("Not found", { status: 404 });

  const stored = await prisma.upload.findUnique({
    where: { id },
    select: { data: true },
  });
  if (!stored) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(stored.data), {
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Length": String(stored.data.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(
        upload.filename,
      )}"`,
      // Private: these URLs are per-user authorized, never shared caches.
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
