/**
 * Chooses the database driver from DATABASE_URL.
 *
 * `libsql://` or `https://` means a hosted Turso database; anything else is a
 * local SQLite file. Both speak the same SQL, so the schema and every migration
 * are identical either way — only the transport changes.
 *
 * Kept free of "server-only" and of any `@/` alias so the Prisma CLI and the
 * standalone scripts can import it too.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";

export function isRemoteDatabase(url = databaseUrl()) {
  return /^(libsql|https|wss):/.test(url);
}

export function databaseUrl() {
  return process.env.DATABASE_URL ?? "file:./prisma/dev.db";
}

/**
 * `DB_DRIVER=libsql` forces the libSQL driver even for a local `file:` URL.
 * That makes it possible to exercise the exact client Turso uses — including
 * how it handles blobs — without a hosted database.
 */
function useLibSql(url: string) {
  return isRemoteDatabase(url) || process.env.DB_DRIVER === "libsql";
}

export function createAdapter() {
  const url = databaseUrl();

  if (useLibSql(url)) {
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (isRemoteDatabase(url) && !authToken) {
      throw new Error(
        "DATABASE_URL points at a hosted database but TURSO_AUTH_TOKEN is not set.",
      );
    }
    return new PrismaLibSql({ url, authToken });
  }

  return new PrismaBetterSqlite3({ url });
}
