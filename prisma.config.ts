import "dotenv/config";
import { defineConfig } from "prisma/config";
import { createAdapter, databaseUrl, isRemoteDatabase } from "./src/lib/adapter.ts";

/**
 * Migrations run through the same adapter the app uses, so `prisma migrate
 * deploy` works unchanged against either a local SQLite file or a hosted Turso
 * database. Without the adapter the CLI would try to open a hosted URL as a
 * local file and fail at boot.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(isRemoteDatabase()
    ? { adapter: async () => createAdapter() }
    : { datasource: { url: databaseUrl() } }),
});
