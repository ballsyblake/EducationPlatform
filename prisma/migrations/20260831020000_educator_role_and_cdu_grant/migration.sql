-- The EDUCATOR role, and Club Development Unit access as its own grant.
--
-- EDUCATOR needs no column change: SQLite holds enums as TEXT. It is named here
-- because the schema is the only other place it appears.
--
-- `User.cdu` is the one that matters. `requireCdu()` gated on role = 'ADMIN',
-- so promoting somebody to admin in Coach Education silently handed them the
-- entire Club Development Unit — every club's assessment, evidence and scores.
-- Two products sharing an account system, and one role standing in for both.
--
-- Every existing admin is backfilled to cdu = 1, because they already had that
-- access and a migration is the wrong place to take it away: nobody should
-- discover on a Tuesday morning that a deploy locked them out of the portal.
-- What changes is the future — a new admin is not a Unit member until somebody
-- says so.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "role" TEXT NOT NULL DEFAULT 'COACH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assesses" BOOLEAN NOT NULL DEFAULT false,
    "cdu" BOOLEAN NOT NULL DEFAULT false,
    "photoId" TEXT,
    CONSTRAINT "User_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Upload" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("active", "assesses", "createdAt", "email", "id", "name", "photoId", "role", "title") SELECT "active", "assesses", "createdAt", "email", "id", "name", "photoId", "role", "title" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_photoId_key" ON "User"("photoId");
CREATE INDEX "User_role_idx" ON "User"("role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Everyone who could reach the portal before this migration, keeps it.
UPDATE "User" SET "cdu" = true WHERE "role" = 'ADMIN';
