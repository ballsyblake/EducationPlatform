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
import type { PrismaClient } from "../generated/prisma/client.ts";
import { defaultThresholds } from "../src/lib/cda/rubric.ts";
import { CRITERIA, NON_NEGOTIABLES, QUALIFICATIONS } from "./cda-catalog.ts";

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

export async function seedCatalog(prisma: PrismaClient) {
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
      update: { position: i },
      create: { ...nn, position: i },
    });
  }

  let position = 0;
  for (const { domain, criteria } of CRITERIA) {
    for (const c of criteria) {
      const thresholds = defaultThresholds(c.evidence.length);
      const existing = await prisma.criterion.findUnique({ where: { code: c.code } });

      if (existing) {
        await prisma.criterion.update({
          where: { code: c.code },
          data: { position: position++ },
        });
        continue;
      }

      await prisma.criterion.create({
        data: {
          domain,
          code: c.code,
          title: c.title,
          description: c.description,
          weight: c.weight ?? 1,
          position: position++,
          ...thresholds,
          subCriteria: {
            create: c.evidence.map((text, i) => ({ text, position: i })),
          },
        },
      });
    }
  }

  const counts = {
    qualifications: await prisma.qualification.count(),
    nonNegotiables: await prisma.nonNegotiable.count(),
    criteria: await prisma.criterion.count(),
    subCriteria: await prisma.subCriterion.count(),
  };
  console.log(
    `[cda] catalogue: ${counts.criteria} criteria (${counts.subCriteria} evidence points), ` +
      `${counts.nonNegotiables} Non-Negotiables, ${counts.qualifications} qualifications`,
  );
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
];

const ASSESSORS = [
  { email: "n.calloway@fq.example.com", name: "Nina Calloway", title: "Club Development Assessor" },
  { email: "d.marchetti@fq.example.com", name: "Dario Marchetti", title: "Technical Assessor" },
  { email: "a.baptiste@fq.example.com", name: "Aimee Baptiste", title: "Club Development Assessor" },
  { email: "k.oyelaran@fq.example.com", name: "Kola Oyelaran", title: "Regional Assessor" },
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
 * How each club's assessment should be left, so that every screen in the app
 * has something real behind it: a finished rating, a live reconciliation with
 * genuine splits, a half-scored assessment, and clubs still entering data.
 */
const SCENARIOS = [
  { slug: "brisbane-cityside", state: "PUBLISHED", assessors: 3 },
  { slug: "sunshine-coast-wanderers", state: "RECONCILING", assessors: 3 },
  { slug: "redlands-united", state: "IN_ASSESSMENT", assessors: 3 },
  { slug: "toowoomba-ranges", state: "SUBMITTED", assessors: 2 },
  { slug: "cairns-tropics", state: "IN_PROGRESS", assessors: 0 },
  { slug: "rockhampton-central", state: "PUBLISHED_INELIGIBLE", assessors: 3 },
] as const;

export async function seedDemo(prisma: PrismaClient) {
  const random = makeRandom(20260807);

  console.log("[cda] clearing demo data…");
  await prisma.scoreEvidence.deleteMany();
  await prisma.assessorScore.deleteMany();
  await prisma.finalScore.deleteMany();
  await prisma.nonNegotiableResult.deleteMany();
  await prisma.clubMetric.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.assessorAssignment.deleteMany();
  await prisma.clubAssessment.deleteMany();
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

  // A closed prior year, so a club's dashboard can show movement rather than a
  // rating in a vacuum.
  const priorCycle = await prisma.cycle.create({
    data: { year: 2025, name: "2025 Club Rating", status: "PUBLISHED" },
  });

  /* ------------------------------ Assessors ------------------------------- */

  const assessors = await Promise.all(
    ASSESSORS.map((a) =>
      prisma.user.create({ data: { ...a, role: "ASSESSOR" } }),
    ),
  );

  /* -------------------------------- Clubs --------------------------------- */

  const qualifications = await prisma.qualification.findMany();
  const qualByCode = new Map(qualifications.map((q) => [q.code, q]));

  const nonNegotiables = await prisma.nonNegotiable.findMany({ orderBy: { position: "asc" } });
  const criteria = await prisma.criterion.findMany({
    where: { active: true, domain: { in: ["PLANNING", "DELIVERY", "OUTCOMES"] } },
    include: { subCriteria: { orderBy: { position: "asc" } } },
    orderBy: { position: "asc" },
  });

  for (const spec of CLUBS) {
    const scenario = SCENARIOS.find((s) => s.slug === spec.slug)!;

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

    const published = scenario.state.startsWith("PUBLISHED");
    const ineligible = scenario.state === "PUBLISHED_INELIGIBLE";

    const assessment = await prisma.clubAssessment.create({
      data: {
        clubId: club.id,
        cycleId: cycle.id,
        status: published ? "PUBLISHED" : (scenario.state as never),
        clubSubmittedAt: scenario.state === "IN_PROGRESS" ? null : new Date("2026-04-18"),
      },
    });

    /* ------------------------------- Staff -------------------------------- */

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
          // The weakest club has a gap in its Blue Card register, which is what
          // makes its Non-Negotiable failure visible in the staff list too.
          blueCard: !(ineligible && random() < 0.25),
          blueCardExpiry: new Date("2028-06-30"),
        },
      });
    }

    /* ------------------------------ Metrics ------------------------------- */

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

    if (scenario.state !== "IN_PROGRESS") {
      for (const [key, [value, priorValue]] of Object.entries(metrics)) {
        await prisma.clubMetric.create({
          data: { assessmentId: assessment.id, key, value, priorValue },
        });
      }
    }

    /* -------------------------- Non-Negotiables --------------------------- */

    for (const [i, nn] of nonNegotiables.entries()) {
      // The ineligible club fails Blue Card compliance and the female coaching
      // presence check — the two its staff register visibly can't support.
      const fails = ineligible && (nn.code === "NN-2" || nn.code === "NN-3");
      const answered = scenario.state !== "IN_PROGRESS" || i < 4;

      await prisma.nonNegotiableResult.create({
        data: {
          assessmentId: assessment.id,
          nonNegotiableId: nn.id,
          clubDeclared: answered ? !fails : null,
          clubNote: answered && !fails ? "Evidence held on file and available on request." : null,
          verdict: published ? (fails ? "FAIL" : "PASS") : scenario.state === "RECONCILING" ? "PASS" : "PENDING",
          adminNote: fails ? FAILURE_NOTES[nn.code] : null,
          verifiedAt: published || scenario.state === "RECONCILING" ? new Date("2026-06-02") : null,
        },
      });
    }

    /* ------------------------------ Assessors ----------------------------- */

    if (scenario.assessors === 0) continue;

    // Rotate the pool so no assessor carries every club, and every club gets a
    // different mix — which is what makes the CDU's comparison view worth having.
    const offset = CLUBS.indexOf(spec);
    const assigned = Array.from({ length: scenario.assessors }, (_, i) => assessors[(offset + i) % assessors.length]);

    for (const assessor of assigned) {
      await prisma.assessorAssignment.create({
        data: {
          assessmentId: assessment.id,
          assessorId: assessor.id,
          submittedAt:
            scenario.state === "IN_ASSESSMENT" || scenario.state === "SUBMITTED"
              ? null
              : new Date("2026-05-20"),
        },
      });
    }

    /* ------------------------------- Scores ------------------------------- */

    // SUBMITTED means the club is done and the assessors haven't started, so it
    // gets assignments and no scores — that's the state an assessor sees when
    // they open a club for the first time. IN_ASSESSMENT stops part-way, which
    // is the state they see when they come back to finish one.
    const coverage = scenario.state === "SUBMITTED" ? 0 : scenario.state === "IN_ASSESSMENT" ? 0.45 : 1;

    for (const [ai, assessor] of assigned.entries()) {
      for (const criterion of criteria) {
        if (random() > coverage) continue;

        // Each assessor's view of the club wobbles around its true strength.
        // Assessor 3 runs slightly harsher, which is what produces the real
        // splits the reconciliation screen exists to resolve.
        const bias = ai === 2 ? -0.12 : ai === 1 ? 0.05 : 0;
        const target = Math.max(0, Math.min(1, spec.strength + bias + (random() - 0.5) * 0.3));
        const met = Math.round(target * criterion.subCriteria.length);

        const thresholds = {
          oneStarAt: criterion.oneStarAt,
          twoStarAt: criterion.twoStarAt,
          threeStarAt: criterion.threeStarAt,
        };
        const stars =
          met >= thresholds.threeStarAt ? 3 : met >= thresholds.twoStarAt ? 2 : met >= thresholds.oneStarAt ? 1 : 0;

        await prisma.assessorScore.create({
          data: {
            assessmentId: assessment.id,
            assessorId: assessor.id,
            criterionId: criterion.id,
            stars,
            comment:
              random() < 0.35
                ? COMMENTS[Math.floor(random() * COMMENTS.length)]
                : null,
            evidence: {
              create: criterion.subCriteria
                .slice(0, met)
                .map((sc) => ({ subCriterionId: sc.id })),
            },
          },
        });
      }
    }

    /* ---------------------------- Reconciliation -------------------------- */

    if (published) {
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
  }

  /* ------------------- Freeze the published assessments ------------------- */

  // Done last and through the same code path the app uses, so the demo data
  // can't drift from what a real lock would have produced.
  const { freezeResult } = await import("../src/lib/cda/assessment.ts");
  const toPublish = await prisma.clubAssessment.findMany({ where: { status: "PUBLISHED" } });
  const cdu = await prisma.user.findFirst({ where: { role: "ADMIN" } });

  for (const assessment of toPublish) {
    await freezeResult(assessment.id, cdu?.id ?? "");
    await prisma.clubAssessment.update({
      where: { id: assessment.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date("2026-06-14"),
        summary:
          "Rating confirmed following reconciliation. The Club Development Unit will meet with the club to work through the domain feedback before the next cycle opens.",
      },
    });
  }

  console.log(
    `[cda] demo: ${CLUBS.length} clubs, ${ASSESSORS.length} assessors, cycles ${priorCycle.year} and ${cycle.year}`,
  );
  console.log("[cda] club sign-ins: " + CLUBS.map((c) => c.admin.email).join(", "));
  console.log("[cda] assessor sign-ins: " + ASSESSORS.map((a) => a.email).join(", "));
}

/** Why the ineligible club failed each check it failed. */
const FAILURE_NOTES: Record<string, string> = {
  "NN-2":
    "Blue Card register incomplete at the time of review; three coaching staff without a current card recorded.",
  "NN-3":
    "No female coach holds a technical role at the club. The club has committed to appointing a Female Program Lead before the next cycle.",
};

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
