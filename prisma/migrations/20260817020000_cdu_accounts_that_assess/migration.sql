-- Let a Club Development Unit account also be allocated line items.
--
-- The Unit is small enough that the people who administer a cycle are also
-- among the people who assess it. Forcing that person into a second account
-- under a second address split one human's work across two identities, which
-- makes the audit trail worse rather than better.
--
-- Off by default, and only meaningful on an ADMIN. It grants no extra
-- authority — an ADMIN can already read every assessment — it only makes them
-- allocatable to a line item. The overlap it creates is recorded rather than
-- prevented, on the assessment's audit trail.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "assesses" BOOLEAN NOT NULL DEFAULT false;
