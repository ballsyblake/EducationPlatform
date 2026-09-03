/**
 * Seeds the CDA portal.
 *
 * Two halves, separately callable:
 *
 *   seedCatalog()  — qualifications, Non-Negotiables and criteria. Idempotent
 *                    and additive: it creates what's missing and never
 *                    overwrites wording the CDU has since edited, so it's safe
 *                    to run on every deploy.
 *   seedDemo()     — clubs, assessors and part-finished assessments. Destructive
 *                    to CDA data, for a fresh instance only.
 */
import { createHash } from "node:crypto";
import type { PrismaClient, Shield } from "../generated/prisma/client.ts";
import { defaultThresholds, starsFromEvidence } from "../src/lib/cda/rubric.ts";
import { CRITERIA, NON_NEGOTIABLES, QUALIFICATIONS } from "./cda-catalog.ts";
import { STRUCTURE_ROLES } from "../src/lib/cda/structure.ts";

/** Where the catalogue fingerprint lives. */
const CATALOG_FINGERPRINT_KEY = "cda.catalog.fingerprint";

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

const TIERS = [
  // 330 is FQ's own Technical maximum for a Tier 1 club on their 2026 CASE 2
  // team profile. Tier 2 is scaled to keep Technical at about a quarter of the
  // rating there too, rather than ballooning to 44% because the tier is
  // assessed on a third of the line items.
  { code: "T1", name: "Tier 1", technicalMaxPoints: 330 },
  { code: "T2", name: "Tier 2", technicalMaxPoints: 112 },
];

/**
 * A hash of the catalogue this image ships.
 *
 * Everything the sync would write goes in, so any change to a criterion,
 * threshold, Non-Negotiable, qualification, tier or structure role produces a
 * different fingerprint and the sync runs. Nothing else does, so a boot that
 * ships the same catalogue can tell in one query that there is nothing to do.
 */
function catalogFingerprint() {
  return createHash("sha256")
    .update(JSON.stringify({ TIERS, QUALIFICATIONS, NON_NEGOTIABLES, CRITERIA, STRUCTURE_ROLES }))
    .digest("hex");
}

/**
 * Brings the rubric catalogue in the database up to what this image ships.
 *
 * `skipIfUnchanged` is for the container entrypoint, which runs this on every
 * boot. The work is ~160 sequential upserts, and on a hosted database every one
 * of those is a network round trip — several seconds of a cold start spent
 * establishing that nothing changed since the last boot. With the flag set it
 * compares one stored hash first and returns.
 *
 * Left off everywhere else. Someone running `npm run cda:catalog` by hand has
 * asked for the sync, and answering "no need" to a direct instruction is how
 * you end up debugging a cache instead of a rubric.
 */
export async function seedCatalog(
  prisma: PrismaClient,
  { skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {},
) {
  const fingerprint = catalogFingerprint();

  if (skipIfUnchanged) {
    const seen = await prisma.meta.findUnique({ where: { key: CATALOG_FINGERPRINT_KEY } });
    if (seen?.value === fingerprint) {
      console.log("[cda] catalogue unchanged since last boot — skipped.");
      return;
    }
  }

  for (const [i, q] of QUALIFICATIONS.entries()) {
    await prisma.qualification.upsert({
      where: { code: q.code },
      // Only the ordering is corrected on an existing row. Points and labels
      // are the CDU's to change once the instance is live; re-running this
      // must not quietly revert a rubric decision they made deliberately.
      update: { position: i },
      create: { ...q, position: i },
    });
  }

  for (const [i, nn] of NON_NEGOTIABLES.entries()) {
    await prisma.nonNegotiable.upsert({
      where: { code: nn.code },
      // Wording is the CDU's to change once live, but `kind` is structural: it
      // decides whether a miss blocks the shield or caps it. A release that
      // moves a check from gate to threshold has to reach a running instance,
      // the same way a changed weight does.
      update: {
        position: i,
        active: true,
        kind: nn.kind ?? "GATE",
        format: nn.format ?? null,
        shieldGuidance: nn.shieldGuidance ?? null,
      },
      create: { ...nn, position: i },
    });
  }

  // Checks this release no longer ships are retired, not deleted — their
  // results are part of a club's history. Retired checks are filtered out of
  // scoring, so a withdrawn check stops mattering without anything having to
  // be verified against it.
  const retiredChecks = await prisma.nonNegotiable.updateMany({
    where: { active: true, code: { notIn: NON_NEGOTIABLES.map((n) => n.code) } },
    data: { active: false },
  });
  if (retiredChecks.count > 0) {
    console.log(`[cda] retired ${retiredChecks.count} Non-Negotiables no longer in the catalogue`);
  }

  await backfillNonNegotiables(prisma);
  await seedStructureRoles(prisma);
  await ensureStructureStandards(prisma);

  // Tiers first: criteria attach to them, and a Tier 2 club is assessed on a
  // subset of the same coded items rather than a different catalogue.
  for (const [i, t] of TIERS.entries()) {
    await prisma.tier.upsert({
      where: { code: t.code },
      update: { name: t.name, position: i, technicalMaxPoints: t.technicalMaxPoints },
      create: { ...t, position: i },
    });
  }
  const tierIds = new Map(
    (await prisma.tier.findMany()).map((t) => [t.code, t.id]),
  );

  let position = 0;
  for (const { domain, criteria } of CRITERIA) {
    for (const c of criteria) {
      const maxScore = c.maxScore ?? 3;
      // FQ states the bands for its own items; anything without them falls back
      // to the shape of FQ's, derived from the number of evidence points.
      const derived = defaultThresholds(c.evidence.length, maxScore);
      const thresholds = {
        oneStarAt: c.oneStarAt ?? derived.oneStarAt,
        twoStarAt: c.twoStarAt ?? derived.twoStarAt,
        threeStarAt: c.threeStarAt ?? derived.threeStarAt,
        fourStarAt: maxScore >= 4 ? (c.fourStarAt ?? derived.fourStarAt ?? null) : null,
      };
      const tiers = {
        set: (c.tiers ?? ["T1"])
          .map((code) => tierIds.get(code))
          .filter((id): id is string => Boolean(id))
          .map((id) => ({ id })),
      };
      const existing = await prisma.criterion.findUnique({ where: { code: c.code } });

      if (existing) {
        // Wording is the CDU's and is never touched — they reword criteria and
        // evidence points between cycles and that must survive a deploy.
        //
        // The scoring structure is not theirs: weighting, maximum, bands and
        // mode are set in this file and have no editor in the app, so a release
        // that re-tunes them has to be able to land. Leaving them alone instead
        // meant a rubric change could only ever reach a fresh database, which
        // is how the catalogue quietly kept its old weights through a rescale.
        await prisma.criterion.update({
          where: { code: c.code },
          data: {
            position: position++,
            weight: c.weight ?? 6,
            maxScore,
            mode: c.mode ?? "EVIDENCE",
            area: c.area ?? null,
            evidenceProvisional: c.evidenceProvisional ?? false,
            tiers,
            ...thresholds,
          },
        });
        continue;
      }

      await prisma.criterion.create({
        data: {
          domain,
          code: c.code,
          title: c.title,
          description: c.description ?? null,
          weight: c.weight ?? 6,
          maxScore,
          mode: c.mode ?? "EVIDENCE",
          area: c.area ?? null,
          evidenceProvisional: c.evidenceProvisional ?? false,
          tiers: { connect: tiers.set },
          position: position++,
          ...thresholds,
          subCriteria: {
            create: c.evidence.map((text, i) => ({ text, position: i })),
          },
        },
      });
    }
  }

  // Anything active that this release no longer ships is retired rather than
  // deleted: scores already reference it and deleting would take them with it.
  // Inactive criteria are excluded from scoring, so a retired item stops
  // counting without erasing the history of when it did.
  const shipped = CRITERIA.flatMap((d) => d.criteria.map((c) => c.code));
  const retired = await prisma.criterion.updateMany({
    where: { active: true, code: { notIn: shipped } },
    data: { active: false },
  });
  if (retired.count > 0) {
    console.log(`[cda] retired ${retired.count} criteria no longer in the catalogue`);
  }

  const counts = {
    qualifications: await prisma.qualification.count(),
    nonNegotiables: await prisma.nonNegotiable.count({ where: { active: true } }),
    criteria: await prisma.criterion.count(),
    subCriteria: await prisma.subCriterion.count(),
  };
  console.log(
    `[cda] catalogue: ${counts.criteria} criteria (${counts.subCriteria} evidence points), ` +
      `${counts.nonNegotiables} Non-Negotiables, ${counts.qualifications} qualifications`,
  );

  // Written last, so a run that fails part-way leaves no fingerprint and the
  // next boot does the work again rather than trusting a half-applied rubric.
  await prisma.meta.upsert({
    where: { key: CATALOG_FINGERPRINT_KEY },
    update: { value: fingerprint },
    create: { key: CATALOG_FINGERPRINT_KEY, value: fingerprint },
  });
}

/**
 * The eleven organisational functions, plus the two documents submitted with
 * them.
 *
 * Structural rather than editorial: the kind decides which answers a club can
 * give and whether the role counts towards coverage, so a release that changes
 * one has to reach a running instance the same way a changed weight does. The
 * label is left alone, since the CDU may reword a role to match how a club
 * actually titles it.
 */
async function seedStructureRoles(prisma: PrismaClient) {
  for (const [i, r] of STRUCTURE_ROLES.entries()) {
    await prisma.structureRole.upsert({
      where: { code: r.code },
      update: {
        position: i,
        active: true,
        kind: r.kind,
        counts: r.counts ?? true,
      },
      create: { ...r, counts: r.counts ?? true, position: i },
    });
  }

  const retired = await prisma.structureRole.updateMany({
    where: { active: true, code: { notIn: STRUCTURE_ROLES.map((r) => r.code) } },
    data: { active: false },
  });
  if (retired.count > 0) {
    console.log(`[cda] retired ${retired.count} structure roles no longer in the catalogue`);
  }
}

/**
 * The per-shield structure bar for one cycle.
 *
 * Seeded per cycle because FQ phases the coverage requirement in over four
 * years — 8 of 11 functions for Gold in 2026, 9 in 2027, all 11 in 2028 — so a
 * new year is a row, not a code change. Only created when missing: once a cycle
 * is running, its bar is what its clubs were judged against and a redeploy must
 * not move it.
 */
/**
 * Gives every cycle a structure bar, creating one only where none exists.
 *
 * Runs on every boot so a cycle created from the portal — which is how a real
 * instance starts, unlike the demo — gets its standards without anyone knowing
 * they exist. A cycle that already has them keeps them: once clubs are being
 * judged against a bar, a redeploy must not move it.
 *
 * Every cycle currently gets the 2026 figures, because they are the only ones
 * Football Queensland has published. 2027 and 2028 raise the coverage counts
 * (Gold to 9 then 11), and when FQ issues them they belong here as a per-year
 * table rather than as an edit to this one.
 */
async function ensureStructureStandards(prisma: PrismaClient) {
  const { ensureCycleStandards } = await import("../src/lib/cda/assessment.ts");
  for (const cycle of await prisma.cycle.findMany({ select: { id: true } })) {
    await ensureCycleStandards(cycle.id);
  }
}

/**
 * Gives every assessment still in progress a result row for each active check.
 *
 * Result rows are created when an assessment is opened, which is fine until a
 * release adds a check — every assessment opened before it would then be scored
 * against eight checks while new ones face nine, and nobody would see the
 * missing one to answer it. Locked assessments are left alone: their result is
 * already frozen and already communicated, and retrospectively adding an
 * unanswerable check to it would strip a club of a shield it has been given.
 */
async function backfillNonNegotiables(prisma: PrismaClient) {
  const active = await prisma.nonNegotiable.findMany({
    where: { active: true },
    select: { id: true },
  });
  const open = await prisma.clubAssessment.findMany({
    where: { lockedAt: null },
    select: { id: true, nonNegotiables: { select: { nonNegotiableId: true } } },
  });

  const missing = open.flatMap((a) => {
    const have = new Set(a.nonNegotiables.map((r) => r.nonNegotiableId));
    return active
      .filter((n) => !have.has(n.id))
      .map((n) => ({ assessmentId: a.id, nonNegotiableId: n.id }));
  });

  if (missing.length > 0) {
    await prisma.nonNegotiableResult.createMany({ data: missing });
    console.log(
      `[cda] added ${missing.length} Non-Negotiable checks to assessments still in progress`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Demo data                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A fixed-seed PRNG.
 *
 * The demo data has to be the same on every machine — a screenshot of a club
 * rated Gold shouldn't come out Silver on the next person's laptop, and a
 * reconciliation screen is only useful to look at if the disagreements it shows
 * are the ones that were designed in.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const CLUBS = [
  {
    name: "Brisbane Cityside FC",
    slug: "brisbane-cityside",
    zone: "Brisbane Metro",
    tier: "NPL",
    strength: 0.88,
    admin: { email: "admin@cityside.example.com", name: "Priya Raman" },
  },
  {
    name: "Redlands United SC",
    slug: "redlands-united",
    zone: "Brisbane Metro",
    tier: "FQPL",
    strength: 0.72,
    admin: { email: "admin@redlands.example.com", name: "Dane Whitfield" },
  },
  {
    name: "Toowoomba Ranges FC",
    slug: "toowoomba-ranges",
    zone: "Darling Downs",
    tier: "FQPL",
    strength: 0.61,
    admin: { email: "admin@ranges.example.com", name: "Sione Latu" },
  },
  {
    name: "Cairns Tropics FC",
    slug: "cairns-tropics",
    zone: "Far North Queensland",
    tier: "Community",
    strength: 0.48,
    admin: { email: "admin@tropics.example.com", name: "Mel Ashcroft" },
  },
  {
    name: "Sunshine Coast Wanderers",
    slug: "sunshine-coast-wanderers",
    zone: "Sunshine Coast",
    tier: "NPL",
    strength: 0.79,
    admin: { email: "admin@scwanderers.example.com", name: "Jordan Ikeda" },
  },
  {
    name: "Rockhampton Central FC",
    slug: "rockhampton-central",
    zone: "Central Queensland",
    tier: "Community",
    strength: 0.4,
    admin: { email: "admin@rockycentral.example.com", name: "Bec Alderton" },
  },
  // Clears Tier 2's own bar, so its award is Development Committed — the only
  // rating a Tier 2 club can be given. Worth a club of its own: it is a
  // different outcome from Rockhampton's, which clears nothing and fails a gate
  // check besides, and the two look identical on a dashboard unless both are in
  // the data.
  //
  // Strength was 0.3 while the badge was wrongly modelled as something a club
  // received for scoring *under* 40%. It has to clear 55% to earn the rating
  // FQ actually awards.
  {
    name: "Mount Isa Rovers FC",
    slug: "mount-isa-rovers",
    zone: "North West Queensland",
    tier: "Community",
    strength: 0.85,
    admin: { email: "admin@misarovers.example.com", name: "Toby Nguyen-Hale" },
  },
];

/**
 * The assessor pool.
 *
 * Larger than it needs to be for six clubs, because vertical assessment spreads
 * work by line item: forty items across two pools is eighty allocations, and a
 * pool of four would give everyone twenty line items each. FQ's own sheet shows
 * seven or eight names across eighteen items.
 */
const ASSESSORS = [
  { email: "n.calloway@fq.example.com", name: "Nina Calloway", title: "Club Development Assessor" },
  { email: "d.marchetti@fq.example.com", name: "Dario Marchetti", title: "Technical Assessor" },
  { email: "a.baptiste@fq.example.com", name: "Aimee Baptiste", title: "Club Development Assessor" },
  { email: "k.oyelaran@fq.example.com", name: "Kola Oyelaran", title: "Regional Assessor" },
  { email: "s.whitlam@fq.example.com", name: "Sara Whitlam", title: "Technical Assessor" },
  { email: "j.pereira@fq.example.com", name: "Joel Pereira", title: "Club Development Assessor" },
  { email: "r.stavros@fq.example.com", name: "Ruth Stavros", title: "Observation Assessor" },
  { email: "b.iremonger@fq.example.com", name: "Ben Iremonger", title: "Observation Assessor" },
];

/**
 * Staff templates by club strength band. A stronger club has more of the key
 * roles filled, by better-qualified and more securely employed people — which
 * is exactly what the Technical Qualifications domain is meant to detect, so
 * the demo data has to actually vary along those axes rather than only in name.
 */
type StaffTemplate = {
  role: string;
  name: string;
  qual: string;
  years: number;
  employment: string;
  gender: string;
};

function staffFor(strength: number, random: () => number): StaffTemplate[] {
  const strong = strength >= 0.75;
  const middling = strength >= 0.55;

  const first = [
    "Alex", "Sam", "Jess", "Mia", "Tom", "Ella", "Nick", "Hana", "Owen", "Zara",
    "Luca", "Freya", "Marcus", "Nadia", "Cody", "Isla", "Reuben", "Tui", "Bree", "Kai",
  ];
  const last = [
    "Barrow", "Nkemelu", "Sciarra", "Whitlock", "Farah", "Donnelly", "Vuong", "Ashby",
    "Okonkwo", "Pereira", "Mackenzie", "Halloran", "Tuipulotu", "Reyes", "Brandt",
  ];

  let n = 0;
  const nextName = () => {
    const name = `${first[n % first.length]} ${last[(n * 7) % last.length]}`;
    n += 1;
    return name;
  };

  const pick = <T,>(options: T[]) => options[Math.floor(random() * options.length)];

  const staff: StaffTemplate[] = [];

  const add = (
    role: string,
    count: number,
    quals: string[],
    years: number[],
    employments: string[],
    gender?: string,
  ) => {
    for (let i = 0; i < count; i += 1) {
      staff.push({
        role,
        name: nextName(),
        qual: pick(quals),
        years: pick(years),
        employment: pick(employments),
        gender: gender ?? (random() < 0.3 ? "FEMALE" : "MALE"),
      });
    }
  };

  // Technical Director — the single heaviest role, so it's what separates the
  // bands most visibly.
  if (strong) add("TECHNICAL_DIRECTOR", 1, ["AFC_A", "AFC_PRO"], [8, 12, 15], ["FULL_TIME"]);
  else if (middling) add("TECHNICAL_DIRECTOR", 1, ["AFC_B"], [4, 6], ["PART_TIME"]);
  else add("TECHNICAL_DIRECTOR", 1, ["AFC_C"], [2, 3], ["VOLUNTEER"]);

  if (strong) add("HEAD_OF_YOUTH_ACADEMY", 1, ["AFC_A_YOUTH", "AFC_B"], [6, 9], ["FULL_TIME", "PART_TIME"]);
  else if (middling) add("HEAD_OF_YOUTH_ACADEMY", 1, ["AFC_B_YOUTH", "AFC_C"], [3, 5], ["PART_TIME"]);
  // Weak clubs have nobody in this role at all, which is the point.

  add(
    "SENIOR_HEAD_COACH",
    2,
    strong ? ["AFC_A", "AFC_B"] : middling ? ["AFC_B", "AFC_C"] : ["AFC_C", "FA_GAME_TRAINING"],
    strong ? [7, 10] : [2, 4, 5],
    strong ? ["PART_TIME", "CONTRACT"] : ["VOLUNTEER", "CONTRACT"],
  );

  add(
    "YOUTH_HEAD_COACH",
    strong ? 4 : middling ? 3 : 2,
    strong ? ["AFC_B_YOUTH", "AFC_C"] : middling ? ["AFC_C", "FA_GAME_TRAINING"] : ["FA_SKILL_TRAINING", "FA_GAME_TRAINING"],
    strong ? [4, 6, 8] : [1, 2, 3],
    strong ? ["PART_TIME", "CONTRACT"] : ["VOLUNTEER"],
  );

  add(
    "GOALKEEPING_COACH",
    strong ? 2 : 1,
    strong ? ["AFC_GK_B", "AFC_GK_A"] : middling ? ["FA_GK_C"] : ["FA_GK_YOUTH"],
    strong ? [6, 9] : [2, 3],
    strong ? ["PART_TIME"] : ["VOLUNTEER"],
  );

  // Non-Negotiable 3 needs a female coach in a technical role; the weakest club
  // deliberately doesn't have one, so the eligibility gate has something to fail.
  if (strength > 0.45) {
    add(
      "FEMALE_PROGRAM_LEAD",
      1,
      strong ? ["AFC_B"] : ["AFC_C"],
      strong ? [6] : [3],
      strong ? ["PART_TIME"] : ["VOLUNTEER"],
      "FEMALE",
    );
  }

  if (strong) add("PLAYER_DEVELOPMENT_OFFICER", 1, ["AFC_C", "AFC_B_YOUTH"], [4, 6], ["PART_TIME"]);
  if (strength >= 0.7) add("STRENGTH_AND_CONDITIONING", 1, ["ALLIED_TERTIARY"], [5, 8], ["CONTRACT"]);

  add(
    "JUNIOR_COACH",
    strong ? 6 : middling ? 5 : 4,
    strong ? ["FA_GAME_TRAINING", "FA_SKILL_TRAINING"] : ["FA_SKILL_TRAINING", "FA_MINIROOS", "NONE"],
    [1, 2, 3],
    ["VOLUNTEER"],
  );

  add("MINIROOS_COORDINATOR", 1, strong ? ["FA_GAME_TRAINING"] : ["FA_MINIROOS"], [2, 4], ["VOLUNTEER"]);

  return staff;
}

/**
 * Pools, and where each one has got to.
 *
 * Progress is a property of the pool now, not of a club: every line item is
 * allocated across the whole pool and scored across the whole pool, so clubs in
 * a pool move through assessment together. Pool A is finished; Pool B is
 * mid-flight with some line items still unallocated.
 */
const POOLS = [
  {
    name: "A",
    complete: true,
    clubs: [
      "brisbane-cityside",
      "sunshine-coast-wanderers",
      "redlands-united",
      "rockhampton-central",
      "mount-isa-rovers",
    ],
  },
  {
    name: "B",
    complete: false,
    clubs: ["toowoomba-ranges", "cairns-tropics"],
  },
];

/**
 * Assessment tier per club. Tier 2 clubs are assessed on 18 of the 54 line
 * items, so their maximum — and therefore their percentage — is computed from a
 * smaller denominator. Two of the demo clubs sit in Tier 2 so that path is
 * actually exercised rather than merely supported.
 */
const CLUB_TIER: Record<string, string> = {
  "brisbane-cityside": "T1",
  "sunshine-coast-wanderers": "T1",
  "redlands-united": "T1",
  "rockhampton-central": "T2",
  "toowoomba-ranges": "T1",
  "cairns-tropics": "T2",
  "mount-isa-rovers": "T2",
};

/**
 * A club's organisational structure, as a profile per strength band.
 *
 * Written as explicit profiles rather than derived from a single number,
 * because the point of the demo is that the structure level and the score are
 * *different* measurements. A club can document its philosophy beautifully and
 * still not employ the people a Gold shield requires, and a formula keyed on
 * one strength value would make the two move together — which is exactly the
 * confusion the computed level exists to dispel.
 *
 * The bands land the demo clubs on Gold, Silver, Bronze and nothing, so every
 * branch of the calculation has a club sitting on it.
 */
type StructureProfile = {
  /** How many of the eleven functions are filled, in catalogue order. */
  functions: number;
  td: "FULL_TIME" | "PART_TIME" | "ABSENT";
  youth: string;
  junior: string;
  girls: string;
  individual: string;
  documents: boolean;
};

function structureProfile(strength: number): StructureProfile {
  if (strength >= 0.85) {
    return {
      functions: 11, td: "FULL_TIME",
      youth: "B_DIPLOMA_PLUS", junior: "B_DIPLOMA_PLUS",
      girls: "B_DIPLOMA_PLUS", individual: "C_DIPLOMA", documents: true,
    };
  }
  if (strength >= 0.75) {
    // Everything Gold asks for except the Head of Individual Development's
    // qualification — the single miss that holds a strong club at Silver, and
    // the case the club-facing "what's missing" list is written for.
    return {
      functions: 10, td: "FULL_TIME",
      youth: "ENROLLED_B", junior: "C_DIPLOMA",
      girls: "B_DIPLOMA_PLUS", individual: "NOT_MIN_QUAL", documents: true,
    };
  }
  if (strength >= 0.55) {
    return {
      functions: 8, td: "FULL_TIME",
      youth: "ENROLLED_B", junior: "C_DIPLOMA",
      girls: "C_DIPLOMA", individual: "ABSENT", documents: true,
    };
  }
  if (strength >= 0.45) {
    // Bronze: no Head of Junior at all, which Bronze doesn't require.
    return {
      functions: 6, td: "FULL_TIME",
      youth: "ENROLLED_B", junior: "ABSENT",
      girls: "C_DIPLOMA", individual: "ABSENT", documents: true,
    };
  }
  return {
    functions: 5, td: "PART_TIME",
    youth: "NOT_MIN_QUAL", junior: "ABSENT",
    girls: "NOT_MIN_QUAL", individual: "ABSENT", documents: false,
  };
}

async function seedStructureFor(
  prisma: PrismaClient,
  assessmentId: string,
  strength: number,
  unstarted: boolean,
) {
  // A club that hasn't started has nothing recorded at all, which is a
  // different state from having recorded "not filled" everywhere.
  if (unstarted) return;

  const p = structureProfile(strength);
  const roles = await prisma.structureRole.findMany({
    where: { active: true },
    orderBy: { position: "asc" },
  });

  const named: Record<string, string> = {
    TD: p.td,
    HO_YOUTH: p.youth,
    HO_JUNIOR: p.junior,
    HO_GIRLS: p.girls,
    HO_INDIVIDUAL: p.individual,
    POSITION_DESCRIPTIONS: p.documents ? "PRESENT" : "ABSENT",
    ROSTER: p.documents ? "PRESENT" : "ABSENT",
  };

  // The remaining presence-only functions fill up to the profile's count, in
  // catalogue order — roughly the order clubs appoint them in.
  let filledSoFar = Object.entries(named).filter(
    ([code, v]) => v !== "ABSENT" && code !== "POSITION_DESCRIPTIONS" && code !== "ROSTER",
  ).length;

  for (const [i, role] of roles.entries()) {
    let status = named[role.code];

    if (status === undefined) {
      const take = role.counts && filledSoFar < p.functions;
      if (take) filledSoFar += 1;
      status = take ? "PRESENT" : "ABSENT";
    }

    await prisma.structureEntry.create({
      data: {
        assessmentId,
        roleId: role.id,
        status: status as never,
        holderName:
          status !== "ABSENT" && role.counts
            ? STRUCTURE_HOLDERS[i % STRUCTURE_HOLDERS.length]
            : null,
      },
    });
  }
}

const STRUCTURE_HOLDERS = [
  "Marcus Whitely",
  "Anita Chow",
  "Dev Ramachandran",
  "Ellie Broadbent",
  "Sam Tuiletufuga",
  "Nadia Kessler",
  "Tom Ferrier",
];

/** Where each club's own record sits, independent of its pool's progress. */
const CLUB_STATE: Record<string, string> = {
  "brisbane-cityside": "PUBLISHED",
  "rockhampton-central": "PUBLISHED_INELIGIBLE",
  // Published deliberately, and the only club whose score outruns its
  // structure: 77% earns Gold, but its Head of Individual Development is
  // unqualified so NN7 computes to Silver and the shield is held there. It is
  // the case the whole shield-based threshold mechanism exists for, and without
  // a published example of it the club-facing explanation is never seen.
  "sunshine-coast-wanderers": "PUBLISHED",
  "redlands-united": "RECONCILING",
  "toowoomba-ranges": "IN_ASSESSMENT",
  // Still entering its own data, so nobody can score it yet — which is exactly
  // the case the "clubs not yet submitted" count on the scoring screen exists for.
  "cairns-tropics": "IN_PROGRESS",
  // Below the Bronze bar but licence compliant, so the award is the badge.
  "mount-isa-rovers": "PUBLISHED",
};

export async function seedDemo(prisma: PrismaClient) {
  const random = makeRandom(20260807);

  console.log("[cda] clearing demo data…");
  await prisma.areaNote.deleteMany();
  await prisma.structureEntry.deleteMany();
  await prisma.scoreEvidence.deleteMany();
  await prisma.assessorScore.deleteMany();
  await prisma.finalScore.deleteMany();
  await prisma.nonNegotiableResult.deleteMany();
  await prisma.clubMetric.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.criterionAssignment.deleteMany();
  await prisma.clubAssessment.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.clubMembership.deleteMany();
  await prisma.club.deleteMany();
  await prisma.cycle.deleteMany();
  await prisma.user.deleteMany({ where: { role: { in: ["CLUB", "ASSESSOR"] } } });

  /* -------------------------------- Cycle --------------------------------- */

  const cycle = await prisma.cycle.create({
    data: {
      year: 2026,
      name: "2026 Club Rating",
      status: "RECONCILING",
      opensAt: new Date("2026-02-01"),
      closesAt: new Date("2026-09-30"),
    },
  });

  const priorCycle = await prisma.cycle.create({
    data: { year: 2025, name: "2025 Club Rating", status: "PUBLISHED" },
  });

  const assessors = await Promise.all(
    ASSESSORS.map((a) => prisma.user.create({ data: { ...a, role: "ASSESSOR" } })),
  );

  const qualifications = await prisma.qualification.findMany();
  const qualByCode = new Map(qualifications.map((q) => [q.code, q]));
  const nonNegotiables = await prisma.nonNegotiable.findMany({ orderBy: { position: "asc" } });
  const criteria = await prisma.criterion.findMany({
    where: { active: true, domain: { in: ["PLANNING", "DELIVERY", "OUTCOMES"] } },
    include: { subCriteria: { orderBy: { position: "asc" } }, tiers: true },
    orderBy: { position: "asc" },
  });
  const tierIds = new Map((await prisma.tier.findMany()).map((t) => [t.code, t.id]));

  /* -------------------------- Pools, clubs, staff -------------------------- */

  const strengthBySlug = new Map(CLUBS.map((c) => [c.slug, c.strength]));

  for (const [poolIndex, poolSpec] of POOLS.entries()) {
    const pool = await prisma.pool.create({
      data: {
        cycleId: cycle.id,
        name: poolSpec.name,
        position: poolIndex,
        // Pool B carried its Planning evidence over, which is the shape of
        // Football Queensland's own 2026 season — one pool retained, the others
        // read fresh. Without a retained pool in the demo the harmonised board
        // is identical to the raw one and the whole mechanism is invisible.
        retainedEvidence: poolSpec.name === "B",
        // The "+5" — the items that pool read again anyway, which count at what
        // they scored rather than being averaged with last season. Five of
        // them, which is what FQ's own cycle table says.
        ...(poolSpec.name === "B"
          ? {
              refreshedCriteria: {
                connect: criteria
                  .filter((c) => c.domain === "PLANNING")
                  .slice(0, 5)
                  .map((c) => ({ id: c.id })),
              },
            }
          : {}),
      },
    });

    for (const slug of poolSpec.clubs) {
      const spec = CLUBS.find((c) => c.slug === slug)!;
      const state = CLUB_STATE[slug];
      const published = state.startsWith("PUBLISHED");
      const ineligible = state === "PUBLISHED_INELIGIBLE";

      const club = await prisma.club.create({
        data: {
          name: spec.name,
          slug: spec.slug,
          zone: spec.zone,
          tier: spec.tier,
          contactName: spec.admin.name,
          contactEmail: spec.admin.email,
          members: {
            create: {
              user: {
                create: {
                  email: spec.admin.email,
                  name: spec.admin.name,
                  title: "Club Administrator",
                  role: "CLUB",
                },
              },
            },
          },
        },
      });

      const assessment = await prisma.clubAssessment.create({
        data: {
          clubId: club.id,
          cycleId: cycle.id,
          poolId: pool.id,
          tierId: tierIds.get(CLUB_TIER[slug] ?? "T1") ?? null,
          status: published ? "PUBLISHED" : (state as never),
          clubSubmittedAt: state === "IN_PROGRESS" ? null : new Date("2026-04-18"),
          // Recorded once a club has actually submitted, since that is when the
          // Unit would have looked. Rockhampton is the club that isn't
          // compliant, which is why its low score earns no badge either.
          licenceCompliant:
            state === "IN_PROGRESS" ? null : slug !== "rockhampton-central",
        },
      });

      for (const s of staffFor(spec.strength, random)) {
        await prisma.staffMember.create({
          data: {
            assessmentId: assessment.id,
            name: s.name,
            staffRole: s.role as never,
            qualificationId: qualByCode.get(s.qual)?.id ?? null,
            yearsExperience: s.years,
            employment: s.employment as never,
            gender: s.gender as never,
            blueCard: !(ineligible && random() < 0.25),
            blueCardExpiry: new Date("2028-06-30"),
          },
        });
      }

      const base = Math.round(300 + spec.strength * 500);
      const metrics: Record<string, [number, number]> = {
        total_registered: [base, Math.round(base * (0.92 + spec.strength * 0.1))],
        female_registered: [Math.round(base * 0.3), Math.round(base * 0.26)],
        youth_registered: [Math.round(base * 0.34), Math.round(base * 0.33)],
        miniroos_registered: [Math.round(base * 0.28), Math.round(base * 0.29)],
        retention_rate: [Math.round(62 + spec.strength * 28), Math.round(60 + spec.strength * 25)],
        female_teams: [Math.round(2 + spec.strength * 7), Math.round(1 + spec.strength * 6)],
        youth_game_time: [Math.round(50 + spec.strength * 40), Math.round(48 + spec.strength * 35)],
        coaches_accredited: [Math.round(6 + spec.strength * 22), Math.round(5 + spec.strength * 18)],
      };

      if (state !== "IN_PROGRESS") {
        for (const [key, [value, priorValue]] of Object.entries(metrics)) {
          await prisma.clubMetric.create({
            data: { assessmentId: assessment.id, key, value, priorValue },
          });
        }
      }

      // Recorded for every club including the one still filling its submission
      // in: structure is the first thing a club enters, and a partially-built
      // one is the state the "what's missing for the next shield" list is
      // most useful in. Only a club that has never opened the portal has none,
      // and loadStructure treats a missing row as unfilled anyway.
      await seedStructureFor(prisma, assessment.id, spec.strength, false);

      for (const [i, nn] of nonNegotiables.entries()) {
        const threshold = nn.kind === "SHIELD_THRESHOLD";
        // Only gate checks are ever failed outright here. A threshold check
        // isn't failed, it is met at some level — which is the whole point of
        // the distinction, and a demo that failed one would show the wrong
        // mechanism on the screen the CDU learns it from.
        const fails = ineligible && !threshold && (nn.code === "NN3" || nn.code === "NN6");
        const answered = state !== "IN_PROGRESS" || i < 4;
        const verified = published || state === "RECONCILING";

        await prisma.nonNegotiableResult.create({
          data: {
            assessmentId: assessment.id,
            nonNegotiableId: nn.id,
            clubDeclared: answered ? !fails : null,
            clubNote: answered && !fails ? "Evidence held on file and available on request." : null,
            verdict: verified ? (fails ? "FAIL" : "PASS") : "PENDING",
            // Structure and staffing track the club's overall standing, so the
            // weaker clubs meet a lower bar than they score against — which is
            // how the cap becomes visible on a club that scored above it.
            shieldMet: threshold && verified ? thresholdLevel(spec.strength) : null,
            adminNote: fails ? FAILURE_NOTES[nn.code] : null,
            verifiedAt: verified ? new Date("2026-06-02") : null,
          },
        });
      }
    }

    /* ----------------------- Allocate the line items ---------------------- */

    // Round-robin through the assessor pool, offset per pool so the same person
    // doesn't hold the same item in both — that would defeat the independence
    // the two slots exist to provide.
    const poolClubs = await prisma.clubAssessment.findMany({
      where: { poolId: pool.id },
      select: { id: true, status: true },
    });
    const scorable = poolClubs.filter(
      (c) => c.status === "SUBMITTED" || c.status === "IN_ASSESSMENT" || c.status === "RECONCILING" || c.status === "PUBLISHED",
    );

    for (const [i, criterion] of criteria.entries()) {
      // Pool B leaves the tail of the catalogue unallocated, so the CDU's
      // allocation screen has real gaps to fill.
      if (!poolSpec.complete && i >= Math.floor(criteria.length * 0.6)) continue;

      const slots = [1, 2];
      // A handful of items also carry a tiebreaker, which is what the third slot
      // is actually for.
      if (poolSpec.complete && i % 9 === 4) slots.push(3);

      for (const slot of slots) {
        const assessor =
          assessors[(i * 2 + slot + poolIndex * 3) % assessors.length];

        // Skip rather than collide when the rotation lands on someone who
        // already holds this item in this pool.
        const clash = await prisma.criterionAssignment.findFirst({
          where: { poolId: pool.id, criterionId: criterion.id, assessorId: assessor.id },
        });
        if (clash) continue;

        // Pool B leaves some allocated items unsubmitted so an assessor has
        // live work waiting for them.
        const submitted = poolSpec.complete || i % 3 === 0;

        await prisma.criterionAssignment.create({
          data: {
            poolId: pool.id,
            criterionId: criterion.id,
            assessorId: assessor.id,
            slot,
            submittedAt: submitted ? new Date("2026-05-20") : null,
          },
        });

        /* ------------------------------ Scores ---------------------------- */

        for (const clubAssessment of scorable) {
          // An unsubmitted line item in Pool B is only part-scored, which is the
          // state an assessor returns to.
          if (!submitted && random() > 0.4) continue;

          const full = await prisma.clubAssessment.findUniqueOrThrow({
            where: { id: clubAssessment.id },
            select: { tierId: true, club: { select: { slug: true } } },
          });

          // A Tier 2 club isn't assessed on most of the catalogue, so scoring it
          // there would invent marks against items nobody looked at.
          if (full.tierId && !criterion.tiers.some((t) => t.id === full.tierId)) continue;

          const strength = strengthBySlug.get(full.club.slug) ?? 0.5;

          // Slot 2 runs slightly harsher than slot 1, which is what produces the
          // genuine splits the reconciliation screen exists to resolve.
          const bias = slot === 2 ? -0.12 : slot === 3 ? 0.03 : 0;
          const target = Math.max(0, Math.min(1, strength + bias + (random() - 0.5) * 0.3));
          const met = Math.round(target * criterion.subCriteria.length);

          const stars = starsFromEvidence(met, criterion);

          await prisma.assessorScore.create({
            data: {
              assessmentId: clubAssessment.id,
              assessorId: assessor.id,
              criterionId: criterion.id,
              stars,
              comment: random() < 0.35 ? COMMENTS[Math.floor(random() * COMMENTS.length)] : null,
              evidence: {
                create: criterion.subCriteria.slice(0, met).map((sc) => ({ subCriterionId: sc.id })),
              },
            },
          });
        }
      }
    }
  }

  /* ---------------------------- Reconciliation ---------------------------- */

  // NN7's recorded level now comes from the structure rather than from a guess
  // about the club's strength, so it is derived through the same function the
  // app uses. The demo would otherwise show a level the portal itself would
  // never produce.
  const { syncStructureLevel } = await import("../src/lib/cda/assessment.ts");
  for (const a of await prisma.clubAssessment.findMany({ select: { id: true } })) {
    await syncStructureLevel(a.id);
  }

  const toReconcile = await prisma.clubAssessment.findMany({
    where: { cycleId: cycle.id, status: "PUBLISHED" },
    select: { id: true, clubId: true },
  });

  for (const assessment of toReconcile) {
    for (const criterion of criteria) {
      const scores = await prisma.assessorScore.findMany({
        where: { assessmentId: assessment.id, criterionId: criterion.id },
      });
      if (!scores.length) continue;

      const given = scores.map((s) => s.stars).sort((a, b) => a - b);
      const stars = given[Math.floor(given.length / 2)];

      await prisma.finalScore.create({
        data: {
          assessmentId: assessment.id,
          criterionId: criterion.id,
          stars,
          rationale:
            given[given.length - 1] - given[0] >= 2
              ? "Assessors split. Resolved at the median after a joint review of the evidence."
              : null,
        },
      });
    }
  }

  // Area feedback on the published clubs, so the club-facing report shows the
  // part FQ's own report is actually built around.
  for (const assessment of toReconcile) {
    const areas = await prisma.criterion.findMany({
      where: { active: true, area: { not: null } },
      distinct: ["area"],
      select: { domain: true, area: true },
      orderBy: { position: "asc" },
    });

    for (const [i, a] of areas.entries()) {
      if (!a.area) continue;
      await prisma.areaNote.create({
        data: {
          assessmentId: assessment.id,
          domain: a.domain,
          area: a.area,
          comment: AREA_FEEDBACK[i % AREA_FEEDBACK.length],
          authorId: (await prisma.user.findFirst({ where: { role: "ADMIN" } }))?.id ?? null,
        },
      });
    }
  }

  // Freezing goes through the same code path a real lock uses, so the demo data
  // can't drift from what the app would actually produce.
  const { freezeResult } = await import("../src/lib/cda/assessment.ts");
  const cdu = await prisma.user.findFirst({ where: { role: "ADMIN" } });

  // Publication dates are relative to today, unlike everything else in this
  // seed, and deliberately so: the review windows are 8 days and 3 working days
  // wide, so a fixed date would put every demo club permanently past them and
  // there would be no way to look at the screens that matter most.
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  const clubSlugById = new Map(
    (await prisma.club.findMany({ select: { id: true, slug: true } })).map((c) => [c.id, c.slug]),
  );

  for (const assessment of toReconcile) {
    await freezeResult(assessment.id, cdu?.id ?? "");
    const slug = clubSlugById.get(assessment.clubId) ?? "";
    await prisma.clubAssessment.update({
      where: { id: assessment.id },
      data: {
        status: "PUBLISHED",
        // The lapsed club is published far enough back that its 8-day window
        // has genuinely closed, rather than being forced shut by a flag.
        publishedAt: daysAgo(REVIEW_SCENARIO[slug] === "LAPSED" ? 30 : 2),
        summary:
          "Preliminary rating issued following reconciliation. The Club Development Unit will meet with the club to work through the domain feedback before the next cycle opens.",
      },
    });
  }

  await seedReviews(prisma, daysAgo, cdu?.id ?? null);
  await seedPriorSeason(prisma, priorCycle);

  const assignmentCount = await prisma.criterionAssignment.count();
  console.log(
    `[cda] demo: ${CLUBS.length} clubs in ${POOLS.length} pools, ${ASSESSORS.length} assessors, ` +
      `${assignmentCount} line-item allocations, cycles ${priorCycle.year} and ${cycle.year}`,
  );
  console.log("[cda] club sign-ins: " + CLUBS.map((c) => c.admin.email).join(", "));
  console.log("[cda] assessor sign-ins: " + ASSESSORS.map((a) => a.email).join(", "));
}


/**
 * How far each club moved between the two demo cycles, in percentage points.
 *
 * Written down rather than randomised, because the leaderboard is a page about
 * movement and a random walk shows nothing: it needs a club that clearly rose,
 * one that clearly fell, one that held, one that gained a shield, and one with
 * no comparison at all. Positive means the club improved on last season, so
 * last season's figure is this season's minus the shift.
 *
 * Cairns is absent on purpose — a club new to the program this year, which is
 * the case the board has to render as "no comparable result" rather than as a
 * fall to zero.
 */
const PRIOR_SHIFT: Record<string, { overall: number; domains: Record<string, number> }> = {
  // Delivery is the whole story here: the club put its coach development plan
  // into practice and the observation areas moved with it.
  "brisbane-cityside": {
    overall: 4.2,
    domains: { TECHNICAL: 1.5, PLANNING: 2.0, DELIVERY: 9.4, OUTCOMES: 1.1 },
  },
  // Lost two qualified staff, which is a Technical fall the other domains
  // can't offset — the case for reading the domain columns rather than the
  // total.
  "redlands-united": {
    overall: -3.6,
    domains: { TECHNICAL: -11.2, PLANNING: 1.4, DELIVERY: -1.8, OUTCOMES: -0.6 },
  },
  "toowoomba-ranges": {
    overall: 0,
    domains: { TECHNICAL: 0.4, PLANNING: 3.1, DELIVERY: -2.6, OUTCOMES: -0.3 },
  },
  // Enough to cross a shield boundary, so the board has a row where the shield
  // itself moved and not only the number.
  "sunshine-coast-wanderers": {
    overall: 6.5,
    domains: { TECHNICAL: 4.8, PLANNING: 7.2, DELIVERY: 6.9, OUTCOMES: 5.4 },
  },
  "rockhampton-central": {
    overall: -5.1,
    domains: { TECHNICAL: -6.0, PLANNING: -4.4, DELIVERY: -5.8, OUTCOMES: -3.2 },
  },
  "mount-isa-rovers": {
    overall: 2.4,
    domains: { TECHNICAL: 0.9, PLANNING: 4.6, DELIVERY: 2.2, OUTCOMES: 1.7 },
  },
};

/**
 * Last season's results, as frozen rows.
 *
 * Written straight onto the frozen columns rather than assembled from line
 * items and locked, which is also how a real prior season would arrive: FQ has
 * been rating clubs for years, and what the portal can be given for those years
 * is the result, not the evidence behind it. The columns are exactly what the
 * app reads for a locked assessment, so the board compares like with like.
 *
 * Derived from what each club scores *this* season so the movements are the
 * ones PRIOR_SHIFT describes, rather than two independent guesses that happen
 * to differ.
 */
async function seedPriorSeason(prisma: PrismaClient, priorCycle: { id: string; year: number }) {
  const { loadAssessment } = await import("../src/lib/cda/assessment.ts");
  const { shieldFor, tierOf } = await import("../src/lib/cda/scoring.ts");

  const clubs = await prisma.club.findMany({ select: { id: true, slug: true } });
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

  for (const club of clubs) {
    const shift = PRIOR_SHIFT[club.slug];
    if (!shift) continue;

    const current = await prisma.clubAssessment.findFirst({
      where: { clubId: club.id, cycleId: { not: priorCycle.id } },
      select: { id: true, tierId: true },
    });
    if (!current) continue;

    const { rating } = await loadAssessment(current.id);
    const percent = clamp(rating.percent - shift.overall);
    const domain = (d: string) => clamp(rating.domains[d as never] - (shift.domains[d] ?? shift.overall));

    const tier = tierOf(CLUB_TIER[club.slug]);
    const shield = shieldFor(percent, priorCycle as never, tier);

    await prisma.clubAssessment.create({
      data: {
        clubId: club.id,
        cycleId: priorCycle.id,
        tierId: current.tierId,
        status: "CONFIRMED",
        clubSubmittedAt: new Date(`${priorCycle.year}-04-19`),
        lockedAt: new Date(`${priorCycle.year}-08-14`),
        publishedAt: new Date(`${priorCycle.year}-08-20`),
        licenceCompliant: true,
        finalPercent: percent,
        technicalPct: domain("TECHNICAL"),
        planningPct: domain("PLANNING"),
        deliveryPct: domain("DELIVERY"),
        outcomesPct: domain("OUTCOMES"),
        finalShield: shield,
        eligible: true,
        summary: `Confirmed rating for ${priorCycle.year}. Carried forward from Football Queensland's own record; the line items behind it predate the portal.`,
      },
    });
  }
}

/**
 * Which review scenario each demo club sits in, keyed by slug.
 *
 * Three of them, because the three screens they drive look nothing alike: a
 * window still open with nothing requested, a request waiting on the Unit, and
 * a window that lapsed into a confirmed rating.
 */
const REVIEW_SCENARIO: Record<string, "OPEN" | "REQUESTED" | "LAPSED"> = {
  "brisbane-cityside": "REQUESTED",
  "mount-isa-rovers": "OPEN",
  "rockhampton-central": "LAPSED",
};

/** The club's case on each item. FQ admits one ground: evidence was missed. */
const REVIEW_COMMENTS = [
  "The updated version of this document was uploaded to the Club Hub on 3 March, in the Planning folder rather than the root. We believe the assessors saw the 2025 version.",
  "Our individual development plans for the U14 and U16 squads are held in Squadi rather than as documents, and we don't think they were opened during the assessment.",
  "Attendance and game-time records for the whole season are in the Club Hub as a spreadsheet. The report says none were provided.",
];

/**
 * Seeds the review scenarios.
 *
 * The lapsed club is confirmed here rather than left for someone to press a
 * button on, because a demo where the most common end state — nobody asked for
 * a review and the rating settled — never appears is a demo that only shows the
 * exception.
 */
async function seedReviews(
  prisma: PrismaClient,
  daysAgo: (n: number) => Date,
  cduId: string | null,
) {
  const clubs = await prisma.club.findMany({ select: { id: true, slug: true } });

  for (const club of clubs) {
    const scenario = REVIEW_SCENARIO[club.slug];
    if (!scenario) continue;

    const assessment = await prisma.clubAssessment.findFirst({
      where: { clubId: club.id, status: "PUBLISHED" },
      include: { finalScores: { include: { criterion: true } } },
    });
    if (!assessment) continue;

    if (scenario === "LAPSED") {
      await prisma.clubAssessment.update({
        where: { id: assessment.id },
        data: { status: "CONFIRMED" },
      });
      continue;
    }

    if (scenario !== "REQUESTED") continue;

    // The three weakest reviewable line items, which is what a club would
    // actually put forward — one that scored full marks is not worth a slot.
    const candidates = assessment.finalScores
      .filter((f) => f.criterion.domain !== "TECHNICAL" && f.criterion.active)
      .sort((a, b) => a.stars / a.criterion.maxScore - b.stars / b.criterion.maxScore)
      .slice(0, 3);

    const clubUser = await prisma.user.findFirst({
      where: { role: "CLUB", clubMemberships: { some: { clubId: club.id } } },
    });

    await prisma.reviewRequest.create({
      data: {
        assessmentId: assessment.id,
        submittedAt: daysAgo(1),
        submittedById: clubUser?.id ?? null,
        percentBefore: assessment.finalPercent,
        shieldBefore: assessment.eligible ? assessment.finalShield : null,
        items: {
          create: candidates.map((c, i) => ({
            criterionId: c.criterionId,
            clubComment: REVIEW_COMMENTS[i % REVIEW_COMMENTS.length],
          })),
        },
      },
    });

    await prisma.clubAssessment.update({
      where: { id: assessment.id },
      data: { status: "IN_REVIEW" },
    });

    void cduId;
  }
}

/**
 * Paragraphs for the macro-area feedback, written in the register FQ's own
 * report uses: what was provided, what it showed, and the specific next step.
 */
const AREA_FEEDBACK = [
  "Well-articulated documentation across this area. To improve further, develop the age-specific framework and provide more detail on the how of coaching at training and on match day.",
  "The documents are detailed and there is a clear connection between the long-term athlete development model and the playing style. There is scope to add more detail on implementation for different ages and stages.",
  "Clear documents provided, with technical detail linked to the team model. There is no overview of the development model or the feedback process; making the document unique to the club would strengthen it.",
  "The club has articulated how it intends to support players and promote wellbeing, with regular checkpoints through the year. Focus next on mid- and long-term goal setting and on player workload tracking.",
  "Thorough planning, clearly linked to the club's methodology. Explaining the logic behind the scheduling of education events would help, and the event register is a valuable addition that was needed.",
  "An area where the club differentiates itself. The use of video to support individual players is excellent and should continue. Internal measurement of workload and wellbeing is a genuine strength.",
  "Observed sessions were in line with the club's vision and philosophy. The learning environment was positive, though some inconsistency was evident across programs and phases.",
  "Interaction between coaches and players is positive and players are engaged. The area to focus on is bringing individual development plans to life on match day through a clear game-day process.",
  "Strong in this area, with education provided to players throughout the season. Continue to build the review cycle so self-evaluation feeds the coach-led reviews rather than sitting alongside them.",
  "Great improvement, with a clear mentoring program in place for all academy coaches. This is a highlight of the season and worth sharing as best practice.",
  "The club has the potential to develop players over the long term and has contributed to talented player programs and state teams in recent years. Keep tracking movements every year.",
  "Retention is above the benchmark, which is positive. Natural movement between clubs is part of the landscape, but clear strategies to mitigate it would differentiate the club further.",
  "Survey results improved on the previous cycle. Closing the loop with members on what changed as a result would raise the score further.",
  "Delivered as part of the shared best practice program. Continue to involve more than one member of staff so the knowledge is not held by one person.",
  "The club has historically supported the growth of the women's game. Investment in female coaches is the area to prioritise against the gender parity objective.",
];

/** Why the ineligible club failed each check it failed. */
const FAILURE_NOTES: Record<string, string> = {
  NN3: "Eleven of the club's coaches are not registered in Squadi, including both MiniRoos age groups.",
  NN6: "Blue Card register incomplete at the time of review; three coaching staff without a current card recorded.",
};

/**
 * The shield level a club's structure and staffing actually support.
 *
 * Deliberately not the same as the club's score. A club can document its
 * philosophy beautifully and still not employ the staff a Gold shield requires,
 * and separating the two is the point of the threshold checks.
 */
function thresholdLevel(strength: number): Shield {
  if (strength >= 0.85) return "GOLD";
  if (strength >= 0.6) return "SILVER";
  if (strength >= 0.35) return "BRONZE";
  return "NONE";
}

const COMMENTS = [
  "Documented and endorsed, but the review cycle has slipped past 12 months.",
  "Observed across two sessions; consistent between the two coaches.",
  "Evidence provided covers the senior program only — youth is not addressed.",
  "Strong on paper. Coaches could not consistently articulate it when asked.",
  "Clear improvement on last cycle; the tracking is now genuinely being used.",
  "Partially met. The framework exists but is not applied below U14.",
  "Well-run session. Transitions were sharp and every player was active throughout.",
  "Numbers reported are not reconciled against PlayFootball; treated as indicative.",
];
