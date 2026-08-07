/**
 * Seeds the CDA portal on its own, without touching coach-education data.
 *
 *   npm run cda:catalog   criteria, Non-Negotiables and qualifications only
 *   npm run cda:seed      the above, plus demo clubs, assessors and assessments
 *
 * The catalogue half runs on every container boot, so a deployed instance picks
 * up new criteria shipped in a release without anyone having to remember.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { seedCatalog, seedDemo } from "../prisma/cda-seed.ts";

const prisma = new PrismaClient({ adapter: createAdapter() });

const withDemo = process.argv.includes("--demo");

async function main() {
  await seedCatalog(prisma);
  if (withDemo) await seedDemo(prisma);
}

main()
  .catch((error) => {
    console.error("[cda] seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
