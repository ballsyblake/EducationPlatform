-- Lets a tier state its own Technical Qualifications maximum, and moves the
-- cycle default to Football Queensland's own figure of 330.
--
-- A Tier 2 club is assessed on 18 line items where Tier 1 gets 54. Holding
-- Technical at the same fixed maximum made it 44% of a Tier 2 rating instead of
-- roughly a quarter, purely because the rest of the catalogue got smaller.
-- AlterTable
ALTER TABLE "Tier" ADD COLUMN "technicalMaxPoints" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "opensAt" DATETIME,
    "closesAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicalMaxPoints" INTEGER NOT NULL DEFAULT 330,
    "bronzeMin" INTEGER NOT NULL DEFAULT 40,
    "silverMin" INTEGER NOT NULL DEFAULT 55,
    "goldMin" INTEGER NOT NULL DEFAULT 70,
    "platinumMin" INTEGER NOT NULL DEFAULT 85
);
INSERT INTO "new_Cycle" ("bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "platinumMin", "silverMin", "status", "technicalMaxPoints", "year") SELECT "bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "platinumMin", "silverMin", "status", "technicalMaxPoints", "year" FROM "Cycle";
DROP TABLE "Cycle";
ALTER TABLE "new_Cycle" RENAME TO "Cycle";
CREATE UNIQUE INDEX "Cycle_year_key" ON "Cycle"("year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

