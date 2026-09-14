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
 * Everything here blocks the web server from starting, so everything here has
 * to be something that must be true before a single request is served. Loading
 * FQ's season is not — it briefly lived here and cost a deploy, and now runs
 * beside the server from the entrypoint. See `scripts/import-season.ts`.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { applyMigrations } from "./migrate.ts";
import { bootstrapAdmins } from "./bootstrap-admin.ts";
import { DEMOTE_MARKER, demoteCourseTeams } from "./demote-course-teams.ts";
import { seedCatalog } from "../prisma/cda-seed.ts";

async function main() {
  const started = Date.now();

  // Its own libSQL client, because migrations run raw DDL and must complete
  // before a Prisma client is built against the schema they create.
  await applyMigrations();

  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    await bootstrapAdmins(prisma);

    // One-off correction for the course teams an early importer made admins,
    // armed by a variable because this host offers no shell.
    //
    //   DEMOTE_COURSE_TEAMS=1
    //
    // After the bootstrap on purpose: ADMIN_EMAILS is what protects a real
    // admin from this, and those accounts have to exist before they can
    // protect anybody.
    //
    // A marker, like the season imports, and for a sharper reason than theirs:
    // a variable left set would re-demote anybody promoted to Admin on the
    // Staff page since, on the next deploy. Running once and then saying so is
    // the only version of this that can't surprise somebody.
    //
    // Cheap enough to sit in front of the server — two queries and an update
    // over a handful of rows — and an account with more access than it should
    // have is not a thing to leave until after the port opens.
    if ((process.env.DEMOTE_COURSE_TEAMS ?? "").trim()) {
      const done = await prisma.meta.findUnique({ where: { key: DEMOTE_MARKER } });
      if (done) {
        console.log(`[teams] already done on ${done.value} — nothing to do.`);
        console.log("[teams] DEMOTE_COURSE_TEAMS can be removed from the environment.");
      } else {
        const { changed } = await demoteCourseTeams(prisma);
        await prisma.meta.create({
          data: { key: DEMOTE_MARKER, value: new Date().toISOString() },
        });
        console.log(`[teams] done — ${changed} changed. Remove DEMOTE_COURSE_TEAMS now.`);
      }
    }
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
