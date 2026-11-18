-- The coach register: every coach FQ holds a qualification for, not only the
-- ones this platform has run a cohort for.
--
-- Three tables and one column, and the reason for each is the spreadsheet this
-- replaces. Coach_DB.xlsx kept the FA learning system's qualification export on
-- one sheet, FQ's own internal ratings on another, and joined them with a
-- VLOOKUP on email. A VLOOKUP is not a join: of the 548 ratings on the second
-- sheet, 212 had reached the first, and the other 336 sat behind a "No rating"
-- that nothing would ever have reconciled. The ratings are the only data in the
-- file that is FQ's own and exists nowhere upstream, and they were the data
-- being lost.
--
--   Affiliate           The 413-row affiliate list, so a club stops being free
--                       text. Deliberately not the CDA's Club table: that is
--                       the clubs being rated this cycle, a different and much
--                       smaller thing, and the two products share an account
--                       system and nothing else.
--   CoachRecord         What FQ knows and no export does — the club, the
--                       region, the internal rating, whether somebody still
--                       coaches, whether they have been asked about the B
--                       Diploma. One row per account, and an import may fill a
--                       field in but never blank one.
--   CoachQualification  One row per qualification rather than a cell holding
--                       "C Diploma;GoalKeeping B Diploma", which could not be
--                       filtered, sorted or counted. A cache of FALC: an import
--                       replaces a coach's rows outright, which is safe only
--                       because nothing of FQ's own is stored on it.
--   User.faNumber       The FA number on the account rather than only on an
--                       enrolment, because it identifies the person across
--                       intakes and survives a change of address.
--
-- Nothing is backfilled. Loading real coaches' records is a deliberate act
-- taken through /admin/coach-db, not a side effect of a deploy.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "faNumber" TEXT;

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CoachRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "affiliateId" TEXT,
    "clubName" TEXT,
    "region" TEXT,
    "internalRating" REAL,
    "ratingSource" TEXT,
    "ratingAt" DATETIME,
    "coachingStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "statusNote" TEXT,
    "bDiplomaInterest" TEXT NOT NULL DEFAULT 'NOT_ASKED',
    "bDiplomaInterestAt" DATETIME,
    "bDiplomaInterestNote" TEXT,
    "source" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoachRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachRecord_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachQualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "completedAt" DATETIME,
    "expiresAt" DATETIME,
    "status" TEXT,
    "cpd" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoachQualification_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CoachRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_slug_key" ON "Affiliate"("slug");

-- CreateIndex
CREATE INDEX "Affiliate_region_idx" ON "Affiliate"("region");

-- CreateIndex
CREATE UNIQUE INDEX "CoachRecord_userId_key" ON "CoachRecord"("userId");

-- CreateIndex
CREATE INDEX "CoachRecord_affiliateId_idx" ON "CoachRecord"("affiliateId");

-- CreateIndex
CREATE INDEX "CoachRecord_region_idx" ON "CoachRecord"("region");

-- CreateIndex
CREATE INDEX "CoachRecord_coachingStatus_idx" ON "CoachRecord"("coachingStatus");

-- CreateIndex
CREATE INDEX "CoachRecord_bDiplomaInterest_idx" ON "CoachRecord"("bDiplomaInterest");

-- CreateIndex
CREATE INDEX "CoachQualification_name_idx" ON "CoachQualification"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CoachQualification_recordId_name_key" ON "CoachQualification"("recordId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_faNumber_key" ON "User"("faNumber");

