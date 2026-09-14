-- Filing a cohort away, as distinct from having delivered it.
--
-- The last delivery day is already in the register and stays derived from it.
-- This is the separate act: results in, hours settled, support opened for
-- whoever needed it. Without it the Manage page is every cohort ever run, in
-- one flat list, with nothing to say which are live.
--
-- Written by hand rather than taken from `migrate diff`, which wanted to rebuild
-- the table for one foreign key. SQLite accepts a REFERENCES clause on ADD
-- COLUMN while the default is NULL, and Course is the parent of every day,
-- enrolment, assignment and quiz in the product — a rebuild of it is a worse
-- risk than the thing it buys.
--
-- No backfill. Every existing course is left open, because "finished" is a
-- judgement somebody makes about a cohort and guessing it from a date would
-- file away courses nobody has looked at.
ALTER TABLE "Course" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "Course" ADD COLUMN "closedById" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
