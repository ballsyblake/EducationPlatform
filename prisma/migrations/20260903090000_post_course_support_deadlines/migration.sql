-- Post-course support: deadlines, extensions, and a history.
--
-- The support half of this schema modelled the assessment and nothing around
-- it, so the coach education team kept the rest in a spreadsheet: three sheets,
-- 77 coaches, four cohorts. This is that spreadsheet, and the point of it is
-- that seventeen of the twenty-eight open cases are already past a deadline the
-- database has never known about.
--
-- What arrives here:
--
--   Course.supportDeadline   The cohort's date, set once and inherited by every
--                            case opened on the course. Stored rather than
--                            computed from the last delivery day: the dates FQ
--                            actually uses are decisions, not arithmetic, and a
--                            derived deadline would move on its own the day
--                            somebody corrected a date in a register — a date
--                            that decides whether a coach passed.
--
--   SupportCase.deadline     One coach's own date, when it isn't the cohort's.
--
--   SupportExtension         A request to move a deadline, and what came back.
--                            A row rather than a mutable date because the sheet
--                            carried two different things in one column —
--                            "extension granted" with a later date, and "asked
--                            FA for an extension" with no date at all — and one
--                            field can only hold the first.
--
--   SupportActivity          The Notes column, which was never a note. One cell
--                            held four dated entries by one educator and was
--                            the only record of who did what. Each entry
--                            carries the day it happened, which is routinely
--                            earlier than the day it was typed.
--
--   SupportCase.educatorName Support is sometimes given by somebody who will
--                            never have an account here — a technical director
--                            at another federation, or two people sharing it.
--                            Nullable account, name beside it, the same shape
--                            as CourseStaff.
--
--   SupportCase.plan         The prescribed support, in the words it was
--                            prescribed in.
--
--   availability*            What the coach said about being visited, replacing
--                            a separate Microsoft Form. Their club and age
--                            group are deliberately absent: the enrolment
--                            already carries both.
--
-- SupportCaseStatus gains LAPSED — the deadline passed and nothing was ever
-- submitted. SQLite holds enums as TEXT, so that needs no DDL; it is named here
-- because the schema is the only other place it appears. It is not
-- UNSUCCESSFUL, which asserts a delivery was assessed and fell short, and it is
-- not WITHDRAWN, which asserts the coach left.
--
-- Additive throughout. Every new column is nullable, every new table is new, so
-- this is ALTER TABLE ADD COLUMN and CREATE TABLE with no rebuild of any
-- existing table — nothing is copied, nothing is dropped, and 77 historical
-- records plus live production data are untouched.
--
-- Nothing is backfilled. The cohort deadlines live in the spreadsheet and
-- arrive with the import behind this; a guess written here would be
-- indistinguishable from a decision afterwards. See the note at the foot of
-- this file for the derivation to run deliberately, if you want a starting
-- point to correct.
--
-- One thing deliberately absent: there is no stored "deadline in force". It is
-- the latest granted extension, falling back to the case's date, falling back
-- to the course's — three tables deep, and a column caching it would be a
-- fourth copy to keep true. At tens of open cases the resolution belongs in
-- application code. Revisit if open cases ever reach the low thousands.

-- AlterTable
ALTER TABLE "Course" ADD COLUMN "supportDeadline" DATETIME;

-- AlterTable
ALTER TABLE "SupportCase" ADD COLUMN "availabilityAt" DATETIME;
ALTER TABLE "SupportCase" ADD COLUMN "availabilityDay" TEXT;
ALTER TABLE "SupportCase" ADD COLUMN "availabilityNote" TEXT;
ALTER TABLE "SupportCase" ADD COLUMN "availabilityTime" TEXT;
ALTER TABLE "SupportCase" ADD COLUMN "deadline" DATETIME;
ALTER TABLE "SupportCase" ADD COLUMN "educatorName" TEXT;
ALTER TABLE "SupportCase" ADD COLUMN "plan" TEXT;

-- CreateTable
CREATE TABLE "SupportExtension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedUntil" DATETIME NOT NULL,
    "grantedUntil" DATETIME,
    "reason" TEXT,
    "decidedBy" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "requestedById" TEXT,
    CONSTRAINT "SupportExtension_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportExtension_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "occurredAt" DATETIME NOT NULL,
    "detail" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    CONSTRAINT "SupportActivity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportActivity_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SupportExtension_caseId_idx" ON "SupportExtension"("caseId");

-- CreateIndex
CREATE INDEX "SupportExtension_status_idx" ON "SupportExtension"("status");

-- CreateIndex
CREATE INDEX "SupportExtension_requestedById_idx" ON "SupportExtension"("requestedById");

-- CreateIndex
CREATE INDEX "SupportActivity_caseId_occurredAt_idx" ON "SupportActivity"("caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "SupportActivity_recordedById_idx" ON "SupportActivity"("recordedById");

-- CreateIndex
CREATE INDEX "SupportCase_status_deadline_idx" ON "SupportCase"("status", "deadline");

-- CreateIndex
CREATE INDEX "SupportCase_educatorId_status_idx" ON "SupportCase"("educatorId", "status");


-- Not run here. If you want the cohort deadlines seeded from the registers
-- rather than typed in, this sets each course's date to six months after its
-- last delivery day, for courses that have days and no deadline yet. Run it
-- once, deliberately, and then correct it — FQ's real dates are close to this
-- but not equal to it.
--
--   UPDATE "Course"
--      SET "supportDeadline" = (
--            SELECT datetime(MAX(d."date"), '+6 months')
--              FROM "CourseDay" d
--             WHERE d."courseId" = "Course"."id"
--          )
--    WHERE "supportDeadline" IS NULL
--      AND EXISTS (SELECT 1 FROM "CourseDay" d WHERE d."courseId" = "Course"."id");
