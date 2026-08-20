/**
 * Loads Football Queensland's 2026 season on a host that offers no shell.
 *
 *   FQ_IMPORT_2026=1  — arms it; unset or empty and this does nothing
 *
 * Run by `docker-entrypoint.sh` in the background, *after* the web server has
 * been started, and deliberately not part of `scripts/boot.ts`.
 *
 * It was part of boot, and that was wrong. Nothing serves while boot runs, so
 * every second the import spent went on the deploy's clock: the first real
 * attempt against the hosted database took over fourteen minutes, Render gave
 * up scanning for an open port after five, and the deploy timed out with the
 * season half-loaded. The import had been measured against a local SQLite file,
 * where the same work takes three seconds.
 *
 * The import is not a prerequisite for serving. Nobody signing in needs it to
 * have finished, and a season that arrives ninety seconds after the site does
 * is not worth a failed deploy — so it runs alongside the server instead of in
 * front of it. Worst case the portal is briefly missing some of the season
 * while this finishes, which is exactly what a partial import looks like
 * anyway, minus the outage.
 *
 * Two guards, because a data import that runs itself is worth being careful
 * with. The variable arms it; a row in Meta disarms it permanently once it
 * succeeds, so a variable left set costs one query per boot rather than the
 * whole import again. Failure writes no marker, so fixing the cause and
 * redeploying retries.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { FQ_IMPORT_MARKER, importFq2026 } from "./import-fq-2026.ts";

const ASKED = (process.env.FQ_IMPORT_2026 ?? "").trim().toLowerCase();
const WANTED = ASKED === "1" || ASKED === "yes" || ASKED === "true";

async function main() {
  if (!WANTED) return;

  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    const done = await prisma.meta.findUnique({ where: { key: FQ_IMPORT_MARKER } });
    if (done) {
      console.log(`[season] already imported on ${done.value} — nothing to do.`);
      console.log("[season] FQ_IMPORT_2026 can be removed from the environment.");
      return;
    }

    console.log("[season] FQ_IMPORT_2026 set — loading the 2026 season in the background…");
    const started = Date.now();
    await importFq2026(prisma);
    await prisma.meta.create({
      data: { key: FQ_IMPORT_MARKER, value: new Date().toISOString() },
    });
    console.log(`[season] imported in ${Math.round((Date.now() - started) / 1000)}s.`);
    console.log("[season] Remove FQ_IMPORT_2026 from the environment now.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Logged, never fatal: this runs beside a serving web process and must not
  // take it down. No marker was written, so the next boot tries again.
  console.error("[season] import failed — the site is unaffected:", error);
});
