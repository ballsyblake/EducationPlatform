-- Compute NN7's shield level from the club's organisational structure.
--
-- Football Queensland maintains this in a workbook: eleven named functions, each
-- recorded from a fixed vocabulary, measured against a per-shield bar that
-- ratchets year by year (8 of 11 functions for Gold in 2026, rising to all 11 by
-- 2028), plus mandatory roles and minimum diplomas per shield.
--
-- Recomputing FQ's own 2026 sheet from FQ's own requirements tab disagreed on
-- sixteen of thirty-three clubs, and every disagreement was in the club's
-- favour — four clubs recorded Gold whose Head of Youth is logged as below the
-- minimum qualification that even Bronze requires. That is what a hand-typed
-- column beside a rule nobody re-derives looks like, and it is the reason this
-- moves out of a spreadsheet.
--
-- The computation does not become the last word. `shieldMetDerived` records
-- what the rules give and `shieldMet` stays the effective level, so the Unit
-- can still depart from it — but a departure now needs a reason and is visible
-- as a departure rather than indistinguishable from arithmetic.

-- CreateTable: the eleven functions, plus the two submitted documents.
CREATE TABLE "StructureRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PRESENCE',
    "counts" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "StructureRole_code_key" ON "StructureRole"("code");

-- CreateTable: the bar for one shield in one cycle. Per cycle because FQ phases
-- the coverage requirement in over four years.
CREATE TABLE "StructureStandard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "shield" TEXT NOT NULL,
    "functionsRequired" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StructureStandard_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StructureStandard_cycleId_shield_key" ON "StructureStandard"("cycleId", "shield");

-- CreateTable
CREATE TABLE "StructureRoleRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "standardId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minQualLevel" INTEGER NOT NULL DEFAULT 0,
    "requireFullTime" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "StructureRoleRequirement_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "StructureStandard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StructureRoleRequirement_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StructureRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StructureRoleRequirement_standardId_roleId_key" ON "StructureRoleRequirement"("standardId", "roleId");

-- CreateTable: what one club recorded against one function.
CREATE TABLE "StructureEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABSENT',
    "holderName" TEXT,
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StructureEntry_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ClubAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StructureEntry_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StructureRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StructureEntry_assessmentId_roleId_key" ON "StructureEntry"("assessmentId", "roleId");

-- CreateIndex
CREATE INDEX "StructureEntry_assessmentId_idx" ON "StructureEntry"("assessmentId");

-- AlterTable: the derived level alongside the effective one, and the reason a
-- departure was made. Nullable throughout — existing threshold results were
-- recorded by hand and stay exactly as they are, with no derived value to
-- compare against until a structure is entered.
ALTER TABLE "NonNegotiableResult" ADD COLUMN "shieldMetDerived" TEXT;
ALTER TABLE "NonNegotiableResult" ADD COLUMN "overrideReason" TEXT;
