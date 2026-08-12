-- Football Queensland awards three shields, not four.
--
-- "Gold rating is awarded if a minimum of 75% is achieved… Silver… 55%…
-- Bronze… 40%. All clubs scoring less than 40% of the overall points will
-- receive an FQ Development Committed badge for their FQ Academy assessment if
-- they are licence compliant (in non-technical areas)."
--
-- So Platinum goes, Gold moves from 70% to 75%, and the sub-40% band becomes a
-- real award rather than an absence of one.
--
-- Two data migrations matter here:
--
--   * Any club already sitting on PLATINUM is moved to GOLD. Leaving the value
--     in place would keep a shield FQ does not issue on a published report, and
--     Gold is what that club would be awarded under the corrected scale.
--
--   * goldMin is only raised on cycles still using the old 70% default. A cycle
--     where the CDU deliberately set a different bar keeps it — this release is
--     correcting a wrong default, not overruling a decision. Published cycles
--     are left alone entirely: their clubs were judged against the bar in force
--     at the time, and moving it now would silently demote them.

-- Retire the Platinum awards.
UPDATE "ClubAssessment" SET "finalShield" = 'GOLD' WHERE "finalShield" = 'PLATINUM';
UPDATE "NonNegotiableResult" SET "shieldMet" = 'GOLD' WHERE "shieldMet" = 'PLATINUM';

-- AlterTable: drop the Platinum bar and correct Gold.
-- SQLite has no DROP COLUMN on older engines; libSQL supports it, and the
-- column carries no constraints or indexes.
UPDATE "Cycle" SET "goldMin" = 75 WHERE "goldMin" = 70 AND "status" != 'PUBLISHED';
ALTER TABLE "Cycle" DROP COLUMN "platinumMin";

-- AlterTable: the one condition FQ attaches to the Development Committed badge.
-- Nullable, and null means "not established" — the badge is withheld rather
-- than assumed.
ALTER TABLE "ClubAssessment" ADD COLUMN "licenceCompliant" BOOLEAN;
