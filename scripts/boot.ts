/**
 * Everything the container does before it serves a request.
 *
 *   npm run boot
 *
 * One process, not three. The entrypoint used to run migrate, bootstrap-admin
 * and seed-cda as separate `npx tsx` invocations, which meant three Node
 * starts, three TypeScript transpiles and three fresh connections to the
 * database before the server even began listening. On a host that sleeps its
 * free instances after fifteen minutes, that boot cost is paid by whoever
 * happens to open the site next, so it is worth keeping short.
 *
 * The order is not negotiable: migrations must finish before anything reads or
 * writes, and the admin bootstrap needs the schema the migrations create.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { applyMigrations } from "./migrate.ts";
import { bootstrapAdmins } from "./bootstrap-admin.ts";
import { seedCatalog } from "../prisma/cda-seed.ts";

async function main() {
  const started = Date.now();

  // Its own libSQL client, because migrations run raw DDL and must complete
  // before a Prisma client is built against the schema they create.
  await applyMigrations();

  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    await bootstrapAdmins(prisma);
    // Skips itself in one query when this image ships the catalogue the
    // database already has, which is every boot except the one after a release
    // that changed the rubric.
    await seedCatalog(prisma, { skipIfUnchanged: true });
  } finally {
    await prisma.$disconnect();
  }

  console.log(`[boot] ready in ${Date.now() - started}ms`);
}

main().catch((error) => {
  console.error("[boot] failed:", error);
  process.exit(1);
});
