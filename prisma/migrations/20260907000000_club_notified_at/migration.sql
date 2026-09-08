-- When the Unit told the club, as distinct from when it pressed Release.
--
-- Every notification Football Queensland sends happens outside this system, so
-- `publishedAt` was never the moment a club learned anything — it is the moment
-- a row changed. The club's eight-day review window runs from being told, and
-- anchoring it to `publishedAt` quietly charged the club for the gap between
-- the two.
--
-- Written by hand rather than taken from `migrate diff`, which wanted to
-- rebuild the whole table for the sake of one foreign key. SQLite takes a
-- REFERENCES clause on ADD COLUMN as long as the default is NULL, and this
-- table holds every result in the cycle — a twelve-statement rebuild of it is a
-- worse risk than the thing it buys.
ALTER TABLE "ClubAssessment" ADD COLUMN "clubNotifiedAt" DATETIME;
ALTER TABLE "ClubAssessment" ADD COLUMN "clubNotifiedById" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill, so nothing already released changes clock underneath a club.
--
-- Every rating out there today has been running its window from `publishedAt`,
-- and some of those windows have closed. Leaving these null would restart the
-- eight days on ratings clubs were told about weeks ago, and would drop every
-- one of them into the Unit's new "released, not yet told" queue as though the
-- work had never been done. Treating an existing release as notified on the day
-- it was released is exactly the behaviour those clubs have already had.
UPDATE "ClubAssessment" SET "clubNotifiedAt" = "publishedAt" WHERE "publishedAt" IS NOT NULL;
