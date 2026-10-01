-- Film of a practical delivery, and feedback pinned to moments in it.
--
-- A coach is assessed in front of a group and the write-up is prose: a comment
-- and an action plan, both about a session that finished an hour ago. What they
-- cannot do is see the thing being described. "You lost the group in the
-- transition" means a great deal more next to the eleven seconds where it
-- happened.
--
-- The film is a URL and not a blob. Uploads here live in database rows with a
-- 10 MB ceiling, and a phone's recording of a session is two orders of
-- magnitude past it — the rest of the app already says film is a link, and this
-- is the same rule. The player works out what it can do with the link: YouTube
-- and Vimeo get an embed it can seek by postMessage, a direct media URL gets a
-- native <video> element, and anything else is left as a link.
--
-- Hung off PracticalDelivery rather than the enrolment, because the unit of
-- feedback here is one session somebody watched, and that row already carries
-- who watched it and what they wrote. Several clips per delivery: a session
-- gets filmed in halves as often as not.
--
-- Both tables cascade from their parent and null their author on account
-- deletion, matching every other write-up in the product: deleting the person
-- who left feedback must not take the feedback off a coach's record.

-- CreateTable
CREATE TABLE "DeliveryFootage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "postedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryFootage_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PracticalDelivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryFootage_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FootageNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "footageId" TEXT NOT NULL,
    "atSeconds" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FootageNote_footageId_fkey" FOREIGN KEY ("footageId") REFERENCES "DeliveryFootage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FootageNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeliveryFootage_deliveryId_idx" ON "DeliveryFootage"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryFootage_postedById_idx" ON "DeliveryFootage"("postedById");

-- CreateIndex
CREATE INDEX "FootageNote_footageId_atSeconds_idx" ON "FootageNote"("footageId", "atSeconds");

-- CreateIndex
CREATE INDEX "FootageNote_authorId_idx" ON "FootageNote"("authorId");

