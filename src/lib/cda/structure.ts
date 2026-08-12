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
