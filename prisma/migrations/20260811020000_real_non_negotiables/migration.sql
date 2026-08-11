-- Football Queensland's Non-Negotiables are two mechanisms, not one.
--
-- Six of the nine (fee transparency, scholarship positions, coach registration,
-- fielding teams, TD qualification, technical staff qualifications) are simply
-- present or absent: "no assessment score can be elevated to 'Confirmed' status
-- while non-negotiable documents are missing or incomplete". Those are GATEs.
--
-- The other three (club structure, coaching standards, training program) set a
-- different bar for each shield, phased in over four years — FQ explicitly
-- exempts Silver and Bronze clubs from the Gold staffing requirement. Failing
-- those must not make a club ineligible; it caps the shield at the level the
-- club actually met. Hence `kind` on the catalogue row and `shieldMet` on the
-- club's result.
--
-- Both columns are nullable/defaulted so existing rows keep behaving as they
-- did: everything already seeded is a GATE with no level recorded.

-- AlterTable
ALTER TABLE "NonNegotiable" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'GATE';
ALTER TABLE "NonNegotiable" ADD COLUMN "format" TEXT;
ALTER TABLE "NonNegotiable" ADD COLUMN "shieldGuidance" TEXT;

-- AlterTable
ALTER TABLE "NonNegotiableResult" ADD COLUMN "shieldMet" TEXT;
