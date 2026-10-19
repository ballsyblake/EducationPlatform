/**
 * Loads the post-course support registers on a host that offers no shell.
 *
 *   SUPPORT_IMPORT_2026=1  — arms it; unset or empty and this does nothing
 *   SUPPORT_DATA_FILE      — where the extract is, e.g. a Render Secret File
 *                            at /etc/secrets/post-course-support.json
 *
 * Run by `docker-entrypoint.sh` in the background, *after* the web server has
 * been started, and deliberately not part of `scripts/boot.ts`: an import that
 * runs in front of the server spends the deploy's clock, and the season's
 * first attempt against the hosted database took fourteen minutes and killed
 * the deploy. This one is small, and the argument is the same.
 *
 * Two guards, like the register import. The variable arms it; a row in Meta
 * disarms it permanently once it succeeds, so a variable left set costs one
 * query per boot rather than the whole import again. Failure writes no marker,
 * so fixing the cause and redeploying retries.
 *
 * These are real coaches' outcomes and real addresses. That is why it needs a
 * variable set on purpose rather than running on every deploy.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { SUPPORT_IMPORT_MARKER, dataFile, importSupport } from "./import-support.ts";

const ASKED = (process.env.SUPPORT_IMPORT_2026 ?? "").trim().toLowerCase();
const WANTED = ASKED === "1" || ASKED === "yes" || ASKED === "true" || ASKED === "force";

/**
 * "force" re-runs even though the marker says the register is already loaded.
 *
 * There is a difference between "has this been imported" and "is what it
 * imported still right", and only the first is what the marker records — and
 * this register changes every week, which the registers do not. Safe to reach
 * for: every write is an upsert keyed on something stable.
 */
const FORCED = ASKED === "force";

async function main() {
  if (!WANTED) return;

  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    const done = await prisma.meta.findUnique({ where: { key: SUPPORT_IMPORT_MARKER } });
    if (done && !FORCED) {
      console.log(`[support] already imported on ${done.value} — nothing to do.`);
      console.log("[support] SUPPORT_IMPORT_2026 can be removed from the environment.");
      console.log('[support] Set it to "force" to load an updated register.');
      return;
    }
    if (done) {
      console.log(`[support] SUPPORT_IMPORT_2026=force — re-running over the ${done.value} import.`);
    }

    console.log(`[support] SUPPORT_IMPORT_2026 set — loading ${dataFile()}…`);
    const started = Date.now();
    await importSupport(prisma);
    await prisma.meta.upsert({
      where: { key: SUPPORT_IMPORT_MARKER },
      update: { value: new Date().toISOString() },
      create: { key: SUPPORT_IMPORT_MARKER, value: new Date().toISOString() },
    });
    console.log(`[support] imported in ${Math.round((Date.now() - started) / 1000)}s.`);
    console.log("[support] Remove SUPPORT_IMPORT_2026 from the environment now.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Logged, never fatal: this runs beside a serving web process and must not
  // take it down. No marker was written, so the next boot tries again.
  console.error("[support] import failed — the site is unaffected:", error);
});
