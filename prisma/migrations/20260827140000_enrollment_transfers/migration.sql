-- Enrolment windows and transfers.
--
-- `joinedAt` / `leftAt` bound the days a coach was actually on a course, so
-- somebody who did Block 1 here and moved to another intake is not measured
-- against the six days they were never going to sit. `transferredToId` points
-- at the enrolment that continues theirs, one-to-one, so "transferred" can
-- never be recorded without saying where to.
--
-- Nothing is backfilled: the registers don't say who moved or when, so every
-- existing enrolment keeps a null window, which reads as "on the course for
-- all of it" — exactly what it meant before this migration.
--
-- CourseOutcome gains TRANSFERRED. SQLite holds enums as TEXT, so that needs
-- no column change; it is named here because the schema is the only other
-- place it appears.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Enrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER NOT NULL DEFAULT 0,
    "track" TEXT NOT NULL DEFAULT 'MAIN',
    "catchUpNote" TEXT,
    "ageAtCourse" INTEGER,
    "gender" TEXT,
    "clubName" TEXT,
    "coachingAgeGroup" TEXT,
    "enrolmentStatus" TEXT,
    "joinedAt" DATETIME,
    "leftAt" DATETIME,
    "transferredToId" TEXT,
    "transferNote" TEXT,
    "externalRef" TEXT,
    "attendanceMet" BOOLEAN,
    "journalComplete" BOOLEAN,
    "rating" REAL,
    "outcome" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "readiness" TEXT,
    "registerComments" TEXT,
    CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_transferredToId_fkey" FOREIGN KEY ("transferredToId") REFERENCES "Enrollment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Enrollment" ("ageAtCourse", "attendanceMet", "catchUpNote", "clubName", "coachingAgeGroup", "courseId", "createdAt", "enrolmentStatus", "externalRef", "gender", "id", "journalComplete", "outcome", "position", "rating", "readiness", "registerComments", "track", "userId") SELECT "ageAtCourse", "attendanceMet", "catchUpNote", "clubName", "coachingAgeGroup", "courseId", "createdAt", "enrolmentStatus", "externalRef", "gender", "id", "journalComplete", "outcome", "position", "rating", "readiness", "registerComments", "track", "userId" FROM "Enrollment";
DROP TABLE "Enrollment";
ALTER TABLE "new_Enrollment" RENAME TO "Enrollment";
CREATE UNIQUE INDEX "Enrollment_transferredToId_key" ON "Enrollment"("transferredToId");
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");
CREATE INDEX "Enrollment_outcome_idx" ON "Enrollment"("outcome");
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

