-- AlterTable
ALTER TABLE "Course" ADD COLUMN "passMark" INTEGER;

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "reason" TEXT,
    "referredPct" INTEGER,
    "attemptsAllowed" INTEGER NOT NULL DEFAULT 2,
    "educatorId" TEXT,
    "referredById" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "closingNote" TEXT,
    CONSTRAINT "SupportCase_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportCase_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupportCase_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "pathway" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueAt" DATETIME,
    "venue" TEXT,
    "videoUrl" TEXT,
    "coachNotes" TEXT,
    "submittedAt" DATETIME,
    "outcome" TEXT,
    "feedback" TEXT,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportAttempt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportAttempt_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "comment" TEXT,
    CONSTRAINT "SupportRating_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SupportAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
-- SQLite can't add a foreign key to an existing table, so Upload is rebuilt to
-- carry the support-attempt reference. Every row and column is copied across.
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
INSERT INTO "new_Upload" ("createdAt", "data", "filename", "id", "mimeType", "nonNegotiableResultId", "size", "staffMemberId", "submissionId") SELECT "createdAt", "data", "filename", "id", "mimeType", "nonNegotiableResultId", "size", "staffMemberId", "submissionId" FROM "Upload";
DROP TABLE "Upload";
ALTER TABLE "new_Upload" RENAME TO "Upload";
CREATE INDEX "Upload_submissionId_idx" ON "Upload"("submissionId");
CREATE INDEX "Upload_staffMemberId_idx" ON "Upload"("staffMemberId");
CREATE INDEX "Upload_nonNegotiableResultId_idx" ON "Upload"("nonNegotiableResultId");
CREATE INDEX "Upload_supportAttemptId_idx" ON "Upload"("supportAttemptId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SupportCase_status_idx" ON "SupportCase"("status");

-- CreateIndex
CREATE INDEX "SupportCase_userId_idx" ON "SupportCase"("userId");

-- CreateIndex
CREATE INDEX "SupportCase_educatorId_idx" ON "SupportCase"("educatorId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportCase_courseId_userId_key" ON "SupportCase"("courseId", "userId");

-- CreateIndex
CREATE INDEX "SupportAttempt_status_idx" ON "SupportAttempt"("status");

-- CreateIndex
CREATE INDEX "SupportAttempt_caseId_idx" ON "SupportAttempt"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportAttempt_caseId_attemptNo_key" ON "SupportAttempt"("caseId", "attemptNo");

-- CreateIndex
CREATE INDEX "SupportRating_attemptId_idx" ON "SupportRating"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportRating_attemptId_code_key" ON "SupportRating"("attemptId", "code");
