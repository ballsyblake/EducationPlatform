-- The 2026 Info Pack: review rights, the Tier 2 rating bar, and On Notice.
--
-- Three corrections against Football Queensland's published 2026 Club
-- Development & Assessment Info Pack:
--
--   Cycle.developmentMin — Tier 2's own rating bar. "Development Committed
--   rating is awarded if minimum 55% is achieved out of the overall maximum
--   points" (p19). Its own column rather than a reuse of silverMin, which it
--   only happens to equal this year.
--
--   ReviewRequest.technical* — FQ allows one review of the Technical Staff
--   Qualifications score in both tiers (pp9, 20). It has no Criterion row
--   behind it, so it rides on the request.
--
--   NonNegotiableVerdict.ON_NOTICE needs no column change: SQLite stores enums
--   as TEXT, so only the generated client's validation moves.

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
    "goldMin" INTEGER NOT NULL DEFAULT 75,
    "developmentMin" INTEGER NOT NULL DEFAULT 55
);
INSERT INTO "new_Cycle" ("bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "silverMin", "status", "technicalMaxPoints", "year") SELECT "bronzeMin", "closesAt", "createdAt", "goldMin", "id", "name", "opensAt", "silverMin", "status", "technicalMaxPoints", "year" FROM "Cycle";
DROP TABLE "Cycle";
ALTER TABLE "new_Cycle" RENAME TO "Cycle";
CREATE UNIQUE INDEX "Cycle_year_key" ON "Cycle"("year");
CREATE TABLE "new_ReviewRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "respondedAt" DATETIME,
    "respondedById" TEXT,
    "response" TEXT,
    "appealedAt" DATETIME,
    "appeal" TEXT,
    "appealDecidedAt" DATETIME,
    "appealDecidedById" TEXT,
    "appealDecision" TEXT,
    "technicalRequested" BOOLEAN NOT NULL DEFAULT false,
    "technicalComment" TEXT,
    "technicalOutcome" TEXT NOT NULL DEFAULT 'PENDING',
    "technicalResponse" TEXT,
    "percentBefore" REAL,
    "shieldBefore" TEXT,
    CONSTRAINT "ReviewRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewRequest_appealDecidedById_fkey" FOREIGN KEY ("appealDecidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReviewRequest" ("appeal", "appealDecidedAt", "appealDecidedById", "appealDecision", "appealedAt", "assessmentId", "id", "percentBefore", "respondedAt", "respondedById", "response", "shieldBefore", "status", "submittedAt", "submittedById") SELECT "appeal", "appealDecidedAt", "appealDecidedById", "appealDecision", "appealedAt", "assessmentId", "id", "percentBefore", "respondedAt", "respondedById", "response", "shieldBefore", "status", "submittedAt", "submittedById" FROM "ReviewRequest";
DROP TABLE "ReviewRequest";
ALTER TABLE "new_ReviewRequest" RENAME TO "ReviewRequest";
CREATE UNIQUE INDEX "ReviewRequest_assessmentId_key" ON "ReviewRequest"("assessmentId");
CREATE INDEX "ReviewRequest_status_idx" ON "ReviewRequest"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

