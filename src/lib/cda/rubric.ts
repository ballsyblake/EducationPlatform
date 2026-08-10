/**
 * The parts of the CDA rubric that are fixed in code.
 *
 * The split is deliberate. Anything the Club Development Unit rewords between
 * cycles — criteria, sub-criteria, Non-Negotiables, the qualification ladder —
 * lives in the database. What stays here is the shape of the scoring itself:
 * the roles that count towards Technical Qualifications, how many of each are
 * counted, and how experience and employment convert into points. Changing any
 * of that changes what a rating *means*, so it belongs in a reviewed diff
 * rather than an admin form.
 *
 * Free of "server-only" so the seed script and client components can both read
 * the labels.
 */
import type {
  Domain,
  EmploymentType,
  QualificationStream,
  Shield,
  StaffGender,
  StaffRole,
} from "@prisma-client";

/* -------------------------------------------------------------------------- */
/* Domains                                                                    */
/* -------------------------------------------------------------------------- */

export const DOMAIN_LABELS: Record<Domain, string> = {
  TECHNICAL: "Technical Qualifications",
  PLANNING: "Planning",
  DELIVERY: "Delivery",
  OUTCOMES: "Outcomes",
};

export const DOMAIN_BLURBS: Record<Domain, string> = {
  TECHNICAL: "Qualified staff in the key technical roles, and how they are engaged.",
  PLANNING: "Documented youth development, periodisation, talent ID and coach education plans.",
  DELIVERY: "Observed quality of coaching — sessions, match day, and how coaches work with players.",
  OUTCOMES: "What the programs produce: retention, participation, female growth and game time.",
};

/** The three domains scored by assessors against criteria. */
export const ASSESSED_DOMAINS = ["PLANNING", "DELIVERY", "OUTCOMES"] as const satisfies Domain[];

/* -------------------------------------------------------------------------- */
/* Technical Qualifications                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A staff member's score is the sum of three parts, so the maximum is 15:
 *
 *   qualification   0-10   their highest qualification's points
 *   experience       0-3   years in the role
 *   employment       0-2   how the club engages them
 *
 * The qualification carries two thirds of it on purpose: this domain is called
 * Technical Qualifications, and a full-time volunteer of twenty years with no
 * licence should not out-score a qualified appointment.
 */
export const MAX_QUALIFICATION_POINTS = 10;
export const MAX_STAFF_POINTS = 15;

/** Years of experience in the role, in bands. */
export function experiencePoints(years: number) {
  if (years >= 10) return 3;
  if (years >= 5) return 2;
  if (years >= 2) return 1;
  return 0;
}

export const EXPERIENCE_BANDS = [
  { label: "Under 2 years", points: 0 },
  { label: "2–4 years", points: 1 },
  { label: "5–9 years", points: 2 },
  { label: "10 years or more", points: 3 },
];

/**
 * How the club engages them. Paid engagement scores because it buys contact
 * hours and continuity, which is what the domain is actually measuring — not
 * because volunteers are worth less.
 */
export const EMPLOYMENT_POINTS: Record<EmploymentType, number> = {
  FULL_TIME: 2,
  PART_TIME: 1,
  CONTRACT: 1,
  VOLUNTEER: 0,
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract / sessional",
  VOLUNTEER: "Volunteer",
};

export const GENDER_LABELS: Record<StaffGender, string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Other",
  UNDISCLOSED: "Prefer not to say",
};

export type StaffRoleSpec = {
  label: string;
  /** What the role is for, shown to clubs entering staff. */
  blurb: string;
  /** Relative importance of the role within the domain. */
  weight: number;
  /**
   * How many people in this role count towards the score. A club with eleven
   * junior coaches isn't eleven times better resourced than one with six, and
   * counting every one of them would let volume paper over an unqualified TD.
   */
  counted: number;
  /** Which qualification stream is the natural fit for the role. */
  stream: QualificationStream;
};

/**
 * The roles that make up the Technical Qualifications score, and what each is
 * worth. A role with nobody in it scores zero for its whole weight — that is
 * the point: the domain measures whether the club has actually appointed to
 * these positions, not just how good the appointments it made are.
 */
export const STAFF_ROLE_SPECS: Record<StaffRole, StaffRoleSpec> = {
  TECHNICAL_DIRECTOR: {
    label: "Technical Director",
    blurb: "Holds the club's technical vision across all programs.",
    weight: 5,
    counted: 1,
    stream: "OUTFIELD",
  },
  HEAD_OF_YOUTH_ACADEMY: {
    label: "Head of Youth Academy",
    blurb: "Runs the youth pathway day to day.",
    weight: 4,
    counted: 1,
    stream: "OUTFIELD",
  },
  SENIOR_HEAD_COACH: {
    label: "Senior Head Coach",
    blurb: "Head coach of a senior team.",
    weight: 3,
    counted: 2,
    stream: "OUTFIELD",
  },
  YOUTH_HEAD_COACH: {
    label: "Youth Head Coach",
    blurb: "Head coach of a youth age group in the pathway.",
    weight: 3,
    counted: 4,
    stream: "OUTFIELD",
  },
  GOALKEEPING_COACH: {
    label: "Goalkeeping Coach",
    blurb: "Specialist goalkeeping delivery.",
    weight: 3,
    counted: 2,
    stream: "GOALKEEPING",
  },
  FEMALE_PROGRAM_LEAD: {
    label: "Female Program Lead",
    blurb: "Leads the club's female football program.",
    weight: 3,
    counted: 1,
    stream: "OUTFIELD",
  },
  PLAYER_DEVELOPMENT_OFFICER: {
    label: "Player Development Officer",
    blurb: "Individual development plans and player tracking.",
    weight: 2,
    counted: 1,
    stream: "OUTFIELD",
  },
  STRENGTH_AND_CONDITIONING: {
    label: "Strength & Conditioning",
    blurb: "Physical preparation and load management.",
    weight: 2,
    counted: 1,
    stream: "OUTFIELD",
  },
  JUNIOR_COACH: {
    label: "Junior Coach",
    blurb: "Coaches a junior team below the youth pathway.",
    weight: 2,
    counted: 6,
    stream: "COMMUNITY",
  },
  MINIROOS_COORDINATOR: {
    label: "MiniRoos Coordinator",
    blurb: "Coordinates the club's grassroots entry programs.",
    weight: 1,
    counted: 1,
    stream: "COMMUNITY",
  },
};

/** Display order for staff roles — seniority, matching the weights. */
export const STAFF_ROLE_ORDER = Object.keys(STAFF_ROLE_SPECS) as StaffRole[];

/**
 * Football Queensland's cap on how many assessors may score one club.
 *
 * Policy rather than schema, so it lives here and is enforced in the assign
 * action — raising it should not require a migration. It can't live in the
 * actions file itself: that carries "use server", where only async functions
 * may be exported.
 */
export const MAX_ASSESSORS_PER_CLUB = 3;

/**
 * A goalkeeping licence in an outfield role — or the reverse — is a real
 * qualification, just not the one the role calls for, so it scores at half.
 * Community certificates are general-purpose and never discounted.
 */
export const OFF_STREAM_MULTIPLIER = 0.5;

export function streamMultiplier(roleStream: QualificationStream, qual: QualificationStream) {
  if (qual === "COMMUNITY" || roleStream === "COMMUNITY") return 1;
  return roleStream === qual ? 1 : OFF_STREAM_MULTIPLIER;
}

export const QUALIFICATION_STREAM_LABELS: Record<QualificationStream, string> = {
  OUTFIELD: "Outfield",
  GOALKEEPING: "Goalkeeping",
  COMMUNITY: "Community",
};

/* -------------------------------------------------------------------------- */
/* Stars                                                                      */
/* -------------------------------------------------------------------------- */

/** The top of the scale for most line items. A few go to 4 — see maxScore. */
export const DEFAULT_MAX_SCORE = 3;

/** No line item may exceed this, whatever a criterion is configured with. */
export const ABSOLUTE_MAX_SCORE = 4;

export type StarThresholds = {
  oneStarAt: number;
  twoStarAt: number;
  threeStarAt: number;
  fourStarAt?: number | null;
  maxScore?: number;
};

/**
 * Turns ticked evidence points into a score.
 *
 * Read highest band first, so a criterion whose thresholds were edited into a
 * non-ascending order still behaves sensibly rather than silently awarding the
 * wrong band. The top band is only reachable when the criterion actually goes
 * to 4 and has a threshold for it — otherwise a stray `fourStarAt` on a
 * three-point item can't push a score past its own maximum.
 */
export function starsFromEvidence(met: number, thresholds: StarThresholds): number {
  const max = thresholds.maxScore ?? DEFAULT_MAX_SCORE;

  if (max >= 4 && thresholds.fourStarAt != null && met >= thresholds.fourStarAt) return 4;
  if (met >= thresholds.threeStarAt) return Math.min(3, max);
  if (met >= thresholds.twoStarAt) return Math.min(2, max);
  if (met >= thresholds.oneStarAt) return Math.min(1, max);
  return 0;
}

/**
 * Default thresholds for a criterion with `count` evidence points.
 *
 * Modelled on Football Queensland's own bands: the top score needs all or
 * nearly all of them, and the bands below divide the rest roughly evenly. A
 * four-point item gets an extra band at the top rather than a shifted one, so
 * three still means what it means everywhere else.
 */
export function defaultThresholds(count: number, maxScore = DEFAULT_MAX_SCORE): StarThresholds {
  if (maxScore >= 4) {
    return {
      oneStarAt: Math.max(1, Math.ceil(count * 0.2)),
      twoStarAt: Math.max(2, Math.ceil(count * 0.4)),
      threeStarAt: Math.max(3, Math.ceil(count * 0.7)),
      fourStarAt: Math.max(4, count - 1),
      maxScore,
    };
  }

  return {
    oneStarAt: 1,
    twoStarAt: Math.max(2, Math.ceil((count * 2) / 3)),
    threeStarAt: Math.max(3, count),
    fourStarAt: null,
    maxScore,
  };
}

export const STAR_LABELS = [
  "Not evidenced",
  "Developing",
  "Established",
  "Leading",
  "Exemplary",
] as const;

export function starLabel(stars: number) {
  return STAR_LABELS[Math.max(0, Math.min(ABSOLUTE_MAX_SCORE, stars))];
}

/* -------------------------------------------------------------------------- */
/* Shields                                                                    */
/* -------------------------------------------------------------------------- */

export const SHIELD_LABELS: Record<Shield, string> = {
  NONE: "No shield",
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

/**
 * Shield colours.
 *
 * These are metal colours, not brand colours — a Gold shield has to look gold,
 * and the FQ palette contains nothing that would read as one. They're confined
 * to the shield chip itself, which is the one place the guidelines' own
 * competition-palette precedent applies: a sub-brand keeps its own identifying
 * colour inside the FQ system.
 */
export const SHIELD_COLOURS: Record<Shield, { bg: string; fg: string; ring: string }> = {
  NONE: { bg: "#f2f2f2", fg: "#545454", ring: "#d4d4d4" },
  BRONZE: { bg: "#f6e8dc", fg: "#7a4a21", ring: "#c88b4e" },
  SILVER: { bg: "#eef1f4", fg: "#4a5560", ring: "#a8b4bf" },
  GOLD: { bg: "#fdf3d6", fg: "#7a5c00", ring: "#d4a72c" },
  PLATINUM: { bg: "#eaf1f2", fg: "#2f4f55", ring: "#7fa5ad" },
};

/* -------------------------------------------------------------------------- */
/* Outcomes metrics                                                           */
/* -------------------------------------------------------------------------- */

export type MetricSpec = {
  key: string;
  label: string;
  hint: string;
  /** Rendered as a percentage rather than a count. */
  percentage?: boolean;
};

/**
 * The participation figures a club reports each cycle.
 *
 * These carry no weight of their own — they're the evidence an assessor reads
 * while scoring the Outcomes criteria. Keeping them unscored is deliberate:
 * self-reported numbers shouldn't move a rating without someone verifying them.
 */
export const METRIC_SPECS: MetricSpec[] = [
  {
    key: "total_registered",
    label: "Total registered players",
    hint: "All ages, all genders, as registered in PlayFootball.",
  },
  {
    key: "female_registered",
    label: "Registered female players",
    hint: "Included in the total above.",
  },
  {
    key: "youth_registered",
    label: "Registered youth players (13–18)",
    hint: "Players in the youth pathway age bands.",
  },
  {
    key: "miniroos_registered",
    label: "MiniRoos participants (4–11)",
    hint: "Grassroots entry programs.",
  },
  {
    key: "retention_rate",
    label: "Player retention rate",
    hint: "Share of last season's players who re-registered this season.",
    percentage: true,
  },
  {
    key: "female_teams",
    label: "Female teams fielded",
    hint: "Teams entered in a female competition.",
  },
  {
    key: "youth_game_time",
    label: "Youth players averaging 50%+ game time",
    hint: "Share of youth-pathway players getting meaningful minutes.",
    percentage: true,
  },
  {
    key: "coaches_accredited",
    label: "Accredited coaches",
    hint: "Coaches holding a current Football Australia accreditation.",
  },
];

/** Year-on-year change, or null when there's nothing to compare against. */
export function metricChange(value: number | null, prior: number | null) {
  if (value === null || prior === null || prior === 0) return null;
  return ((value - prior) / prior) * 100;
}
