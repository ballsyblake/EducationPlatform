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
 *
 * One optional fourth step: with FQ_IMPORT_2026 set, Football Queensland's 2026
 * season is loaded once. It lives here because the free host offers no shell.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { applyMigrations } from "./migrate.ts";
import { bootstrapAdmins } from "./bootstrap-admin.ts";
import { importFq2026 } from "./import-fq-2026.ts";
import { seedCatalog } from "../prisma/cda-seed.ts";

/** Marks the FQ 2026 season as loaded, so it is imported at most once. */
const FQ_IMPORT_MARKER = "fq-2026-imported";

/**
 * Loads Football Queensland's 2026 season, once, when FQ_IMPORT_2026 is set.
 *
 * This exists because the free host runs no shell: there is no way to execute
 * `npm run cda:import-2026` against the production database, so the one place
 * that can reach it is the boot the container already performs. Set the
 * variable in the dashboard, let it redeploy, and clear it afterwards.
 *
 * Two guards, because a data import wired into boot is worth being careful
 * with. The variable arms it, and a row in Meta disarms it permanently — so a
 * forgotten variable can't re-run three thousand upserts on every wake, which
 * on a host that sleeps after fifteen minutes would be paid by whoever opens
 * the site next.
 *
 * Failure is logged and swallowed. A season that didn't import is a bad
 * afternoon; a container that won't start because of it is an outage, and the
 * import is not what anyone signed in to do.
 */
async function importSeasonIfAsked(prisma: PrismaClient) {
  const asked = (process.env.FQ_IMPORT_2026 ?? "").trim().toLowerCase();
  if (asked !== "1" && asked !== "yes" && asked !== "true") return;

  const done = await prisma.meta.findUnique({ where: { key: FQ_IMPORT_MARKER } });
  if (done) {
    console.log(`[boot] FQ 2026 season already imported on ${done.value} — skipping.`);
    console.log("[boot] FQ_IMPORT_2026 can be removed from the environment.");
    return;
  }

  try {
    console.log("[boot] FQ_IMPORT_2026 set — loading the 2026 season…");
    await importFq2026(prisma);
    await prisma.meta.create({
      data: { key: FQ_IMPORT_MARKER, value: new Date().toISOString() },
    });
    console.log("[boot] FQ 2026 season imported. Remove FQ_IMPORT_2026 now.");
  } catch (error) {
    // No marker is written, so correcting the cause and redeploying retries.
    console.error("[boot] FQ 2026 import failed — serving anyway:", error);
  }
}

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
    // After the catalogue, which the imported scores are keyed to by code.
    await importSeasonIfAsked(prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`[boot] ready in ${Date.now() - started}ms`);
}

main().catch((error) => {
  console.error("[boot] failed:", error);
  process.exit(1);
});
