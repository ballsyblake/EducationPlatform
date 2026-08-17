-- A tiny key/value store for things the app remembers between boots.
--
-- The first user is a fingerprint of the rubric catalogue shipped in the
-- running image. The catalogue sync runs on every container start and, on a
-- hosted database, each of its ~160 upserts is a network round trip — several
-- seconds on every wake to discover nothing has changed. Comparing one hash
-- first turns that into a single query.

-- CreateTable
CREATE TABLE "Meta" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
