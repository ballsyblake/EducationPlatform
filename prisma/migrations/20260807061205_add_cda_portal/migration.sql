-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "zone" TEXT,
    "tier" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClubMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "opensAt" DATETIME,
    "closesAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicalWeight" INTEGER NOT NULL DEFAULT 30,
    "planningWeight" INTEGER NOT NULL DEFAULT 20,
    "deliveryWeight" INTEGER NOT NULL DEFAULT 30,
    "outcomesWeight" INTEGER NOT NULL DEFAULT 20,
    "bronzeMin" INTEGER NOT NULL DEFAULT 40,
    "silverMin" INTEGER NOT NULL DEFAULT 55,
    "goldMin" INTEGER NOT NULL DEFAULT 70,
    "platinumMin" INTEGER NOT NULL DEFAULT 85
);

-- CreateTable
CREATE TABLE "ClubAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "clubSubmittedAt" DATETIME,
    "lockedAt" DATETIME,
    "lockedById" TEXT,
    "publishedAt" DATETIME,
    "finalPercent" REAL,
    "technicalPct" REAL,
    "planningPct" REAL,
    "deliveryPct" REAL,
    "outcomesPct" REAL,
    "finalShield" TEXT,
    "eligible" BOOLEAN,
    "summary" TEXT,
    CONSTRAINT "ClubAssessment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessorAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "AssessorAssignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessorAssignment_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "stream" TEXT NOT NULL DEFAULT 'OUTFIELD',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "staffRole" TEXT NOT NULL,
    "qualificationId" TEXT,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "employment" TEXT NOT NULL DEFAULT 'VOLUNTEER',
    "gender" TEXT NOT NULL DEFAULT 'UNDISCLOSED',
    "blueCard" BOOLEAN NOT NULL DEFAULT false,
    "blueCardExpiry" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffMember_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StaffMember_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "oneStarAt" INTEGER NOT NULL DEFAULT 1,
    "twoStarAt" INTEGER NOT NULL DEFAULT 2,
    "threeStarAt" INTEGER NOT NULL DEFAULT 3
);

-- CreateTable
CREATE TABLE "SubCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "criterionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SubCriterion_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessorScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssessorScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessorScore_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessorScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scoreId" TEXT NOT NULL,
    "subCriterionId" TEXT NOT NULL,
    CONSTRAINT "ScoreEvidence_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "AssessorScore" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreEvidence_subCriterionId_fkey" FOREIGN KEY ("subCriterionId") REFERENCES "SubCriterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinalScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "rationale" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinalScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinalScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinalScore_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NonNegotiable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceHint" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "NonNegotiableResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "nonNegotiableId" TEXT NOT NULL,
    "clubDeclared" BOOLEAN,
    "clubNote" TEXT,
    "verdict" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NonNegotiableResult_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NonNegotiableResult_nonNegotiableId_fkey" FOREIGN KEY ("nonNegotiableId") REFERENCES "NonNegotiable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NonNegotiableResult_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" REAL,
    "priorValue" REAL,
    "note" TEXT,
    CONSTRAINT "ClubMetric_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    CONSTRAINT "Upload_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_nonNegotiableResultId_fkey" FOREIGN KEY ("nonNegotiableResultId") REFERENCES "NonNegotiableResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Upload" ("createdAt", "data", "filename", "id", "mimeType", "size", "submissionId") SELECT "createdAt", "data", "filename", "id", "mimeType", "size", "submissionId" FROM "Upload";
DROP TABLE "Upload";
ALTER TABLE "new_Upload" RENAME TO "Upload";
CREATE INDEX "Upload_submissionId_idx" ON "Upload"("submissionId");
CREATE INDEX "Upload_staffMemberId_idx" ON "Upload"("staffMemberId");
CREATE INDEX "Upload_nonNegotiableResultId_idx" ON "Upload"("nonNegotiableResultId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "Club_zone_idx" ON "Club"("zone");

-- CreateIndex
CREATE INDEX "ClubMembership_clubId_idx" ON "ClubMembership"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMembership_userId_clubId_key" ON "ClubMembership"("userId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_year_key" ON "Cycle"("year");

-- CreateIndex
CREATE INDEX "ClubAssessment_cycleId_idx" ON "ClubAssessment"("cycleId");

-- CreateIndex
CREATE INDEX "ClubAssessment_status_idx" ON "ClubAssessment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubAssessment_clubId_cycleId_key" ON "ClubAssessment"("clubId", "cycleId");

-- CreateIndex
CREATE INDEX "AssessorAssignment_assessorId_idx" ON "AssessorAssignment"("assessorId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessorAssignment_assessmentId_assessorId_key" ON "AssessorAssignment"("assessmentId", "assessorId");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_code_key" ON "Qualification"("code");

-- CreateIndex
CREATE INDEX "StaffMember_assessmentId_idx" ON "StaffMember"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Criterion_code_key" ON "Criterion"("code");

-- CreateIndex
CREATE INDEX "Criterion_domain_idx" ON "Criterion"("domain");

-- CreateIndex
CREATE INDEX "SubCriterion_criterionId_idx" ON "SubCriterion"("criterionId");

-- CreateIndex
CREATE INDEX "AssessorScore_assessmentId_idx" ON "AssessorScore"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessorScore_assessorId_idx" ON "AssessorScore"("assessorId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessorScore_assessmentId_assessorId_criterionId_key" ON "AssessorScore"("assessmentId", "assessorId", "criterionId");

-- CreateIndex
CREATE INDEX "ScoreEvidence_subCriterionId_idx" ON "ScoreEvidence"("subCriterionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEvidence_scoreId_subCriterionId_key" ON "ScoreEvidence"("scoreId", "subCriterionId");

-- CreateIndex
CREATE INDEX "FinalScore_assessmentId_idx" ON "FinalScore"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalScore_assessmentId_criterionId_key" ON "FinalScore"("assessmentId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "NonNegotiable_code_key" ON "NonNegotiable"("code");

-- CreateIndex
CREATE INDEX "NonNegotiableResult_assessmentId_idx" ON "NonNegotiableResult"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NonNegotiableResult_assessmentId_nonNegotiableId_key" ON "NonNegotiableResult"("assessmentId", "nonNegotiableId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMetric_assessmentId_key_key" ON "ClubMetric"("assessmentId", "key");
