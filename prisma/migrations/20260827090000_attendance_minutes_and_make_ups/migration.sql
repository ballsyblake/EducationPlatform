-- Attendance in minutes, and a ledger for the hours a coach owes.
--
-- Attendance.present becomes Attendance.minutes. The registers are full of part
-- days — "Missed Day 2 PM", "3 hours missed on Day 2", "1.5 hours Day 3" — and
-- a boolean rounds every one of them to a whole day in one direction or the
-- other. The workaround has been prose in the Comments column, which nothing
-- can total.
--
-- AttendanceMakeUp is where that time is tracked rather than described: one row
-- per debt, opened against the enrolment that is short and closed by pointing
-- at the attendance that covered it. That attendance usually sits on another
-- club's course, and this row is the only thing that knows the credit and the
-- debt are the same hours.
--
-- StaffAttendance is deliberately left as a boolean. The CET team's own
-- attendance is a roster record, not time a coach owes.

-- CreateTable
CREATE TABLE "AttendanceMakeUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "courseDayId" TEXT,
    "minutesOwed" INTEGER NOT NULL,
    "minutesCredited" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OWED',
    "creditedAttendanceId" TEXT,
    "creditedNote" TEXT,
    "arrangedNote" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    "openedById" TEXT,
    CONSTRAINT "AttendanceMakeUp_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttendanceMakeUp_courseDayId_fkey" FOREIGN KEY ("courseDayId") REFERENCES "CourseDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceMakeUp_creditedAttendanceId_fkey" FOREIGN KEY ("creditedAttendanceId") REFERENCES "Attendance" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceMakeUp_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseDayId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    CONSTRAINT "Attendance_courseDayId_fkey" FOREIGN KEY ("courseDayId") REFERENCES "CourseDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- present -> minutes, at each day's own scheduled length.
--
-- A ticked box meant "there for the whole day", and the whole day is
-- endTime - startTime on that CourseDay. Every day currently in the database
-- carries both, so nothing is guessed; the 480 fallback exists only for a day
-- somebody adds later without times, where eight hours is the observed norm
-- across all three 2026 registers.
INSERT INTO "new_Attendance" ("id", "courseDayId", "enrollmentId", "minutes")
SELECT a."id",
       a."courseDayId",
       a."enrollmentId",
       CASE WHEN a."present" = 1 THEN COALESCE(
              (SELECT (CAST(substr(d."endTime", 1, 2) AS INTEGER) * 60
                       + CAST(substr(d."endTime", 4, 2) AS INTEGER))
                    - (CAST(substr(d."startTime", 1, 2) AS INTEGER) * 60
                       + CAST(substr(d."startTime", 4, 2) AS INTEGER))
               FROM "CourseDay" d
              WHERE d."id" = a."courseDayId"
                AND d."startTime" IS NOT NULL
                AND d."endTime" IS NOT NULL),
              480)
            ELSE 0 END
FROM "Attendance" a;
DROP TABLE "Attendance";
ALTER TABLE "new_Attendance" RENAME TO "Attendance";
CREATE INDEX "Attendance_enrollmentId_idx" ON "Attendance"("enrollmentId");
CREATE UNIQUE INDEX "Attendance_courseDayId_enrollmentId_key" ON "Attendance"("courseDayId", "enrollmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AttendanceMakeUp_enrollmentId_idx" ON "AttendanceMakeUp"("enrollmentId");

-- CreateIndex
CREATE INDEX "AttendanceMakeUp_status_idx" ON "AttendanceMakeUp"("status");

-- CreateIndex
CREATE INDEX "AttendanceMakeUp_creditedAttendanceId_idx" ON "AttendanceMakeUp"("creditedAttendanceId");
