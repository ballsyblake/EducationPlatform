/**
 * Clears the CDA portal back to a clean slate.
 *
 *   npm run cda:reset -- --yes
 *
 * Removes every club, assessment, score, review, structure entry and portal
 * account, leaving Football Queensland's rubric — the line items, evidence
 * points, Non-Negotiables, qualifications, tiers, structure roles and per-shield
 * standards — untouched. That is the split that matters: the rubric is the
 * product, and the rest is one season's working data.
 *
 * Coach Education is not touched at all. The two products share a deployment and
 * an account system but nothing else, and a CDA reset that emptied someone's
 * courses would be a very expensive surprise.
 *
 * ADMIN accounts survive too. They are how anyone gets back into the portal, and
 * deleting them alongside the clubs would lock the operator out of the instance
 * they had just reset.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { seedCatalog } from "../prisma/cda-seed.ts";

const prisma = new PrismaClient({ adapter: createAdapter() });

const confirmed = process.argv.includes("--yes");
const keepCycles = process.argv.includes("--keep-cycles");

async function main() {
  const [clubs, assessments, portalUsers, cycles] = await Promise.all([
    prisma.club.count(),
    prisma.clubAssessment.count(),
    prisma.user.count({ where: { role: { in: ["CLUB", "ASSESSOR"] } } }),
    prisma.cycle.count(),
  ]);

  console.log("[reset] this will permanently delete:");
  console.log(`  ${clubs} clubs`);
  console.log(`  ${assessments} assessments, with their scores, evidence and reviews`);
  console.log(`  ${portalUsers} club and assessor accounts`);
  console.log(`  ${keepCycles ? `0 cycles (${cycles} kept)` : `${cycles} cycles`}`);
  console.log("[reset] the rubric, admin accounts and Coach Education are untouched.");

  if (!confirmed) {
    console.log("\n[reset] nothing done. Re-run with --yes to go ahead.");
    return;
  }

  // Deepest first. Most of these would cascade from ClubAssessment anyway, but
  // naming them makes the blast radius reviewable rather than implied by a
  // schema you have to go and read.
  await prisma.reviewItem.deleteMany();
  await prisma.reviewRequest.deleteMany();
  await prisma.scoreEvidence.deleteMany();
  await prisma.assessorScore.deleteMany();
  await prisma.finalScore.deleteMany();
  await prisma.nonNegotiableResult.deleteMany();
  await prisma.structureEntry.deleteMany();
  await prisma.areaNote.deleteMany();
  await prisma.clubMetric.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.criterionAssignment.deleteMany();
  await prisma.clubAssessment.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.clubMembership.deleteMany();
  await prisma.club.deleteMany();

  // Sessions go before the accounts, so anyone signed in as a club or assessor
  // is logged out rather than left holding a cookie for a user that no longer
  // exists.
  const doomed = await prisma.user.findMany({
    where: { role: { in: ["CLUB", "ASSESSOR"] } },
    select: { id: true },
  });
  await prisma.session.deleteMany({ where: { userId: { in: doomed.map((u) => u.id) } } });
  await prisma.loginToken.deleteMany({ where: { userId: { in: doomed.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { role: { in: ["CLUB", "ASSESSOR"] } } });

  // Admin accounts survive, but their standing as assessors does not: that is
  // one season's staffing, not a property of the account. Leaving it set would
  // put people in the new cycle's assessor pool that nobody had put there.
  await prisma.user.updateMany({ where: { assesses: true }, data: { assesses: false } });

  if (!keepCycles) {
    // Structure standards hang off the cycle and go with it.
    await prisma.cycle.deleteMany();
  }

  // Re-run the catalogue so anything the reset cascaded away — the structure
  // standards on a deleted cycle, most obviously — comes straight back, and the
  // instance is immediately usable rather than half-empty.
  await seedCatalog(prisma);

  console.log("\n[reset] done. The portal is a clean slate with the rubric loaded.");
  console.log("[reset] sign in as an admin and open a cycle at /cda/cdu.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
