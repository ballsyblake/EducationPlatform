-- A coach's photo.
--
-- One current photo per account, replaced rather than accumulated: this is a
-- name badge for an educator standing on a pitch, not an album. It hangs off
-- User rather than Enrollment because the point of it is recognising the same
-- coach across courses and years.
--
-- `Upload.takenById` records whose hand was on the phone. An educator
-- photographing a roster on the touchline is handling somebody else's
-- likeness, and that belongs in the record rather than being inferred from a
-- timestamp.
--
-- Both tables are rebuilt because SQLite adds a foreign key no other way. No
-- data changes: every existing row keeps its columns and gains a null photo.

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
    "takenById" TEXT,
    CONSTRAINT "Upload_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_nonNegotiableResultId_fkey" FOREIGN KEY ("nonNegotiableResultId") REFERENCES "NonNegotiableResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_supportAttemptId_fkey" FOREIGN KEY ("supportAttemptId") REFERENCES "SupportAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Upload" ("createdAt", "data", "filename", "id", "mimeType", "nonNegotiableResultId", "size", "staffMemberId", "submissionId", "supportAttemptId") SELECT "createdAt", "data", "filename", "id", "mimeType", "nonNegotiableResultId", "size", "staffMemberId", "submissionId", "supportAttemptId" FROM "Upload";
DROP TABLE "Upload";
ALTER TABLE "new_Upload" RENAME TO "Upload";
CREATE INDEX "Upload_takenById_idx" ON "Upload"("takenById");
CREATE INDEX "Upload_submissionId_idx" ON "Upload"("submissionId");
CREATE INDEX "Upload_staffMemberId_idx" ON "Upload"("staffMemberId");
CREATE INDEX "Upload_nonNegotiableResultId_idx" ON "Upload"("nonNegotiableResultId");
CREATE INDEX "Upload_supportAttemptId_idx" ON "Upload"("supportAttemptId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "role" TEXT NOT NULL DEFAULT 'COACH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assesses" BOOLEAN NOT NULL DEFAULT false,
    "photoId" TEXT,
    CONSTRAINT "User_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Upload" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("active", "assesses", "createdAt", "email", "id", "name", "role", "title") SELECT "active", "assesses", "createdAt", "email", "id", "name", "role", "title" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_photoId_key" ON "User"("photoId");
CREATE INDEX "User_role_idx" ON "User"("role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

