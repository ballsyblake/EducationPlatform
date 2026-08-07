import "dotenv/config";
import { defineConfig } from "prisma/config";
import { createAdapter, databaseUrl, isRemoteDatabase } from "./src/lib/adapter.ts";

/**
 * Migrations run through the same adapter the app uses, so `prisma migrate
 * deploy` works unchanged against either a local SQLite file or a hosted Turso
 * database.
 *
 * `datasource.url` is supplied in both cases because the CLI validates its
 * presence before it ever looks at the adapter — omitting it fails with
 * "The datasource.url property is required" regardless of the adapter.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl(),
  },
  ...(isRemoteDatabase() ? { adapter: async () => createAdapter() } : {}),
});
