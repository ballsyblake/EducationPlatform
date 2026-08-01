import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessUpload } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { absolutePathFor } from "@/lib/uploads";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const upload = await canAccessUpload(user, id);
  if (!upload) return new NextResponse("Not found", { status: 404 });

  const filePath = absolutePathFor(upload.storedName);
  const stats = await stat(filePath).catch(() => null);
  if (!stats) return new NextResponse("File is missing from storage", { status: 410 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Length": String(stats.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(
        upload.filename,
      )}"`,
      // Private: these URLs are per-user authorized, never shared caches.
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
