import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.ts";
import { createAdapter } from "./src/lib/adapter.ts";
const prisma = new PrismaClient({ adapter: createAdapter() });
async function main() {
  const rows = await prisma.clubAssessment.findMany({ include: { club: true, _count: { select: { scores: true } } } });
  for (const r of rows) console.log(`${r.club.name.padEnd(28)} ${r.status.padEnd(14)} scores=${r._count.scores}`);
  const t = rows.find(r => r.club.slug === "toowoomba-ranges")!;
  const byAssessor = await prisma.assessorScore.groupBy({ by: ["assessorId"], where: { assessmentId: t.id }, _count: { _all: true } });
  console.log("Toowoomba by assessor:", byAssessor);
  await prisma.$disconnect();
}
main();
