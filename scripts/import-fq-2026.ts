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
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";

/**
 * Assessor addresses are derived, because the workbooks carry names only.
 *
 * Football Queensland's staff addresses are first name plus the initial of the
 * surname — Alec Wilson is alecw@, not alec.wilson@. Derived rather than
 * transcribed so a name correction produces the address with it, and checked
 * for collisions at the end of a run, because this shape has far less room in
 * it than a full name: two people whose first names match and whose surnames
 * start with the same letter would land on one address, and one account serving
 * two assessors would merge their scores with nothing on any screen saying so.
 */
const EMAIL_DOMAIN = process.env.FQ_ASSESSOR_DOMAIN ?? "footballqueensland.com.au";

/**
 * Meta key recording that this season has been loaded.
 *
 * Lives with the import rather than with either caller: `scripts/boot.ts`
 * writes it to import at most once, and `scripts/reset-cda.ts` clears it
 * because a reset deletes the very data it attests to. Two files agreeing on a
 * string by copying it is how they stop agreeing later.
 */
export const FQ_IMPORT_MARKER = "fq-2026-imported";

/**
 * Statuses the import must never move a club out of.
 *
 * Everything else is pre-result bookkeeping and the import is entitled to
 * advance it. These five mean the club has been given a rating — dragging one
 * back into reconciliation would unpublish a result somebody has already been
 * told about.
 */
const FROZEN_STATUSES: string[] = [
  "LOCKED",
  "PUBLISHED",
  "IN_REVIEW",
  "UNDER_APPEAL",
  "CONFIRMED",
];

/**
 * Assessors the Action Plan Matrix names by first name only.
 *
 * Kept here rather than corrected in the extracted JSON so that file stays a
 * faithful reading of the workbooks — re-running the extractor must not quietly
 * drop these. Football Queensland supplied the surnames; the workbook name on
 * the left is still what every allocation, score and portfolio row refers to.
 */
const REAL_NAMES: Record<string, string> = {
  Mike: "Michael Edwards",
  Ken: "Kenneth Mitchell",
  Riley: "Riley Pitchford",
  Daegal: "Daegal Richardson",
  // Two surnames. The last is taken as the family name, giving rodrigor@ —
  // worth confirming against the real mailbox, since rodrigof@ is the other
  // reading and nothing in the data settles it.
  Rodrigo: "Rodrigo Ferrarez Rebeschini",
};

/**
 * Runs prepared writes in batched transactions rather than one at a time.
 *
 * Against a local SQLite file the difference is invisible, which is exactly how
 * this got missed: a row at a time is a few microseconds each. Against a hosted
 * database every statement is a network round trip, and the web server is not
 * listening while boot runs — so a slow import is a failed health check and a
 * rolled-back deploy, on the one host where this import has to run.
 *
 * Batching alone is not the fix, and it is worth being precise about why:
 * Prisma still issues each statement in a batched transaction individually, so
 * this buys perhaps 2.5x. The rest comes from the callers reading current state
 * once and writing only the difference. Measured on the real 2026 data, the two
 * together take a fresh import from 14,273 statements to 1,117, and a re-run
 * that changes nothing to 608.
 *
 * 200 per batch, or 500 for plain createMany: comfortably inside libSQL's limit
 * on a single request.
 */
async function inBatches<T>(items: T[], run: (chunk: T[]) => Promise<unknown>, size = 200) {
  for (let i = 0; i < items.length; i += size) {
    await run(items.slice(i, i + size));
  }
}

/** Name tokens, lowercased and stripped of accents and punctuation. */
function tokens(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** first name + surname initial, which is how FQ issues staff addresses. */
function emailFor(name: string) {
  const parts = tokens(name);
  if (parts.length === 0) return `unknown@${EMAIL_DOMAIN}`;
  const first = parts[0];
  const surname = parts[parts.length - 1];
  return `${first}${parts.length > 1 ? surname[0] : ""}@${EMAIL_DOMAIN}`;
}

/**
 * Addresses this person may be sitting under from an earlier import.
 *
 * An earlier version of this script derived first.last@, and before the
 * surnames arrived it derived a bare first name for four of them. Both shapes
 * are still in databases that have been imported once, so both have to be
 * recognised — otherwise a re-run opens a second account and strands the first
 * one's allocations, scores and portfolios.
 */
function legacyEmailsFor(workbookName: string, realName: string) {
  const dotted = (n: string) => `${tokens(n).join(".")}@${EMAIL_DOMAIN}`;
  const current = emailFor(realName);
  return [...new Set([dotted(realName), dotted(workbookName)])].filter((e) => e !== current);
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

/**
 * Loads the season. Exported so `scripts/boot.ts` can run it on a host that
 * offers no shell — see FQ_IMPORT_2026 there.
 */
export async function importFq2026(prisma: PrismaClient, { dry = false } = {}) {
  const DRY = dry;
  const file = path.join(process.cwd(), "prisma", "data", "fq-2026.json");
  const data: Data = JSON.parse(readFileSync(file, "utf8"));

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
  // Before writing anything. first-name-plus-initial has little room in it, and
  // two assessors sharing an address would quietly become one account holding
  // both their allocations and both their scores — a mess to unpick after a
  // season of scoring, and invisible until somebody noticed the totals.
  const byEmail = new Map<string, string[]>();
  for (const name of names) {
    const real = REAL_NAMES[name] ?? name;
    const list = byEmail.get(emailFor(real)) ?? [];
    list.push(real);
    byEmail.set(emailFor(real), list);
  }
  const clashes = [...byEmail].filter(([, who]) => who.length > 1);
  if (clashes.length) {
    for (const [email, who] of clashes) {
      console.error(`[import] ADDRESS CLASH: ${who.join(" and ")} both derive ${email}`);
    }
    throw new Error(
      "Two assessors derive the same address. Add the real addresses to REAL_NAMES " +
        "before importing — one account cannot serve two assessors.",
    );
  }

  const assessorId = new Map<string, string>();
  let newAssessors = 0;
  let renamed = 0;

  for (const name of names) {
    const real = REAL_NAMES[name] ?? name;
    const email = emailFor(real);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      assessorId.set(name, existing.id);
      continue;
    }

    // A corrected name or a corrected address format has to move the existing
    // account, not open a second one beside it. Creating a fresh user would
    // leave every allocation, score and portfolio on the old account while the
    // sign-in link went to the new one — the assessor would log in to an empty
    // screen and nothing on any page would say why.
    let moved = false;
    for (const legacy of legacyEmailsFor(name, real)) {
      const old = await prisma.user.findUnique({ where: { email: legacy } });
      if (!old) continue;
      renamed += 1;
      if (!DRY) {
        await prisma.user.update({ where: { id: old.id }, data: { email, name: real } });
      }
      assessorId.set(name, old.id);
      moved = true;
      break;
    }
    if (moved) continue;

    newAssessors += 1;
    if (DRY) continue;
    const user = await prisma.user.create({
      data: { email, name: real, title: "Club Development Ambassador", role: "ASSESSOR" },
    });
    assessorId.set(name, user.id);
  }
  say(
    `assessors: ${names.length} (${newAssessors} new` +
      (renamed ? `, ${renamed} given a full name and address` : "") +
      ")",
  );

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

  // Every existing assessment's status, in one query rather than one per club,
  // so the loop below can tell a frozen result from a live one without paying a
  // round trip each time to find out.
  const statusBefore = new Map(
    (
      await prisma.clubAssessment.findMany({
        where: { cycleId: cycle.id },
        select: { clubId: true, status: true },
      })
    ).map((a) => [a.clubId, a.status as string]),
  );
  let advanced = 0;

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

    // The status has to move on an update too, not only on create.
    //
    // It didn't, and the consequence stayed invisible until the data was in
    // front of somebody: production already held 44 of these clubs from an
    // earlier bulk upload, so their assessments were updated rather than
    // created and kept NOT_STARTED. The board then read "Not started" beside a
    // club with 43 of 54 line items reconciled, and — worse than the
    // contradiction — clubCanEdit() is true for NOT_STARTED, so a club could
    // still open and overwrite the evidence behind a season that is finished.
    //
    // RECONCILING is the honest resting state for an imported season: FQ has
    // scored it, the agreed scores are loaded, and what remains is the Unit's
    // to settle. It also stops assessors writing, which is correct here and is
    // the same in both statuses — that is not what this fixes.
    //
    // Only ever forwards. A club whose rating is already locked or released has
    // been given a result, and dragging it back into reconciliation would
    // unpublish a rating a club has already been told about.
    const frozen = FROZEN_STATUSES.includes(statusBefore.get(club.id) ?? "");

    const a = await prisma.clubAssessment.upsert({
      where: { clubId_cycleId: { clubId: club.id, cycleId: cycle.id } },
      update: {
        poolId: c.pool ? (poolId.get(c.pool) ?? null) : null,
        tierId: tiers.get(c.tier) ?? null,
        ...(frozen ? {} : { status: "RECONCILING" as const }),
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
    const was = statusBefore.get(club.id);
    if (was && was !== "RECONCILING" && !frozen) advanced += 1;
  }
  say(`clubs: ${data.clubs.length} (${newClubs} new)`);
  if (advanced) {
    say(`  ${advanced} moved into reconciliation — they were stuck in a pre-assessment`);
    say("  status, which let clubs overwrite evidence behind a finished season");
  }
  const frozenCount = [...statusBefore.values()].filter((s) => FROZEN_STATUSES.includes(s)).length;
  if (frozenCount) say(`  ${frozenCount} left as they were — already locked or released`);

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

  const skippedScores = new Map<string, number>();
  const note = (why: string) => skippedScores.set(why, (skippedScores.get(why) ?? 0) + 1);

  // Worked out in full before anything is written, so the writes can go in
  // batches. Nothing here depends on the database.
  type Pending = {
    aid: string; uid: string; cid: string; stars: number; comment: string | null; want: string[];
  };

  // Keyed, because FQ's sheets can carry the same assessor scoring the same
  // club on the same line item twice. Writing a row at a time used to hide
  // that — the second pass simply overwrote the first — but a batch cannot, so
  // the last entry wins here instead, and a duplicate that *disagrees* with
  // what it replaces is reported rather than quietly resolved.
  const pending = new Map<string, Pending>();
  let duplicates = 0;
  const conflicts: string[] = [];

  for (const s of data.scores) {
    const aid = assessmentId.get(s.club);
    const crit = byCode.get(s.code);
    const uid = assessorId.get(s.assessor);
    if (!aid) { note("club not in this cycle"); continue; }
    if (!crit) { note("line item not in the rubric"); continue; }
    if (!uid) { note("assessor unknown"); continue; }
    if (s.stars === null) { note("no score recorded"); continue; }

    // Which evidence points the assessor ticked, mapped by position. FQ's
    // sheets and the seeded catalogue can disagree on how many points an item
    // has, so anything past the end is dropped rather than guessed at.
    const subs = crit.subCriteria;
    const row: Pending = {
      aid,
      uid,
      cid: crit.id,
      stars: Math.max(0, Math.min(crit.maxScore, Math.round(s.stars))),
      comment: s.comment || null,
      want: s.met.map((n) => subs[n - 1]?.id).filter((x): x is string => Boolean(x)),
    };

    const key = `${aid}:${uid}:${crit.id}`;
    const already = pending.get(key);
    if (already) {
      duplicates += 1;
      const same =
        already.stars === row.stars &&
        already.comment === row.comment &&
        already.want.join(",") === row.want.join(",");
      if (!same) conflicts.push(`${s.assessor} on ${s.code} for ${s.club}`);
    }
    pending.set(key, row);
  }

  const writes = [...pending.values()];
  const scored = writes.length;

  if (!DRY && writes.length) {
    // Read first, then write only what differs.
    //
    // An upsert per score is the obvious shape and the wrong one here: it costs
    // a round trip per row whether or not the row needs changing, so re-running
    // an import that changes nothing costs exactly as much as the first one.
    // Reading the cycle's scores in a single query and then writing only the
    // difference makes a no-op re-run almost free, which is what a boot with
    // FQ_IMPORT_2026 still set, or a second attempt after a half-finished run,
    // actually is.
    const rows = await prisma.assessorScore.findMany({
      where: { assessment: { cycleId: cycle.id } },
      select: {
        id: true, assessmentId: true, assessorId: true, criterionId: true,
        stars: true, comment: true,
        evidence: { select: { subCriterionId: true } },
      },
    });
    const have = new Map(
      rows.map((r) => [`${r.assessmentId}:${r.assessorId}:${r.criterionId}`, r]),
    );

    const toCreate: Pending[] = [];
    const toUpdate: { id: string; w: Pending }[] = [];
    for (const [key, w] of pending) {
      const cur = have.get(key);
      if (!cur) toCreate.push(w);
      else if (cur.stars !== w.stars || cur.comment !== w.comment) toUpdate.push({ id: cur.id, w });
    }

    await inBatches(
      toCreate,
      (chunk) =>
        prisma.assessorScore.createMany({
          data: chunk.map((w) => ({
            assessmentId: w.aid, assessorId: w.uid, criterionId: w.cid,
            stars: w.stars, comment: w.comment,
          })),
        }),
      500,
    );
    await inBatches(toUpdate, (chunk) =>
      prisma.$transaction(
        chunk.map((u) =>
          prisma.assessorScore.update({
            where: { id: u.id },
            data: { stars: u.w.stars, comment: u.w.comment },
          }),
        ),
      ),
    );

    // Ids for anything just created; the rest are already known.
    if (toCreate.length) {
      const fresh = await prisma.assessorScore.findMany({
        where: { assessment: { cycleId: cycle.id } },
        select: {
          id: true, assessmentId: true, assessorId: true, criterionId: true,
          stars: true, comment: true,
          evidence: { select: { subCriterionId: true } },
        },
      });
      have.clear();
      for (const r of fresh) have.set(`${r.assessmentId}:${r.assessorId}:${r.criterionId}`, r);
    }

    // The ticks are stated in full by the import, so a score whose set differs
    // has its evidence replaced — but only that score's. Comparing first keeps
    // an unchanged re-run from rewriting three thousand sets of ticks.
    const stale: string[] = [];
    const evidence: { scoreId: string; subCriterionId: string }[] = [];
    for (const [key, w] of pending) {
      const cur = have.get(key);
      if (!cur) continue;
      const before = [...cur.evidence.map((e) => e.subCriterionId)].sort().join(",");
      if (before === [...w.want].sort().join(",")) continue;
      stale.push(cur.id);
      for (const subCriterionId of w.want) evidence.push({ scoreId: cur.id, subCriterionId });
    }

    await inBatches(stale, (chunk) =>
      prisma.scoreEvidence.deleteMany({ where: { scoreId: { in: chunk } } }),
    );
    await inBatches(evidence, (chunk) => prisma.scoreEvidence.createMany({ data: chunk }), 500);
  }

  say(`assessor scores: ${scored}`);
  for (const [why, n] of skippedScores) say(`  skipped ${n}: ${why}`);
  if (duplicates) {
    say(`  ${duplicates} duplicate row${duplicates === 1 ? "" : "s"} in the workbooks, last kept`);
    for (const c of conflicts) say(`  DISAGREEING DUPLICATE: ${c} — scored twice, differently`);
  }

  /* ---------------------------- the agreed score -------------------------- */

  const agreed: { aid: string; cid: string; stars: number }[] = [];
  for (const g of data.agreed) {
    const aid = assessmentId.get(g.club);
    const crit = byCode.get(g.code);
    if (!aid || !crit) continue;
    agreed.push({ aid, cid: crit.id, stars: Math.max(0, Math.min(crit.maxScore, Math.round(g.stars))) });
  }
  if (!DRY && agreed.length) {
    // Same read-then-write-the-difference as the assessor scores above.
    const current = await prisma.finalScore.findMany({
      where: { assessment: { cycleId: cycle.id } },
      select: { id: true, assessmentId: true, criterionId: true, stars: true },
    });
    const held = new Map(current.map((f) => [`${f.assessmentId}:${f.criterionId}`, f]));

    const newFinals = agreed.filter((g) => !held.has(`${g.aid}:${g.cid}`));
    const changed = agreed
      .map((g) => ({ cur: held.get(`${g.aid}:${g.cid}`), g }))
      .filter((x) => x.cur && x.cur.stars !== x.g.stars);

    await inBatches(
      newFinals,
      (chunk) =>
        prisma.finalScore.createMany({
          data: chunk.map((g) => ({
            assessmentId: g.aid,
            criterionId: g.cid,
            stars: g.stars,
            rationale: "Imported from Football Queensland's 2026 assessment workbooks.",
          })),
        }),
      500,
    );
    await inBatches(changed, (chunk) =>
      prisma.$transaction(
        chunk.map((x) =>
          prisma.finalScore.update({ where: { id: x.cur!.id }, data: { stars: x.g.stars } }),
        ),
      ),
    );
  }
  say(`agreed scores: ${agreed.length}`);

  /* ------------------------------- portfolios ----------------------------- */

  // Which CDA looks after which club, from the Action Plan Matrix. Scoring
  // follows the pool, not this — but the portfolio is what lets an assessor
  // open a club's submitted evidence, and it is the year-round support
  // relationship the Unit actually manages people by.
  const links: { cid: string; uid: string }[] = [];
  const missingClub = new Set<string>();
  for (const a of data.ambassadors) {
    const cid = clubId.get(a.club);
    const uid = assessorId.get(a.assessor);
    if (!cid) { missingClub.add(a.club); continue; }
    if (!uid) continue;
    links.push({ cid, uid });
  }
  if (!DRY && links.length) {
    // Nothing to update — a portfolio link either exists or doesn't — so the
    // ones already there are simply left alone.
    const already = new Set(
      (await prisma.clubAmbassador.findMany({ select: { clubId: true, userId: true } })).map(
        (r) => `${r.clubId}:${r.userId}`,
      ),
    );
    const fresh = links.filter((l) => !already.has(`${l.cid}:${l.uid}`));
    await inBatches(
      fresh,
      (chunk) =>
        prisma.clubAmbassador.createMany({
          data: chunk.map((l) => ({ clubId: l.cid, userId: l.uid })),
        }),
      500,
    );
  }
  const portfolios = links.length;
  say(`ambassador portfolios: ${portfolios} over ${new Set(data.ambassadors.map((a) => a.club)).size} clubs`);
  if (missingClub.size) say(`  no such club: ${[...missingClub].join(", ")}`);

  // Anyone still carrying a workbook name with no surname. The five FQ has
  // since named are not listed: repeating them would send somebody looking for
  // a problem that has been fixed.
  const firstNameOnly = names.filter((n) => !(REAL_NAMES[n] ?? n).includes(" "));

  /* -------------------------------- what next ----------------------------- */

  console.log("");
  say("done. Three things to check:");
  say("");
  say(`1. Assessor emails are derived as firstname + surname initial @${EMAIL_DOMAIN},`);
  say("   which is how Football Queensland issues staff addresses. Spot-check them");
  say("   against the real mailboxes before issuing sign-in links — a derived");
  say("   address that misses is a link nobody receives.");
  if (firstNameOnly.length) {
    const one = firstNameOnly.length === 1;
    say(`   ${firstNameOnly.join(", ")} ${one ? "appears" : "appear"} on the Action Plan Matrix by`);
    say(`   first name only, so ${one ? "that account has" : "those accounts have"} no surname initial at all.`);
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

// Only when run directly; scripts/boot.ts owns the client and the error path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry-run");
  if (!dry && !process.argv.includes("--yes")) {
    console.log("[import] pass --dry-run to preview, or --yes to write.");
  } else {
    const prisma = new PrismaClient({ adapter: createAdapter() });
    importFq2026(prisma, { dry })
      .catch((e) => {
        console.error("[import] failed:", e);
        process.exitCode = 1;
      })
      .finally(() => prisma.$disconnect());
  }
}
