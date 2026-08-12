-- Moves scoring from weighted domain averages to summed points.
--
-- Football Queensland adds up every line item's `score x weighting` and divides
-- by the maximum. A domain's influence is simply how many points it contains,
-- so the four domain weight columns on Cycle described something the rating no
-- longer does and are removed.
--
-- Technical Qualifications has no line items, so its maximum is stated instead:
-- technicalMaxPoints. That mirrors FQ, whose Technical maximum comes from a
-- table of team profiles rather than from the criteria.
--
-- Criterion gains maxScore (usually 3, sometimes 4) and fourStarAt, because
-- FQ's D8 awards four points and carries the heaviest weighting in Delivery.
--
-- Already-published assessments are unaffected: their percentages and shield
-- are frozen on the ClubAssessment row and are read back from there, never
-- recomputed.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'EVIDENCE',
    "weight" INTEGER NOT NULL DEFAULT 6,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxScore" INTEGER NOT NULL DEFAULT 3,
    "oneStarAt" INTEGER NOT NULL DEFAULT 1,
    "twoStarAt" INTEGER NOT NULL DEFAULT 2,
    "threeStarAt" INTEGER NOT NULL DEFAULT 3,
    "fourStarAt" INTEGER
);
INSERT INTO "new_Criterion" ("active", "code", "description", "domain", "id", "mode", "oneStarAt", "position", "threeStarAt", "title", "twoStarAt", "weight") SELECT "active", "code", "description", "domain", "id", "mode", "oneStarAt", "position", "threeStarAt", "title", "twoStarAt", "weight" FROM "Criterion";
DROP TABLE "Criterion";
ALTER TABLE "new_Criterion" RENAME TO "Criterion";
CREATE UNIQUE INDEX "Criterion_code_key" ON "Criterion"("code");
CREATE INDEX "Criterion_domain_idx" ON "Criterion"("domain");
CREATE TABLE "new_Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "opensAt" DATETIME,
    "closesAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicalMaxPoints" INTEGER NOT NULL DEFAULT 270,
    "bronzeMin" INTEGER NOT NULL DEFAULT 40,
    "silverMin" INTEGER NOT NULL DEFAULT 55,
    "goldMin" INTEGER NOT NULL DEFAULT 70,
    "platinumMin" INTEGER NOT NULL DEFAULT 85
);
INSERT INTO "new_Cycle" ("bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "platinumMin", "silverMin", "status", "year") SELECT "bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "platinumMin", "silverMin", "status", "year" FROM "Cycle";
DROP TABLE "Cycle";
ALTER TABLE "new_Cycle" RENAME TO "Cycle";
CREATE UNIQUE INDEX "Cycle_year_key" ON "Cycle"("year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

