-- Record a club's assessment tier on the club.
--
-- The tier decides which line items a club is scored on — 54 for Tier 1, 18 for
-- Tier 2 — and until now it lived only on the assessment, where nothing in the
-- portal ever wrote it. Two consequences: every club created through the UI was
-- silently assessed as Tier 1, and a bulk import run before a cycle exists had
-- nowhere to put the tier at all, so it was discarded.
--
-- It belongs on the club because it is a standing fact about the club rather
-- than about one season. Each assessment keeps its own tier, so moving a club
-- between tiers never rewrites a season that has already been scored.

-- AlterTable
ALTER TABLE "Club" ADD COLUMN "tierId" TEXT REFERENCES "Tier" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Club_tierId_idx" ON "Club"("tierId");
