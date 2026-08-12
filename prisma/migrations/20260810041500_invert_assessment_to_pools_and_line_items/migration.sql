-- Inverts the assessment model.
--
-- Assessors were assigned to a club and scored every criterion on it.
-- Football Queensland does the opposite: an assessor takes one line item across
-- every club in a pool, which is what keeps the standard consistent between
-- clubs. AssessorAssignment is therefore replaced by CriterionAssignment
-- (pool x criterion x slot) and clubs gain a pool.
--
-- AssessorAssignment is dropped rather than converted. Its rows say "this
-- person covered this club", which carries no information about which line
-- items they should now hold — any conversion would be invention. Re-assign
-- from the CDU screens after deploying. Scores already recorded are untouched:
-- AssessorScore is keyed on assessment + assessor + criterion, which is
-- unchanged by this migration.
-- DropIndex
DROP INDEX "AssessorAssignment_assessmentId_assessorId_key";

-- DropIndex
DROP INDEX "AssessorAssignment_assessorId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AssessorAssignment";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Pool_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CriterionAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poolId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "CriterionAssignment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CriterionAssignment_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CriterionAssignment_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClubAssessment" (
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
    "poolId" TEXT,
    CONSTRAINT "ClubAssessment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClubAssessment" ("clubId", "clubSubmittedAt", "cycleId", "deliveryPct", "eligible", "finalPercent", "finalShield", "id", "lockedAt", "lockedById", "outcomesPct", "planningPct", "publishedAt", "status", "summary", "technicalPct") SELECT "clubId", "clubSubmittedAt", "cycleId", "deliveryPct", "eligible", "finalPercent", "finalShield", "id", "lockedAt", "lockedById", "outcomesPct", "planningPct", "publishedAt", "status", "summary", "technicalPct" FROM "ClubAssessment";
DROP TABLE "ClubAssessment";
ALTER TABLE "new_ClubAssessment" RENAME TO "ClubAssessment";
CREATE INDEX "ClubAssessment_cycleId_idx" ON "ClubAssessment"("cycleId");
CREATE INDEX "ClubAssessment_status_idx" ON "ClubAssessment"("status");
CREATE INDEX "ClubAssessment_poolId_idx" ON "ClubAssessment"("poolId");
CREATE UNIQUE INDEX "ClubAssessment_clubId_cycleId_key" ON "ClubAssessment"("clubId", "cycleId");
CREATE TABLE "new_Criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'EVIDENCE',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "oneStarAt" INTEGER NOT NULL DEFAULT 1,
    "twoStarAt" INTEGER NOT NULL DEFAULT 2,
    "threeStarAt" INTEGER NOT NULL DEFAULT 3
);
INSERT INTO "new_Criterion" ("active", "code", "description", "domain", "id", "oneStarAt", "position", "threeStarAt", "title", "twoStarAt", "weight") SELECT "active", "code", "description", "domain", "id", "oneStarAt", "position", "threeStarAt", "title", "twoStarAt", "weight" FROM "Criterion";
DROP TABLE "Criterion";
ALTER TABLE "new_Criterion" RENAME TO "Criterion";
CREATE UNIQUE INDEX "Criterion_code_key" ON "Criterion"("code");
CREATE INDEX "Criterion_domain_idx" ON "Criterion"("domain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Pool_cycleId_name_key" ON "Pool"("cycleId", "name");

-- CreateIndex
CREATE INDEX "CriterionAssignment_assessorId_idx" ON "CriterionAssignment"("assessorId");

-- CreateIndex
CREATE INDEX "CriterionAssignment_criterionId_idx" ON "CriterionAssignment"("criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionAssignment_poolId_criterionId_slot_key" ON "CriterionAssignment"("poolId", "criterionId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionAssignment_poolId_criterionId_assessorId_key" ON "CriterionAssignment"("poolId", "criterionId", "assessorId");

