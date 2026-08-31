/**
 * Loads the 2026 B Diploma registers on a host that offers no shell.
 *
 *   B_DIPLOMA_IMPORT_2026=1  — arms it; unset or empty and this does nothing
 *
 * Run by `docker-entrypoint.sh` in the background, *after* the web server has
 * been started, and deliberately not part of `scripts/boot.ts` — for the reason
 * `scripts/import-season.ts` documents at length: an import that runs in front
 * of the server spends the deploy's clock, and the season's first attempt
 * against the hosted database took fourteen minutes and killed the deploy.
 *
 * This one is smaller — a few thousand statements rather than tens of
 * thousands — but the argument is the same and so is the shape. Nobody signing
 * in needs the registers to have finished loading.
 *
 * Two guards, because a data import that runs itself is worth being careful
 * with. The variable arms it; a row in Meta disarms it permanently once it
 * succeeds, so a variable left set costs one query per boot rather than the
 * whole import again. Failure writes no marker, so fixing the cause and
 * redeploying retries.
 *
 * The registers are real people's assessment history. That is why this needs a
 * variable set on purpose rather than running on every deploy, and why the
 * marker exists rather than trusting whoever set it to come back and unset it.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { B_DIPLOMA_IMPORT_MARKER, importBDiploma } from "./import-b-diploma.ts";

const ASKED = (process.env.B_DIPLOMA_IMPORT_2026 ?? "").trim().toLowerCase();
const WANTED = ASKED === "1" || ASKED === "yes" || ASKED === "true" || ASKED === "force";

/**
 * "force" re-runs even though the marker says the registers are already loaded.
 *
 * There is a difference between "has this been imported" and "is what it
 * imported still right", and only the first is what the marker records. When a
 * fix to the importer needs applying to a database that already ran it, there
 * has to be a way to ask for it again without deleting the marker by hand on a
 * host with no shell.
 *
 * Safe to reach for: every write is an upsert keyed on something stable, so a
 * second run corrects the first rather than duplicating it.
 */
const FORCED = ASKED === "force";

async function main() {
  if (!WANTED) return;

  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    const done = await prisma.meta.findUnique({ where: { key: B_DIPLOMA_IMPORT_MARKER } });
    if (done && !FORCED) {
      console.log(`[courses] already imported on ${done.value} — nothing to do.`);
      console.log("[courses] B_DIPLOMA_IMPORT_2026 can be removed from the environment.");
      console.log('[courses] Set it to "force" to re-run anyway after an importer fix.');
      return;
    }
    if (done) {
      console.log(`[courses] B_DIPLOMA_IMPORT_2026=force — re-running over the ${done.value} import.`);
    }

    console.log("[courses] B_DIPLOMA_IMPORT_2026 set — loading the B Diploma registers…");
    const started = Date.now();
    await importBDiploma(prisma);
    // Upsert, not create: a forced re-run already has a marker, and failing on
    // it after the work is done would leave the registers imported and the
    // record of it saying otherwise.
    await prisma.meta.upsert({
      where: { key: B_DIPLOMA_IMPORT_MARKER },
      update: { value: new Date().toISOString() },
      create: { key: B_DIPLOMA_IMPORT_MARKER, value: new Date().toISOString() },
    });
    console.log(`[courses] imported in ${Math.round((Date.now() - started) / 1000)}s.`);
    console.log("[courses] Remove B_DIPLOMA_IMPORT_2026 from the environment now.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Logged, never fatal: this runs beside a serving web process and must not
  // take it down. No marker was written, so the next boot tries again.
  console.error("[courses] import failed — the site is unaffected:", error);
});
