-- Drop `Upload.takenById`.
--
-- It recorded which educator photographed a coach. Nobody wants it: the photo
-- is a name badge, and who held the phone is not a fact anybody has asked a
-- question of.
--
-- A separate migration rather than an edit to the one that added it, because
-- that one has been applied and rewriting an applied migration breaks its
-- checksum wherever it ran. SQLite drops a column by rebuilding the table.

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
    "staffMemberId" TEXT,
    "nonNegotiableResultId" TEXT,
    "supportAttemptId" TEXT,
    CONSTRAINT "Upload_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_nonNegotiableResultId_fkey" FOREIGN KEY ("nonNegotiableResultId") REFERENCES "NonNegotiableResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_supportAttemptId_fkey" FOREIGN KEY ("supportAttemptId") REFERENCES "SupportAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Upload" ("createdAt", "data", "filename", "id", "mimeType", "nonNegotiableResultId", "size", "staffMemberId", "submissionId", "supportAttemptId") SELECT "createdAt", "data", "filename", "id", "mimeType", "nonNegotiableResultId", "size", "staffMemberId", "submissionId", "supportAttemptId" FROM "Upload";
DROP TABLE "Upload";
ALTER TABLE "new_Upload" RENAME TO "Upload";
CREATE INDEX "Upload_submissionId_idx" ON "Upload"("submissionId");
CREATE INDEX "Upload_staffMemberId_idx" ON "Upload"("staffMemberId");
CREATE INDEX "Upload_nonNegotiableResultId_idx" ON "Upload"("nonNegotiableResultId");
CREATE INDEX "Upload_supportAttemptId_idx" ON "Upload"("supportAttemptId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

