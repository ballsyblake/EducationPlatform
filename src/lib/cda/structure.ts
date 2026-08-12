/**
 * Club Structure Standards, as arithmetic.
 *
 * No database access. Football Queensland's NN7 is the one shield-based
 * threshold that is a calculation rather than a judgement — a coverage count, a
 * set of mandatory roles, and a minimum diploma per role, each varying by shield
 * — so it belongs somewhere that can be reasoned about on its own.
 *
 * The reason it matters that this is computed: recomputing FQ's own 2026
 * workbook from FQ's own requirements tab disagreed on sixteen of thirty-three
 * clubs, always in the club's favour. Four clubs are recorded Gold whose Head of
 * Youth is logged below the minimum qualification even Bronze demands. A column
 * typed by hand beside a rule nobody re-derives drifts, and it drifts in one
 * direction.
 *
 * This does not make the computation the last word. It produces a level and,
 * more usefully, the list of reasons a club fell short of each higher one — so
 * the Unit can depart from it knowing exactly what it is departing from, and so
 * a club is told what to fix rather than just how it scored.
 */
import type { RoleStatus, Shield, StructureRoleKind } from "@prisma-client";

/**
 * Qualification ladder. The test is "at least", so `ENROLLED_B` and
 * `B_DIPLOMA_PLUS` tie — FQ counts enrolment towards the B Diploma as holding
 * it, and a club part-way through the course has met the standard.
 */
export const QUAL_LEVEL: Record<RoleStatus, number> = {
  ABSENT: 0,
  PRESENT: 0,
  PART_TIME: 0,
  FULL_TIME: 0,
  NOT_MIN_QUAL: 0,
  C_DIPLOMA: 1,
  ENROLLED_B: 2,
  B_DIPLOMA_PLUS: 2,
};

/** Whether a status means the role is filled at all. */
export function isFilled(status: RoleStatus): boolean {
  return status !== "ABSENT";
}

/** The answers each kind of role can take, weakest first. */
export const STATUS_OPTIONS: Record<StructureRoleKind, RoleStatus[]> = {
  PRESENCE: ["ABSENT", "PRESENT"],
  EMPLOYMENT: ["ABSENT", "PART_TIME", "FULL_TIME"],
  QUALIFIED: ["ABSENT", "NOT_MIN_QUAL", "C_DIPLOMA", "ENROLLED_B", "B_DIPLOMA_PLUS"],
};

export const STATUS_LABELS: Record<RoleStatus, string> = {
  ABSENT: "Not filled",
  PRESENT: "In place",
  PART_TIME: "Part time",
  FULL_TIME: "Full time",
  NOT_MIN_QUAL: "In post, below the minimum qualification",
  C_DIPLOMA: "C Diploma",
  ENROLLED_B: "Enrolled in the B Diploma",
  B_DIPLOMA_PLUS: "B Diploma or higher",
};

export const QUAL_LEVEL_LABELS: Record<number, string> = {
  0: "no qualification requirement",
  1: "a C Diploma",
  2: "a B Diploma, or enrolment in one",
};

export type StructureRoleSpec = {
  id: string;
  code: string;
  label: string;
  kind: StructureRoleKind;
  /** False for the submitted documents, which are required but not functions. */
  counts: boolean;
};

export type StructureEntryInput = {
  roleId: string;
  status: RoleStatus;
};

export type StructureRequirement = {
  roleId: string;
  required: boolean;
  minQualLevel: number;
  requireFullTime: boolean;
};

export type StructureStandardInput = {
  shield: Shield;
  functionsRequired: number;
  roles: StructureRequirement[];
};

export type ShieldCheck = {
  shield: Shield;
  met: boolean;
  /** Why not, in the club's language. Empty when met. */
  failures: string[];
};

export type StructureResult = {
  /** The strongest shield whose standard the recorded structure satisfies. */
  level: Shield;
  /** How many of the counting functions are filled, and out of how many. */
  functionsCovered: number;
  functionsTotal: number;
  /** One entry per shield, strongest first, so a club can see the next step. */
  checks: ShieldCheck[];
  /** True when nothing has been recorded at all — a different thing from NONE. */
  empty: boolean;
};

/** Weakest to strongest. Development Committed is a badge, not a standard. */
const LADDER: Shield[] = ["BRONZE", "SILVER", "GOLD"];

/**
 * Works out the highest shield standard a recorded structure satisfies.
 *
 * Reports every shield rather than only the answer. "Silver" tells a club
 * nothing it can act on; "Silver, because Gold needs a Head of Individual
 * Development and yours is unfilled" tells them what to do next, and it is the
 * same list the Unit needs when deciding whether to depart from the result.
 */
export function scoreStructure(
  roles: StructureRoleSpec[],
  entries: StructureEntryInput[],
  standards: StructureStandardInput[],
): StructureResult {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const status = new Map(entries.map((e) => [e.roleId, e.status]));

  const counting = roles.filter((r) => r.counts);
  const functionsCovered = counting.filter((r) => isFilled(status.get(r.id) ?? "ABSENT")).length;

  const checks: ShieldCheck[] = [];

  for (const shield of [...LADDER].reverse()) {
    const standard = standards.find((s) => s.shield === shield);
    if (!standard) continue;

    const failures: string[] = [];

    if (functionsCovered < standard.functionsRequired) {
      failures.push(
        `${standard.functionsRequired} of the ${counting.length} functions must be filled; ${functionsCovered} ${
          functionsCovered === 1 ? "is" : "are"
        }.`,
      );
    }

    for (const req of standard.roles) {
      const role = byId.get(req.roleId);
      if (!role) continue;
      const current = status.get(req.roleId) ?? "ABSENT";

      if (req.required && !isFilled(current)) {
        failures.push(`${role.label} is required and is not filled.`);
        continue;
      }
      if (req.requireFullTime && current !== "FULL_TIME") {
        // Labels keep their case. Lowercasing turned "C Diploma" into
        // "c diploma", which reads as a typo in a sentence a club is being
        // asked to act on.
        failures.push(`${role.label} must be full time; recorded as "${STATUS_LABELS[current]}".`);
        continue;
      }
      if (req.minQualLevel > 0 && QUAL_LEVEL[current] < req.minQualLevel) {
        failures.push(
          `${role.label} needs ${QUAL_LEVEL_LABELS[req.minQualLevel] ?? "a higher qualification"}; recorded as "${STATUS_LABELS[current]}".`,
        );
      }
    }

    checks.push({ shield, met: failures.length === 0, failures });
  }

  // Strongest met wins. Checks are already strongest-first.
  const level = checks.find((c) => c.met)?.shield ?? "NONE";

  return {
    level,
    functionsCovered,
    functionsTotal: counting.length,
    checks,
    empty: entries.length === 0 || entries.every((e) => e.status === "ABSENT"),
  };
}

/* -------------------------------------------------------------------------- */
/* Football Queensland's catalogue                                            */
/* -------------------------------------------------------------------------- */

/**
 * The roles and per-shield standards, from the 2026 Shield Based Threshold
 * Assessment workbook.
 *
 * Here rather than in `prisma/` because both the seed and the app need them:
 * a cycle created from the portal has to get its standards at that moment, and
 * the seed files use `.ts`-suffixed imports that Next cannot resolve.
 *
 * FQ's numbers, verbatim:
 *
 *   Functions covered   Bronze 5    Silver 6    Gold 8      (of 11, in 2026)
 *   TD full time        Yes         Yes         Yes
 *   Head of Youth       required, min B Diploma at every shield
 *   Head of Junior      -           required    required, min B Diploma
 *   Head of Girls Acad. required    required    required, min B Diploma
 *   Head of Individual  -           -           required, min C Diploma
 *   Position descriptions and roster: required at every shield
 */
export type SeedStructureRole = {
  code: string;
  label: string;
  kind: "PRESENCE" | "EMPLOYMENT" | "QUALIFIED";
  /** False for the two documents, which are required but are not functions. */
  counts?: boolean;
};

export const STRUCTURE_ROLES: SeedStructureRole[] = [
  { code: "GM", label: "General Manager", kind: "PRESENCE" },
  { code: "TD", label: "Technical Director", kind: "EMPLOYMENT" },
  { code: "HO_YOUTH", label: "Head of Youth", kind: "QUALIFIED" },
  { code: "HO_JUNIOR", label: "Head of Junior", kind: "QUALIFIED" },
  { code: "HO_GIRLS", label: "Head of Girls Academy", kind: "QUALIFIED" },
  { code: "HO_INDIVIDUAL", label: "Head of Individual Development", kind: "QUALIFIED" },
  { code: "HO_GK", label: "Head of Goalkeeping", kind: "PRESENCE" },
  { code: "HO_WELLBEING", label: "Head of Wellbeing", kind: "PRESENCE" },
  { code: "HO_SPORTS_SCIENCE", label: "Head of Sports Science & Medicine", kind: "PRESENCE" },
  { code: "FEM_TECH_LEAD", label: "Female Technical Lead", kind: "PRESENCE" },
  { code: "ANALYST", label: "Club Analyst", kind: "PRESENCE" },

  // Required at every shield, but not part of the eleven the coverage count is
  // drawn from — FQ lists them as separate submissions on the same check.
  { code: "POSITION_DESCRIPTIONS", label: "Position descriptions", kind: "PRESENCE", counts: false },
  { code: "ROSTER", label: "Roster and team contacts", kind: "PRESENCE", counts: false },
];

export type SeedStructureRequirement = {
  role: string;
  required?: boolean;
  minQualLevel?: number;
  requireFullTime?: boolean;
};

export type SeedStructureStandard = {
  shield: "BRONZE" | "SILVER" | "GOLD";
  functionsRequired: number;
  roles: SeedStructureRequirement[];
};

/**
 * The 2026 bar. Coverage counts come from FQ's Requirements tab; the per-role
 * rules from the Descriptors tab, which states them in prose.
 *
 * Later years change only `functionsRequired`, which is why it is a per-cycle
 * row rather than a constant: 2027 is Gold 9, Silver 7, Bronze 6, and 2028 is
 * Gold 11, Silver 9, Bronze 7.
 */
export const STRUCTURE_STANDARDS_2026: SeedStructureStandard[] = [
  {
    shield: "BRONZE",
    functionsRequired: 5,
    roles: [
      { role: "TD", required: true, requireFullTime: true },
      // Bronze already demands a B Diploma at Head of Youth. It is the one
      // requirement that does not rise with the shield, and the one FQ's own
      // sheet most often records as met when the entry says otherwise.
      { role: "HO_YOUTH", required: true, minQualLevel: 2 },
      { role: "HO_GIRLS", required: true, minQualLevel: 1 },
      { role: "POSITION_DESCRIPTIONS", required: true },
      { role: "ROSTER", required: true },
    ],
  },
  {
    shield: "SILVER",
    functionsRequired: 6,
    roles: [
      { role: "TD", required: true, requireFullTime: true },
      { role: "HO_YOUTH", required: true, minQualLevel: 2 },
      { role: "HO_JUNIOR", required: true, minQualLevel: 1 },
      { role: "HO_GIRLS", required: true, minQualLevel: 1 },
      { role: "POSITION_DESCRIPTIONS", required: true },
      { role: "ROSTER", required: true },
    ],
  },
  {
    shield: "GOLD",
    functionsRequired: 8,
    roles: [
      { role: "TD", required: true, requireFullTime: true },
      { role: "HO_YOUTH", required: true, minQualLevel: 2 },
      { role: "HO_JUNIOR", required: true, minQualLevel: 2 },
      { role: "HO_GIRLS", required: true, minQualLevel: 2 },
      { role: "HO_INDIVIDUAL", required: true, minQualLevel: 1 },
      { role: "POSITION_DESCRIPTIONS", required: true },
      { role: "ROSTER", required: true },
    ],
  },
];
