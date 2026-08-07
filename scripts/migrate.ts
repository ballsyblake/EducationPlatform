/**
 * Applies pending migrations.
 *
 * `prisma migrate deploy` can't be used against a hosted database here: Prisma
 * 7's config file has no `adapter` field, so the CLI hands `datasource.url`
 * straight to its own engine, which rejects a `libsql://` URL with
 * "The scheme is not recognized in database URL".
 *
 * This runs the same migration SQL through the libSQL client instead, and
 * records it in the same `_prisma_migrations` table with the same checksum
 * format Prisma uses — so `prisma migrate dev` locally and this runner in
 * production stay interoperable, and neither reapplies the other's work.
 *
 * Works against both `file:` and `libsql://` URLs, so there's one code path
 * regardless of where the database lives.
 *
 *   npm run db:deploy
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

// Matches the table Prisma creates, so rows written here are indistinguishable
// from rows written by the CLI.
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

type Applied = { checksum: string; rolledBack: boolean };

function migrationNames() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      const dir = path.join(MIGRATIONS_DIR, name);
      return statSync(dir).isDirectory() && existsSql(dir);
    })
    // Names are timestamp-prefixed, so lexical order is chronological.
    .sort();
}

function existsSql(dir: string) {
  try {
    statSync(path.join(dir, "migration.sql"));
    return true;
  } catch {
    return false;
  }
}

function readMigration(name: string) {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
  return { sql, checksum: createHash("sha256").update(sql, "utf8").digest("hex") };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  console.log(`[migrate] target: ${url.split("?")[0]}`);

  const client = createClient(authToken ? { url, authToken } : { url });

  await client.executeMultiple(CREATE_TABLE);

  const existing = new Map<string, Applied>();
  const rows = await client.execute(
    'SELECT "migration_name", "checksum", "finished_at", "rolled_back_at" FROM "_prisma_migrations"',
  );
  for (const row of rows.rows) {
    const name = String(row.migration_name);
    // A row with no finished_at is a failed attempt; treat it as not applied so
    // it gets retried rather than silently skipped.
    if (row.finished_at === null) continue;
    existing.set(name, {
      checksum: String(row.checksum),
      rolledBack: row.rolled_back_at !== null,
    });
  }

  const names = migrationNames();
  let applied = 0;

  for (const name of names) {
    const { sql, checksum } = readMigration(name);
    const previous = existing.get(name);

    if (previous && !previous.rolledBack) {
      if (previous.checksum !== checksum) {
        throw new Error(
          `Migration "${name}" was already applied but its file has changed since.\n` +
            "Editing an applied migration puts the database out of step with the repo. " +
            "Add a new migration instead of modifying this one.",
        );
      }
      continue;
    }

    console.log(`[migrate] applying ${name}`);
    const startedAt = new Date().toISOString();

    try {
      // executeMultiple runs the statements outside an explicit transaction,
      // which the generated SQL requires — SQLite rejects PRAGMA
      // foreign_keys inside one, and the table rebuilds depend on it.
      await client.executeMultiple(sql);
    } catch (error) {
      // Record the failure so a rerun retries rather than assuming success.
      await client.execute({
        sql: 'INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","logs","started_at","applied_steps_count") VALUES (?,?,?,?,?,0)',
        args: [randomUUID(), checksum, name, String(error), startedAt],
      });
      throw new Error(`Migration "${name}" failed: ${error}`);
    }

    await client.execute({
      sql: 'INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","started_at","finished_at","applied_steps_count") VALUES (?,?,?,?,?,1)',
      args: [randomUUID(), checksum, name, startedAt, new Date().toISOString()],
    });
    applied += 1;
  }

  console.log(
    applied === 0
      ? `[migrate] up to date (${names.length} migrations already applied)`
      : `[migrate] applied ${applied} migration${applied === 1 ? "" : "s"}`,
  );

  client.close();
}

main().catch((error) => {
  console.error("[migrate] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
