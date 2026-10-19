-- Football Australia's rubric for a practical delivery, and the two fields its
-- own paperwork asks for that the register had nowhere to put.
--
-- Why: an educator writing up a delivery works from the FA/AFC assessor guide,
-- which scores six areas 0-3 for eighteen points and reads the outcome off the
-- diploma's threshold. The app only kept a 1-5 figure, so everything behind
-- that number — which area was weak, what the total actually was — lived in
-- the assessor's own notes and was lost to the app.
--
-- Additive and nullable throughout. Every delivery imported from the 2026
-- registers keeps its 1-5 rating and simply has no scoresheet, which is the
-- truth about it: nobody scored those on this rubric.
--
-- `deliveredOn` separates the day the session happened from `createdAt`, the
-- day it was typed up. They were the same column by default, and a write-up
-- done a fortnight later dated the session wrong.

-- AlterTable
ALTER TABLE "PracticalDelivery" ADD COLUMN "deliveredOn" DATETIME;
ALTER TABLE "PracticalDelivery" ADD COLUMN "session" TEXT;

-- CreateTable
CREATE TABLE "DeliveryScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    CONSTRAINT "DeliveryScore_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PracticalDelivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeliveryScore_deliveryId_idx" ON "DeliveryScore"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryScore_deliveryId_code_key" ON "DeliveryScore"("deliveryId", "code");
