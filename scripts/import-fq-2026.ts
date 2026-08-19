/**
 * Loads Football Queensland's real 2026 assessment into a cycle.
 *
 *   npm run cda:import-2026 -- --dry-run     say what would change, write nothing
 *   npm run cda:import-2026 -- --yes         do it
 *
 * The data comes from `prisma/data/fq-2026.json`, extracted from FQ's five
 * working spreadsheets by `scripts/extract-fq-2026.py`. Two steps rather than
 * one because the spreadsheets are FQ's own documents and will change shape
 * next season, while the JSON is a flat record of one season that can be
 * reviewed, diffed and re-imported without Excel in the loop.
 *
 * Idempotent throughout: every write is an upsert keyed on something stable, so
 * a second run corrects the first rather than duplicating it.
 *
 * What it deliberately does NOT do:
 *
 *   - Lock or publish anything. Ratings stay live and unlocked, so the portal
 *     computes them from the imported scores and the Unit can compare that
 *     against what FQ recorded before freezing anything. Locking is a decision,
 *     not an import step.
 *   - Enter the clubs' staff registers. They are in none of the workbooks, so
 *     Technical Qualifications stays at zero until somebody enters them.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";

const prisma = new PrismaClient({ adapter: createAdapter() });

const DRY = process.argv.includes("--dry-run");
const CONFIRMED = process.argv.includes("--yes");

/**
 * Assessor addresses are derived, because the workbooks carry names only.
 *
 * Stated loudly at the end of the run: these accounts cannot receive a working
 * sign-in link until the addresses are corrected, and correcting them is a
 * one-line edit per assessor on the Assessors page.
 */
const EMAIL_DOMAIN = process.env.FQ_ASSESSOR_DOMAIN ?? "footballqueensland.com.au";

function emailFor(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
  return `${slug}@${EMAIL_DOMAIN}`;
}

type Data = {
  cycle: { year: number; name: string };
  clubs: { name: string; pool: string | null; tier: string; shield: string; rank: number | null; league: string }[];
  allocations: { pool: string | null; code: string; slot: number; assessor: string }[];
  scores: {
    code: string; club: string; assessor: string; met: number[];
    criteria: number; stars: number | null; comment: string; confirmed?: number | null;
  }[];
  agreed: { club: string; code: string; stars: number }[];
  ambassadors: { club: string; assessor: string }[];
};

async function main() {
  const file = path.join(process.cwd(), "prisma", "data", "fq-2026.json");
  const data: Data = JSON.parse(readFileSync(file, "utf8"));

  if (!DRY && !CONFIRMED) {
    console.log("[import] pass --dry-run to preview, or --yes to write.");
    return;
  }

  const say = (s: string) => console.log(`[import] ${s}`);
  say(DRY ? "DRY RUN — nothing will be written" : "writing");

  /* ------------------------------- the cycle ------------------------------ */

  let cycle = await prisma.cycle.findFirst({ where: { year: data.cycle.year } });
  if (!cycle) {
    cycle = await prisma.cycle.findFirst({ orderBy: { year: "desc" } });
  }
  if (!cycle) {
    if (DRY) {
      say(`would create cycle ${data.cycle.name}`);
    } else {
      cycle = await prisma.cycle.create({
        data: { year: data.cycle.year, name: data.cycle.name, status: "RECONCILING" },
      });
    }
  }
  if (!cycle) return;
  say(`cycle: ${cycle.name}`);

  const tiers = new Map((await prisma.tier.findMany()).map((t) => [t.code, t.id]));
  const criteria = await prisma.criterion.findMany({
    include: { subCriteria: { orderBy: { position: "asc" } } },
  });
  const byCode = new Map(criteria.map((c) => [c.code, c]));

  /* ------------------------------- assessors ------------------------------ */

  const names = [
    ...new Set([
      ...data.allocations.map((a) => a.assessor),
      ...data.scores.map((s) => s.assessor),
      // Regional ambassadors appear only on the Action Plan Matrix. They hold
      // no line items, but they look after clubs, so they need an account for
      // the portfolio to point at.
      ...data.ambassadors.map((a) => a.assessor),
    ]),
  ].sort();
  const assessorId = new Map<string, string>();
  let newAssessors = 0;

  for (const name of names) {
    const email = emailFor(name);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      assessorId.set(name, existing.id);
      continue;
    }
    newAssessors += 1;
    if (DRY) continue;
    const user = await prisma.user.create({
      data: { email, name, title: "Club Development Ambassador", role: "ASSESSOR" },
    });
    assessorId.set(name, user.id);
  }
  say(`assessors: ${names.length} (${newAssessors} new)`);

  /* --------------------------------- pools -------------------------------- */

  const poolId = new Map<string, string>();
  for (const [i, name] of ["A", "B", "C"].entries()) {
    const existing = await prisma.pool.findUnique({
      where: { cycleId_name: { cycleId: cycle.id, name } },
    });
    if (existing) {
      poolId.set(name, existing.id);
    } else if (!DRY) {
      const p = await prisma.pool.create({ data: { cycleId: cycle.id, name, position: i } });
      poolId.set(name, p.id);
    }
  }
  say(`pools: ${poolId.size}`);

  /* --------------------------------- clubs -------------------------------- */

  const clubId = new Map<string, string>();
  const assessmentId = new Map<string, string>();
  let newClubs = 0;

  for (const c of data.clubs) {
    const slugBase = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    let club = await prisma.club.findFirst({ where: { name: c.name } });
    if (!club) {
      newClubs += 1;
      if (DRY) continue;
      let slug = slugBase;
      for (let n = 2; await prisma.club.findUnique({ where: { slug } }); n += 1) slug = `${slugBase}-${n}`;
      club = await prisma.club.create({
        data: { name: c.name, slug, tier: c.league || null, tierId: tiers.get(c.tier) ?? null },
      });
    } else if (!DRY) {
      club = await prisma.club.update({
        where: { id: club.id },
        data: { tierId: tiers.get(c.tier) ?? null, tier: c.league || club.tier },
      });
    }
    if (!club) continue;
    clubId.set(c.name, club.id);

    if (DRY) continue;
    const a = await prisma.clubAssessment.upsert({
      where: { clubId_cycleId: { clubId: club.id, cycleId: cycle.id } },
      update: {
        poolId: c.pool ? (poolId.get(c.pool) ?? null) : null,
        tierId: tiers.get(c.tier) ?? null,
      },
      create: {
        clubId: club.id,
        cycleId: cycle.id,
        poolId: c.pool ? (poolId.get(c.pool) ?? null) : null,
        tierId: tiers.get(c.tier) ?? null,
        status: "RECONCILING",
        nonNegotiables: {
          create: (
            await prisma.nonNegotiable.findMany({ where: { active: true }, select: { id: true } })
          ).map((nn) => ({ nonNegotiableId: nn.id })),
        },
      },
    });
    assessmentId.set(c.name, a.id);
  }
  say(`clubs: ${data.clubs.length} (${newClubs} new)`);

  /* ------------------------------ allocations ----------------------------- */

  let allocated = 0;
  const skippedAlloc: string[] = [];
  for (const a of data.allocations) {
    const pid = a.pool ? poolId.get(a.pool) : null;
    const crit = byCode.get(a.code);
    const uid = assessorId.get(a.assessor);
    if (!pid || !crit || !uid) {
      skippedAlloc.push(`${a.pool ?? "—"}/${a.code}/${a.assessor}`);
      continue;
    }
    allocated += 1;
    if (DRY) continue;
    // Slot is unique per pool+criterion, and so is assessor per pool+criterion,
    // so a re-run has to tolerate both already being taken.
    const clash = await prisma.criterionAssignment.findFirst({
      where: {
        poolId: pid,
        criterionId: crit.id,
        OR: [{ slot: a.slot }, { assessorId: uid }],
      },
    });
    if (clash) continue;
    await prisma.criterionAssignment.create({
      data: { poolId: pid, criterionId: crit.id, assessorId: uid, slot: a.slot },
    });
  }
  say(`allocations: ${allocated}${skippedAlloc.length ? ` (${skippedAlloc.length} skipped)` : ""}`);

  /* --------------------------- the assessors' work ------------------------ */

  let scored = 0;
  const skippedScores = new Map<string, number>();
  const note = (why: string) => skippedScores.set(why, (skippedScores.get(why) ?? 0) + 1);

  for (const s of data.scores) {
    const aid = assessmentId.get(s.club);
    const crit = byCode.get(s.code);
    const uid = assessorId.get(s.assessor);
    if (!aid) { note("club not in this cycle"); continue; }
    if (!crit) { note("line item not in the rubric"); continue; }
    if (!uid) { note("assessor unknown"); continue; }
    if (s.stars === null) { note("no score recorded"); continue; }

    const stars = Math.max(0, Math.min(crit.maxScore, Math.round(s.stars)));
    scored += 1;
    if (DRY) continue;

    const row = await prisma.assessorScore.upsert({
      where: {
        assessmentId_assessorId_criterionId: {
          assessmentId: aid, assessorId: uid, criterionId: crit.id,
        },
      },
      update: { stars, comment: s.comment || null },
      create: { assessmentId: aid, assessorId: uid, criterionId: crit.id, stars, comment: s.comment || null },
    });

    // Which evidence points the assessor ticked, mapped by position. FQ's
    // sheets and the seeded catalogue can disagree on how many points an item
    // has, so anything past the end is dropped rather than guessed at.
    const subs = crit.subCriteria;
    const want = s.met.map((n) => subs[n - 1]?.id).filter((x): x is string => Boolean(x));
    await prisma.scoreEvidence.deleteMany({ where: { scoreId: row.id } });
    if (want.length > 0) {
      await prisma.scoreEvidence.createMany({
        data: want.map((subCriterionId) => ({ scoreId: row.id, subCriterionId })),
      });
    }
  }
  say(`assessor scores: ${scored}`);
  for (const [why, n] of skippedScores) say(`  skipped ${n}: ${why}`);

  /* ---------------------------- the agreed score -------------------------- */

  let finals = 0;
  for (const g of data.agreed) {
    const aid = assessmentId.get(g.club);
    const crit = byCode.get(g.code);
    if (!aid || !crit) continue;
    const stars = Math.max(0, Math.min(crit.maxScore, Math.round(g.stars)));
    finals += 1;
    if (DRY) continue;
    await prisma.finalScore.upsert({
      where: { assessmentId_criterionId: { assessmentId: aid, criterionId: crit.id } },
      update: { stars },
      create: {
        assessmentId: aid,
        criterionId: crit.id,
        stars,
        rationale: "Imported from Football Queensland's 2026 assessment workbooks.",
      },
    });
  }
  say(`agreed scores: ${finals}`);

  /* ------------------------------- portfolios ----------------------------- */

  // Which CDA looks after which club, from the Action Plan Matrix. This is the
  // visibility boundary — an assessor reaches a club only where their portfolio
  // and their line-item allocation overlap — so it is the difference between
  // twelve assessors who can see nothing and twelve who can work.
  let portfolios = 0;
  const missingClub = new Set<string>();
  for (const a of data.ambassadors) {
    const cid = clubId.get(a.club);
    const uid = assessorId.get(a.assessor);
    if (!cid) { missingClub.add(a.club); continue; }
    if (!uid) continue;
    portfolios += 1;
    if (DRY) continue;
    await prisma.clubAmbassador.upsert({
      where: { clubId_userId: { clubId: cid, userId: uid } },
      update: {},
      create: { clubId: cid, userId: uid },
    });
  }
  say(`ambassador portfolios: ${portfolios} over ${new Set(data.ambassadors.map((a) => a.club)).size} clubs`);
  if (missingClub.size) say(`  no such club: ${[...missingClub].join(", ")}`);

  const firstNameOnly = [...new Set(data.ambassadors.map((a) => a.assessor))].filter(
    (n) => !n.includes(" "),
  );

  /* -------------------------------- what next ----------------------------- */

  console.log("");
  say("done. Three things to check:");
  say("");
  say(`1. Assessor emails are derived as first.last@${EMAIL_DOMAIN}.`);
  say("   Correct any that are wrong before issuing sign-in links.");
  if (firstNameOnly.length) {
    say(`   ${firstNameOnly.join(", ")} appear on the Action Plan Matrix by first`);
    say("   name only, so those accounts need a surname and a real address.");
  }
  say("");
  say("2. The clubs' staff registers are in none of these workbooks, so Technical");
  say("   Qualifications is zero for everyone and the computed percentages are");
  say("   understated until the registers are entered.");
  say("");
  say("3. Nothing is locked or published. The portal computes each rating live");
  say("   from the imported scores — compare it against what FQ recorded before");
  say("   freezing anything.");
}

main()
  .catch((e) => {
    console.error("[import] failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
