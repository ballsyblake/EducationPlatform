-- Per-macro-area feedback on an assessment.
--
-- FQ's report carries a paragraph per area — Youth Development Plan, Match Day
-- Observations, and so on — and it is the part clubs act on. The area subtotals
-- themselves need no storage: they are computed from the criteria's area field,
-- which already exists.
-- CreateTable
CREATE TABLE "AreaNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "authorId" TEXT,
    CONSTRAINT "AreaNote_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AreaNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AreaNote_assessmentId_idx" ON "AreaNote"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AreaNote_assessmentId_domain_area_key" ON "AreaNote"("assessmentId", "domain", "area");

