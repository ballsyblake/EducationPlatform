-- The attendance register, and Football Australia's rubric in place of a
-- percentage pass mark.
--
-- Football Queensland runs its AFC/FA diplomas off one spreadsheet per course:
-- nine delivery days, a roster, a catch-ups block, the CET team's attendance,
-- and an assessment sheet holding each coach's practical deliveries. This adds
-- the tables that register lives in, and moves the enrolment row to carry the
-- roster and result columns beside it.
--
-- Three conversions worth naming:
--
--   Course.passMark -> Course.ratingThreshold. The pass mark was a percentage
--   of coursework points, which is not how any of this is assessed: the rubric
--   rates a coach 1-5 and calls anything below 2.5 post-course support. Dropped
--   rather than converted, because there is no honest mapping from "70% of the
--   assignment points" onto a rating out of five.
--
--   SupportCase.referredPct -> referredRating, for the same reason. Both
--   columns were added days ago and have never held anything but seeded demo
--   values.
--
--   SupportRating.level -> SupportRating.rating. Converted, not dropped: see
--   the CASE below.

-- AlterTable
ALTER TABLE "SupportAttempt" ADD COLUMN "rating" REAL;

-- CreateTable
CREATE TABLE "CourseDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "dayNo" INTEGER NOT NULL,
    "weekday" TEXT,
    "date" DATETIME NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    CONSTRAINT "CourseDay_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseDayId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,
    CONSTRAINT "Attendance_courseDayId_fkey" FOREIGN KEY ("courseDayId") REFERENCES "CourseDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseStaff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CourseStaff_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StaffAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseDayId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,
    CONSTRAINT "StaffAttendance_courseDayId_fkey" FOREIGN KEY ("courseDayId") REFERENCES "CourseDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StaffAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "CourseStaff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticalDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "deliveryNo" INTEGER NOT NULL,
    "assessor" TEXT,
    "assessorId" TEXT,
    "block" TEXT,
    "component" TEXT,
    "topic" TEXT,
    "comment" TEXT,
    "actionPlan" TEXT,
    "rating" REAL,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticalDelivery_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticalDelivery_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "season" TEXT,
    "description" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,
    "ratingThreshold" REAL,
    "qualification" TEXT,
    "stream" TEXT,
    "location" TEXT,
    "venue" TEXT,
    CONSTRAINT "Course_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("authorId", "createdAt", "description", "id", "published", "season", "title") SELECT "authorId", "createdAt", "description", "id", "published", "season", "title" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
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
    "externalRef" TEXT,
    "attendanceMet" BOOLEAN,
    "journalComplete" BOOLEAN,
    "rating" REAL,
    "outcome" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "readiness" TEXT,
    "registerComments" TEXT,
    CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Enrollment" ("courseId", "createdAt", "id", "userId") SELECT "courseId", "createdAt", "id", "userId" FROM "Enrollment";
DROP TABLE "Enrollment";
ALTER TABLE "new_Enrollment" RENAME TO "Enrollment";
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");
CREATE INDEX "Enrollment_outcome_idx" ON "Enrollment"("outcome");
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");
CREATE TABLE "new_SupportCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "reason" TEXT,
    "referredRating" REAL,
    "attemptsAllowed" INTEGER NOT NULL DEFAULT 2,
    "educatorId" TEXT,
    "referredById" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "closingNote" TEXT,
    CONSTRAINT "SupportCase_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportCase_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupportCase_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SupportCase" ("attemptsAllowed", "closedAt", "closingNote", "courseId", "educatorId", "id", "openedAt", "reason", "referredById", "status", "userId") SELECT "attemptsAllowed", "closedAt", "closingNote", "courseId", "educatorId", "id", "openedAt", "reason", "referredById", "status", "userId" FROM "SupportCase";
DROP TABLE "SupportCase";
ALTER TABLE "new_SupportCase" RENAME TO "SupportCase";
CREATE INDEX "SupportCase_status_idx" ON "SupportCase"("status");
CREATE INDEX "SupportCase_userId_idx" ON "SupportCase"("userId");
CREATE INDEX "SupportCase_educatorId_idx" ON "SupportCase"("educatorId");
CREATE UNIQUE INDEX "SupportCase_courseId_userId_key" ON "SupportCase"("courseId", "userId");
CREATE TABLE "new_SupportRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rating" REAL NOT NULL,
    "comment" TEXT,
    CONSTRAINT "SupportRating_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SupportAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The three-level mark becomes a point on Football Australia's 1-5 scale.
-- Mapped rather than dropped: the middle of each old level is where it sits on
-- the new one, so a review somebody already wrote still reads back.
INSERT INTO "new_SupportRating" ("attemptId", "code", "comment", "id", "rating")
SELECT "attemptId", "code", "comment", "id",
       CASE "level"
           WHEN 'COMPETENT'  THEN 3.5
           WHEN 'DEVELOPING' THEN 2.5
           ELSE 1.5
       END
FROM "SupportRating";
DROP TABLE "SupportRating";
ALTER TABLE "new_SupportRating" RENAME TO "SupportRating";
CREATE INDEX "SupportRating_attemptId_idx" ON "SupportRating"("attemptId");
CREATE UNIQUE INDEX "SupportRating_attemptId_code_key" ON "SupportRating"("attemptId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CourseDay_courseId_idx" ON "CourseDay"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseDay_courseId_dayNo_key" ON "CourseDay"("courseId", "dayNo");

-- CreateIndex
CREATE INDEX "Attendance_enrollmentId_idx" ON "Attendance"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_courseDayId_enrollmentId_key" ON "Attendance"("courseDayId", "enrollmentId");

-- CreateIndex
CREATE INDEX "CourseStaff_courseId_idx" ON "CourseStaff"("courseId");

-- CreateIndex
CREATE INDEX "CourseStaff_userId_idx" ON "CourseStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStaff_courseId_role_key" ON "CourseStaff"("courseId", "role");

-- CreateIndex
CREATE INDEX "StaffAttendance_staffId_idx" ON "StaffAttendance"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_courseDayId_staffId_key" ON "StaffAttendance"("courseDayId", "staffId");

-- CreateIndex
CREATE INDEX "PracticalDelivery_enrollmentId_idx" ON "PracticalDelivery"("enrollmentId");

-- CreateIndex
CREATE INDEX "PracticalDelivery_assessorId_idx" ON "PracticalDelivery"("assessorId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticalDelivery_enrollmentId_deliveryNo_key" ON "PracticalDelivery"("enrollmentId", "deliveryNo");
