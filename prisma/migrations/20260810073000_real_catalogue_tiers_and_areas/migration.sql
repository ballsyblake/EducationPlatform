-- Adds assessment tiers, macro-areas, and a provisional-evidence flag.
--
-- Football Queensland assesses Tier 2 clubs on a subset of the same coded line
-- items Tier 1 clubs get — same codes, same wording, fewer of them — so a
-- club's maximum points depend on its tier. Tier therefore has to be data, and
-- criteria hang off it.
--
-- Criterion.area carries FQ's macro-areas (Youth Development Plan, Match Day
-- Observations, and so on). Their report is structured around these: each
-- carries its own subtotal, grade and paragraph of feedback.
--
-- evidenceProvisional marks the items whose evidence points are this project's
-- wording rather than FQ's. The Delivery items come from FQ's own assessment
-- workbook; Planning and Outcomes do not, and the app says so rather than
-- letting a placeholder pass as the real rubric.
-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "_CriterionToTier" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_CriterionToTier_A_fkey" FOREIGN KEY ("A") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_CriterionToTier_B_fkey" FOREIGN KEY ("B") REFERENCES "Tier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "tierId" TEXT,
    CONSTRAINT "ClubAssessment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClubAssessment_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClubAssessment" ("clubId", "clubSubmittedAt", "cycleId", "deliveryPct", "eligible", "finalPercent", "finalShield", "id", "lockedAt", "lockedById", "outcomesPct", "planningPct", "poolId", "publishedAt", "status", "summary", "technicalPct") SELECT "clubId", "clubSubmittedAt", "cycleId", "deliveryPct", "eligible", "finalPercent", "finalShield", "id", "lockedAt", "lockedById", "outcomesPct", "planningPct", "poolId", "publishedAt", "status", "summary", "technicalPct" FROM "ClubAssessment";
DROP TABLE "ClubAssessment";
ALTER TABLE "new_ClubAssessment" RENAME TO "ClubAssessment";
CREATE INDEX "ClubAssessment_cycleId_idx" ON "ClubAssessment"("cycleId");
CREATE INDEX "ClubAssessment_status_idx" ON "ClubAssessment"("status");
CREATE INDEX "ClubAssessment_poolId_idx" ON "ClubAssessment"("poolId");
CREATE INDEX "ClubAssessment_tierId_idx" ON "ClubAssessment"("tierId");
CREATE UNIQUE INDEX "ClubAssessment_clubId_cycleId_key" ON "ClubAssessment"("clubId", "cycleId");
CREATE TABLE "new_Criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'EVIDENCE',
    "area" TEXT,
    "evidenceProvisional" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 6,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxScore" INTEGER NOT NULL DEFAULT 3,
    "oneStarAt" INTEGER NOT NULL DEFAULT 1,
    "twoStarAt" INTEGER NOT NULL DEFAULT 2,
    "threeStarAt" INTEGER NOT NULL DEFAULT 3,
    "fourStarAt" INTEGER
);
INSERT INTO "new_Criterion" ("active", "code", "description", "domain", "fourStarAt", "id", "maxScore", "mode", "oneStarAt", "position", "threeStarAt", "title", "twoStarAt", "weight") SELECT "active", "code", "description", "domain", "fourStarAt", "id", "maxScore", "mode", "oneStarAt", "position", "threeStarAt", "title", "twoStarAt", "weight" FROM "Criterion";
DROP TABLE "Criterion";
ALTER TABLE "new_Criterion" RENAME TO "Criterion";
CREATE UNIQUE INDEX "Criterion_code_key" ON "Criterion"("code");
CREATE INDEX "Criterion_domain_idx" ON "Criterion"("domain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Tier_code_key" ON "Tier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "_CriterionToTier_AB_unique" ON "_CriterionToTier"("A", "B");

-- CreateIndex
CREATE INDEX "_CriterionToTier_B_index" ON "_CriterionToTier"("B");

