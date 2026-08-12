/**
 * Football Queensland's Club Structure Standards, from the 2026 Shield Based
 * Threshold Assessment workbook.
 *
 * NN7 is the one threshold check that is arithmetic rather than judgement:
 * eleven named functions, each recorded from a fixed vocabulary, measured
 * against a coverage count, a set of mandatory roles, and a minimum diploma per
 * role — all three varying by shield, and the coverage count varying by year as
 * well.
 *
 * FQ's own numbers, verbatim:
 *
 *   Functions covered   Bronze 5    Silver 6    Gold 8      (of 11, in 2026)
 *   TD full time        Yes         Yes         Yes
 *   Head of Youth       required, min B Diploma at every shield
 *   Head of Junior      —           required    required, min B Diploma
 *   Head of Girls Acad. required    required    required, min B Diploma
 *   Head of Individual  —           —           required, min C Diploma
 *   Position descriptions and roster: required at every shield
 *
 * The phasing, from the same workbook: "Can miss 3 out of 11 in 2026 (73%),
 * 2 out of 11 in 2027 (82%), full structure in 2028" for Gold, with Silver and
 * Bronze on their own ladders.
 */

/** Qualification ladder. The comparison is "at least", so two statuses tie. */
export const QUAL_LEVEL = {
  ABSENT: 0,
  PRESENT: 0,
  PART_TIME: 0,
  FULL_TIME: 0,
  NOT_MIN_QUAL: 0,
  C_DIPLOMA: 1,
  ENROLLED_B: 2,
  B_DIPLOMA_PLUS: 2,
} as const;

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
