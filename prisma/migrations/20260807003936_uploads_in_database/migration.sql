-- Move uploaded file contents from disk into the database.
--
-- Any rows predating this migration point at files under ./uploads that the new
-- code has no way to read, and `data` is NOT NULL, so they cannot be carried
-- over. They are deleted rather than backfilled with empty blobs, which would
-- leave the library showing downloads that silently produce a 0-byte file.
-- Course materials that lose their file are dropped with them; their submissions
-- keep any written response.
DELETE FROM "Material" WHERE "uploadId" IS NOT NULL;
DELETE FROM "Upload";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT,
    CONSTRAINT "Upload_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
DROP TABLE "Upload";
ALTER TABLE "new_Upload" RENAME TO "Upload";
CREATE INDEX "Upload_submissionId_idx" ON "Upload"("submissionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
