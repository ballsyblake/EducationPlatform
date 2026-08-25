import "server-only";

import { prisma } from "@/lib/db";

/**
 * Uploads are stored in the database rather than on disk, so the app runs
 * unchanged on hosts with an ephemeral filesystem.
 *
 * That puts a practical ceiling on file size: a row has to travel over the
 * database connection on every read. SQLite itself allows blobs up to 1 GB, but
 * hosted libSQL has undocumented wire limits, so the default here is
 * deliberately conservative. Raise MAX_UPLOAD_MB if you're running against a
 * local SQLite file; point film at YouTube/Vimeo either way.
 */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "text/"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

export class UploadError extends Error {}

function assertAllowed(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}. ` +
        "For film, add it as a video link instead of an upload.",
    );
  }
  const type = file.type || "application/octet-stream";
  const allowed =
    ALLOWED_MIME_TYPES.has(type) || ALLOWED_MIME_PREFIXES.some((p) => type.startsWith(p));
  if (!allowed) {
    throw new UploadError(`"${file.name}" is not an accepted file type (${type}).`);
  }
}

/** Strips any directory component so a crafted filename can't mislead a download. */
function safeName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 180) || "upload";
}

export async function storeUpload(
  file: File,
  opts: { submissionId?: string; supportAttemptId?: string } = {},
) {
  assertAllowed(file);

  const bytes = Buffer.from(await file.arrayBuffer());

  // Re-check post-read: File.size is client-supplied metadata until now.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `"${file.name}" is ${formatBytes(bytes.byteLength)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  return prisma.upload.create({
    data: {
      filename: safeName(file.name),
      mimeType: file.type || "application/octet-stream",
      size: bytes.byteLength,
      data: bytes,
      submissionId: opts.submissionId,
      supportAttemptId: opts.supportAttemptId,
    },
  });
}

export async function deleteUpload(uploadId: string) {
  await prisma.upload.delete({ where: { id: uploadId } }).catch(() => {
    // Already gone.
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
