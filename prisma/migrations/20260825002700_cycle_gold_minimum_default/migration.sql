-- Aligns a column default that drifted out of the migration history.
--
-- Moving Gold from 70% to 85% (three_shields_and_development_badge) rewrote the
-- Gold minimum on every unpublished cycle, but only in the data — the column
-- default was left at 70. Any cycle created since has been born with the wrong
-- Gold threshold until the CDU noticed and edited it, and every migration
-- generated since has carried this rebuild along as noise.
--
-- Rebuilding the table is the only way to change a default in SQLite. Every
-- column is copied, so no cycle loses its own thresholds.
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
    "goldMin" INTEGER NOT NULL DEFAULT 75
);
INSERT INTO "new_Cycle" ("bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "silverMin", "status", "technicalMaxPoints", "year") SELECT "bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "silverMin", "status", "technicalMaxPoints", "year" FROM "Cycle";
DROP TABLE "Cycle";
ALTER TABLE "new_Cycle" RENAME TO "Cycle";
CREATE UNIQUE INDEX "Cycle_year_key" ON "Cycle"("year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
