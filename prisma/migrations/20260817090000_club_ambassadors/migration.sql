-- The clubs a Club Development Ambassador looks after through the year.
--
-- Standing, and independent of any cycle: a CDA visits and supports these clubs
-- whether or not a rating is running, so this outlives the pool and the
-- line-item allocation that decide who scores what in a given season.
--
-- It is also the visibility boundary. An assessor reaches a club only where
-- their portfolio and their allocation overlap — holding a line item across a
-- pool no longer opens every club in it.
--
-- Its own table rather than a column on Club because a club can have more than
-- one CDA, and because a CDA leaving takes their portfolio with them without
-- touching the clubs.

-- CreateTable
CREATE TABLE "ClubAmbassador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubAmbassador_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClubAmbassador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubAmbassador_clubId_userId_key" ON "ClubAmbassador"("clubId", "userId");

-- CreateIndex
CREATE INDEX "ClubAmbassador_userId_idx" ON "ClubAmbassador"("userId");
