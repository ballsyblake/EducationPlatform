-- Football Queensland's review and appeal cycle.
--
-- The rating a club receives is *preliminary*. From FQ's process document:
-- clubs have 8 days to request a review of specific line items, the Club
-- Assessment Unit responds within 10 working days revising or preserving each
-- score, the club may appeal to the CEO within 3 working days, and the CEO has
-- 8 working days to rule. "If there is no review request, the club assessment
-- score is set and final (Confirmed) after the review timeframe has lapsed."
--
-- Nothing existed for any of this, which meant the portal treated release as
-- the end of the process when FQ treats it as the start of a bounded challenge
-- window — and a club could publish a shield it had not yet had confirmed.
--
-- One request per assessment, by unique key: FQ's process is a single round,
-- and allowing a second would turn a bounded process into an open one.
--
-- No data migration is needed. New AssessmentStatus values (IN_REVIEW,
-- UNDER_APPEAL, CONFIRMED) are additive — SQLite stores enums as TEXT, so
-- existing PUBLISHED rows keep their meaning, which is now stated explicitly as
-- "the preliminary rating has been released".

-- CreateTable
CREATE TABLE "ReviewRequest" (
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
    "percentBefore" REAL,
    "shieldBefore" TEXT,
    CONSTRAINT "ReviewRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewRequest_appealDecidedById_fkey" FOREIGN KEY ("appealDecidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_assessmentId_key" ON "ReviewRequest"("assessmentId");

-- CreateIndex
CREATE INDEX "ReviewRequest_status_idx" ON "ReviewRequest"("status");

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "clubComment" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "scoreBefore" INTEGER,
    "scoreAfter" INTEGER,
    "response" TEXT,
    CONSTRAINT "ReviewItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ReviewRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewItem_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_requestId_criterionId_key" ON "ReviewItem"("requestId", "criterionId");

-- CreateIndex
CREATE INDEX "ReviewItem_requestId_idx" ON "ReviewItem"("requestId");
