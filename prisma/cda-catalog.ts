/**
 * The FQ Club Development & Assessment catalogue.
 *
 * Criteria, evidence points, Non-Negotiables and the qualification ladder as
 * shipped. Everything here is seeded into the database and editable afterwards
 * by the CDU — this file is the starting point, not the live copy, so re-seeding
 * a running instance would discard their wording. `npm run db:seed` clears
 * everything first and is meant for a fresh instance; `db:catalog` tops up
 * missing rows without touching ones that already exist.
 */

export type SeedQualification = {
  code: string;
  label: string;
  points: number;
  stream: "OUTFIELD" | "GOALKEEPING" | "COMMUNITY";
};

/**
 * The AFC/Football Australia coaching pathway, highest first.
 *
 * Points are the top of the 15-point staff score (see src/lib/cda/rubric.ts).
 * The gaps narrow towards the top on purpose: the distance between holding no
 * licence and a C Licence matters far more to a club's capability than the
 * distance between an A Licence and a Pro Diploma.
 */
export const QUALIFICATIONS: SeedQualification[] = [
  { code: "AFC_PRO", label: "AFC Pro Diploma", points: 10, stream: "OUTFIELD" },
  { code: "AFC_A", label: "AFC/FA A Licence", points: 9, stream: "OUTFIELD" },
  { code: "AFC_A_YOUTH", label: "AFC A Youth Diploma", points: 8, stream: "OUTFIELD" },
  { code: "AFC_B", label: "AFC/FA B Licence", points: 7, stream: "OUTFIELD" },
  { code: "AFC_B_YOUTH", label: "AFC B Youth Diploma", points: 6, stream: "OUTFIELD" },
  { code: "AFC_C", label: "AFC/FA C Licence", points: 5, stream: "OUTFIELD" },

  { code: "AFC_GK_A", label: "AFC Goalkeeping A Diploma", points: 9, stream: "GOALKEEPING" },
  { code: "AFC_GK_B", label: "AFC Goalkeeping B Diploma", points: 7, stream: "GOALKEEPING" },
  { code: "FA_GK_C", label: "FA Goalkeeping C Licence", points: 5, stream: "GOALKEEPING" },
  { code: "FA_GK_YOUTH", label: "FA Youth Goalkeeping Certificate", points: 3, stream: "GOALKEEPING" },

  {
    code: "ALLIED_TERTIARY",
    label: "Tertiary allied qualification (S&C, sports science, physio)",
    points: 5,
    stream: "COMMUNITY",
  },
  { code: "FA_GAME_TRAINING", label: "FA Game Training Certificate", points: 4, stream: "COMMUNITY" },
  { code: "FA_SKILL_TRAINING", label: "FA Skill Training Certificate", points: 3, stream: "COMMUNITY" },
  { code: "FA_SENIOR_CERT", label: "FA Senior Certificate", points: 2, stream: "COMMUNITY" },
  { code: "FA_MINIROOS", label: "FA MiniRoos Certificate", points: 1, stream: "COMMUNITY" },
  { code: "NONE", label: "No formal coaching qualification", points: 0, stream: "COMMUNITY" },
];

export type SeedNonNegotiable = {
  code: string;
  title: string;
  description: string;
  evidenceHint: string;
  /**
   * GATE checks are pass or fail: miss one and no shield can be confirmed at
   * all. SHIELD_THRESHOLD checks set a different bar for each shield level, so
   * failing to meet the Gold bar doesn't make a club ineligible — it caps them
   * at the level they did meet.
   */
  kind?: "GATE" | "SHIELD_THRESHOLD";
  /** How FQ expects it to arrive. */
  format?: string;
  /** Where the per-shield detail lives, for the threshold checks. */
  shieldGuidance?: string;
};

/**
 * Football Queensland's nine mandatory checks, worded as they appear in the
 * 2026 Tier 1 assessment.
 *
 * Six are gates: the documents are there or they aren't, and until they are the
 * score cannot be elevated to Confirmed. The last three are shield-based
 * thresholds whose bar rises with the shield being sought — FQ is explicit that
 * "Silver and Bronze clubs are exempt from appointing secondary coaches unless
 * they wish to meet gold rating standards for the following season", which is a
 * cap on the shield rather than a bar on eligibility. They are being phased in
 * over four years.
 */
export const NON_NEGOTIABLES: SeedNonNegotiable[] = [
  {
    code: "NN1",
    title: "Fee Transparency",
    description:
      "The club provides a breakdown of fees using the FQ template, so fees are comparable across all clubs, together with a statement that all academy development fees exclusively support the club's academy program.",
    evidenceHint: "Completed FQ fee template and the fee-use statement.",
    format: "Electronic submission",
  },
  {
    code: "NN2",
    title: "Scholarship positions",
    description:
      "The club provides the list of players who have received a full or partial scholarship at the club for the current season, in line with the licence agreement.",
    evidenceHint: "Scholarship list for the current season (if applicable).",
    format: "Electronic submission",
  },
  {
    code: "NN3",
    title: "Coaches' registration",
    description:
      "The club provides a list of all coaches' details and team allocation. All club coaches in all programs are registered in Squadi, the official system for the season. Coaches' registration is free of charge.",
    evidenceHint: "Squadi registration for every coach, with team allocation.",
    format: "Electronic submission on Squadi",
  },
  {
    code: "NN4",
    title: "Fielding teams and squad numbers",
    description:
      "The club provides a full list of players by the deadline set by FQ before the season, updates FQ's Competition and Technical department on any changes, and fields all teams according to the licence agreement.",
    evidenceHint: "Full squad list by the FQ deadline, kept updated through the season.",
    format: "Electronic submission",
  },
  {
    code: "NN5",
    title: "Technical Director Qualification",
    description:
      "The club's Technical Director holds, or is working towards, an AFC/Football Australia 'A' Diploma or Licence, or an overseas equivalent, and currently resides in Queensland so as to attend training, games and meetings.",
    evidenceHint: "Current licence certificate, or written evidence of enrolment.",
    format: "Electronic submission",
  },
  {
    code: "NN6",
    title: "Technical Staff Qualifications & Safeguarding (Blue cards)",
    description:
      "The club provides a list with full names, FA numbers, current coaching qualification, blue card numbers and expiry dates for all coaches, support staff and administrators working within the academy program.",
    evidenceHint: "Staff register with FA numbers, qualifications, and blue card numbers and expiry.",
    format: "Electronic submission",
  },
  {
    code: "NN7",
    title: "Shield Based Threshold — Club Structure Standards",
    description:
      "The club submits its organisational structure, position descriptions, and staff roster and contact information for teams. The structure standards are set for each shield level and are being introduced gradually over a four-year period.",
    evidenceHint: "Organisational structure, position descriptions, and staff roster.",
    kind: "SHIELD_THRESHOLD",
    format: "Electronic submission & CDA check",
    shieldGuidance:
      "Per-shield standards are set out on pages 8 and 9 of the Club Development Information Pack.",
  },
  {
    code: "NN8",
    title: "Shield Based Threshold — Coaching Standards",
    description:
      "The club meets the minimum coaching qualification and staffing standards for its shield level. Qualification standards come from the club's Technical Staff Qualifications and need no separate submission; staffing standards are captured by submitting the names and roster of secondary coaches at the start of the season, and compliance is recorded during training delivery observations.",
    evidenceHint: "Names and roster of secondary coaches, plus the staff qualification register.",
    kind: "SHIELD_THRESHOLD",
    format: "Electronic submission & CDA check",
    shieldGuidance:
      "Per-shield standards are set out on pages 8 and 9 of the Club Development Information Pack. Silver and Bronze clubs are exempt from appointing secondary coaches unless they are working towards Gold for the following season.",
  },
  {
    code: "NN9",
    title: "Shield Based Threshold — Training Program Standards",
    description:
      "The club provides players with a minimum of three training sessions per week, appropriate field space, and individualised development sessions. The club submits its full training schedule with field allocation; gold-rated clubs also submit the Individual Development Coach's training schedule and the number of players per age group rostered for specialist sessions. Compliance is evaluated primarily during training delivery observations.",
    evidenceHint:
      "Full training schedule with field allocation, and — for Gold — the individual development schedule and rostered player numbers.",
    kind: "SHIELD_THRESHOLD",
    format: "Electronic submission & CDA check",
    shieldGuidance:
      "Per-shield standards are set out on pages 8 and 9 of the Club Development Information Pack.",
  },
];

/**
 * Weightings below are Football Queensland's own, read from the 2026 Tier 1
 * assessment report and checked against the area maxima it states. Fourteen of
 * the fifteen macro-areas reconcile exactly.
 *
 * The exception is Outcomes / Player Development: these weightings total 144
 * points where the report states 126. Either a weighting was misread out of the
 * PDF's columns or the draft is internally inconsistent — it is elsewhere. The
 * figures here are the ones read; FQ should confirm O1-O9 before a live cycle.
 */

export type SeedCriterion = {
  code: string;
  title: string;
  description?: string;
  /** Macro-area within the domain. FQ's report subtotals and grades by these. */
  area?: string;
  /** Tier codes assessed on this item. Tier 2 takes a subset of the same items. */
  tiers?: string[];
  /** True while the evidence points are ours rather than Football Queensland's. */
  evidenceProvisional?: boolean;
  /** FQ's own score bands, where the workbook states them. */
  oneStarAt?: number;
  twoStarAt?: number;
  threeStarAt?: number;
  fourStarAt?: number;
  /** Points multiplier on FQ's scale. Defaults to WEIGHT.STANDARD. */
  weight?: number;
  /**
   * Top of this item's scale. Almost always 3. Set to 4 only where the item
   * genuinely distinguishes a level above "fully met" — FQ does this for
   * observation items like D8, where the difference between a good session and
   * an exceptional one is the thing being measured.
   */
  maxScore?: number;
  /** Whether the item is judged from documents or from watching. */
  mode?: "EVIDENCE" | "OBSERVATION";
  /** Evidence points an assessor ticks. Their count sets the thresholds. */
  evidence: string[];
};

export type SeedDomain = {
  domain: "PLANNING" | "DELIVERY" | "OUTCOMES";
  criteria: SeedCriterion[];
};

/* -------------------------------------------------------------------------- */
/* Planning — P1–P15                                                          */
/* -------------------------------------------------------------------------- */

const PLANNING: SeedCriterion[] = [
  {
    code: "P1",
    title: "Club Values, Mission, Vision and Philosophy",
    area: "Youth Development Plan",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "A current statement of the club's values, mission and vision is documented.",
      "The philosophy is written in the club's own language rather than adopted wholesale.",
      "It is published to members and visible in the club's environment.",
      "Technical staff articulate it consistently when asked.",
      "It has been reviewed within the last 12 months.",
    ],
  },
  {
    code: "P2",
    title: "Player Development and Coaching Methodology Principles",
    area: "Youth Development Plan",
    weight: 8,
    maxScore: 4,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "A player development and coaching methodology document exists and names the person accountable for it.",
      "It sets out coaching methodology principles rather than only a list of topics.",
      "Age-specific guidelines describe the how of coaching, at training and on match day.",
      "It links explicitly to the club's playing style and training environment.",
      "The detail is sufficient to serve as a blueprint for player development at the club.",
      "It is reviewed annually and the refinements are documented.",
    ],
  },
  {
    code: "P3",
    title: "Club Based Playing Style",
    area: "Youth Development Plan",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "The playing style is documented and identifiably the club's own.",
      "It is expressed as principles of play across the four main moments.",
      "It is age-adapted rather than applied identically to every team.",
      "It prioritises principles over formation and structure.",
    ],
  },
  {
    code: "P4",
    title: "Individual Development Planning Guidelines",
    area: "Youth Development Plan",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "Written guidelines define how individual development plans are created and reviewed.",
      "They specify frequency, format and who is accountable.",
      "They describe how player and parent input is incorporated.",
      "They link individual targets back to the club's coaching methodology.",
    ],
  },
  {
    code: "P5",
    title: "Goalkeeper Development Strategy",
    area: "Youth Development Plan",
    weight: 4,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "A goalkeeping syllabus exists, broken down by age band.",
      "It covers distribution and playing out, not only shot-stopping.",
      "It defines how goalkeepers integrate into team training.",
      "A qualified goalkeeping coach is accountable for the strategy.",
    ],
  },
  {
    code: "P6",
    title: "Annual Academy Plan and Training Schedule",
    area: "Training Planning",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "An annual academy plan exists showing phases and their focus.",
      "A full training schedule with field allocation is provided.",
      "The plan accounts for school terms, exams and holidays.",
      "Weekly plans trace back to the annual plan.",
    ],
  },
  {
    code: "P7",
    title: "Principles of Periodisation and Training Program Cycles",
    area: "Training Planning",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "Periodisation principles are documented across macro, meso and micro cycles.",
      "Loading is varied deliberately across the week around fixtures.",
      "The model is adapted by age and stage.",
      "Coaches are inducted into the periodisation model.",
    ],
  },
  {
    code: "P8",
    title: "Talent Development Philosophy",
    area: "Talent Identification",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "A talent development philosophy is documented and shared with coaches.",
      "It accounts explicitly for late developers.",
      "It describes how identified players are supported over time.",
      "It aligns with the club's player development methodology.",
    ],
  },
  {
    code: "P9",
    title: "Talent ID Policy and Player Profiles",
    area: "Talent Identification",
    weight: 4,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "A talent identification policy sets out the criteria and the process.",
      "Player profiles are maintained for identified players.",
      "More than one person contributes to any identification decision.",
      "Profiles carry technical detail linked to the team model.",
    ],
  },
  {
    code: "P10",
    title: "Player / Parent Induction Process",
    area: "Player Services and Support",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "A documented induction process exists for players and parents.",
      "Induction is delivered at the start of each season.",
      "Materials cover expectations, the pathway and welfare contacts.",
      "Attendance is recorded.",
    ],
  },
  {
    code: "P11",
    title: "Goalsetting and Individual Development Plans",
    area: "Player Services and Support",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "Individual development plans exist for players in the identified pathway.",
      "Each sets specific targets rather than general comments.",
      "Players and parents are taken through them at least twice a season.",
      "Progress against previous targets is recorded.",
      "Mid- and long-term goals are captured alongside the season's.",
    ],
  },
  {
    code: "P12",
    title: "Athlete Welfare and Support",
    area: "Player Services and Support",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "A welfare policy is documented with a named welfare officer.",
      "Contact details are shared with players and parents.",
      "Wellbeing checkpoints are scheduled through the season.",
      "Players have access to education sessions on welfare topics.",
    ],
  },
  {
    code: "P13",
    title: "Sport Science Support",
    area: "Player Services and Support",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "A sport science support plan is documented and age-banded.",
      "Load and wellbeing tracking methods are defined.",
      "Injury and return-to-play protocols are documented.",
      "Appropriately qualified staff oversee it.",
    ],
  },
  {
    code: "P14",
    title: "Club Coach Development Strategy",
    area: "Coach Education and Support",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "A written coach development strategy exists.",
      "The club funds or subsidises accreditation courses.",
      "In-house coach development is scheduled across the season.",
      "Each coach has a development plan of their own.",
      "Uptake is tracked and reported to the committee.",
    ],
  },
  {
    code: "P15",
    title: "Coach Onboarding Process",
    area: "Coach Education and Support",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "A documented onboarding process exists for new coaches.",
      "Role descriptions exist for every technical position.",
      "New coaches are inducted into the methodology and playing style.",
      "An event register records who was onboarded and when.",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Delivery — D1–D25                                                          */
/*                                                                            */
/* Wording, evidence points and score bands are Football Queensland's own,     */
/* taken from the Pool A/B/C Delivery Assessment workbook.                     */
/* -------------------------------------------------------------------------- */

const DELIVERY: SeedCriterion[] = [
  {
    code: "D1",
    title: "Attendance and Game Time Record",
    area: "Program Management & Monitoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1", "T2"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club provides attendance records to date for all relevant age groups.",
      "Attendance recording has detail around the reasons for absence that may trigger follow up services or actions for players.",
      "Training attendance records are kept up to date and accessible for the TD/Technical Lead to resolve any issues around general adherence to club training policies.",
      "The club provides game time records to date for all relevant age groups.",
      "The game time records displays useful information that can be then used to inform future decisions around the long-term development of the athlete. (e.g. Player positions, Player loading).",
      "Game time records are kept up to date and accessible for the TD/Technical Lead to resolve any issues around general adherence to club training policies.",
    ],
  },
  {
    code: "D2",
    title: "Workload Tracking",
    area: "Program Management & Monitoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club provides workload records to date for each age group (U13+).",
      "The club has an integrated system for tracking workloads across all the players daily physical activities (club, school, other sports). The system is easily accessible for club staff and players.",
      "The club uses appropriate data capturing methods (i.e. RPE, potentially GPS data at older age groups) and the club sports scientist has control over the use of the data and can easily prepare reports for technical staff that informs future training programs.",
      "Coaches receive education on how to read and utilise the data and using their enhanced knowledge becomes part of their daily planning routine.",
      "The outcomes for weekly average team loading targets are planned in meso cycles and the data is used to compare the planned physical output to actual.",
      "There is evidence that individuals are positively effected by the process. There are cases where top up or pull back is required, personal workload targets have been set and monitored.",
    ],
  },
  {
    code: "D3",
    title: "Wellbeing Monitoring",
    area: "Program Management & Monitoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club provides wellbeing records to date for each age group (U13+).",
      "There is a qualified member of staff who is responsible for monitoring the wellbeing records and assisting players who are flagged, including documentation. It can be physio, club Sport Science Lead. This person may alert the Wellbeing officer if needed.",
      "Players have access to an integrated wellbeing monitoring platform that they can access remotely and have confidence in the red flag system it delivers.",
      "The club has a member of staff who works as the club wellbeing officer. This position is filled by someone who is qualified and has access to all of the players contacts. They also have the ability to alter and change the training prescriptions. The position has a PD and is supported by the board and staff.",
      "The player wellbeing officer's contacts are shared with parents and players at induction and/or club website. The person is actively engaged if any matters arise and they are the point of contact for the members, authorities, schools and FQ Integrity when and if required.",
      "Players and parents access education sessions, wellbeing seminars or programs (that might including physical, social, psychological and environmental wellbeing) to support athletes wellbeing.",
    ],
  },
  {
    code: "D4",
    title: "Bio-Banding, Maturation Rate and PHV",
    area: "Program Management & Monitoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club provides records of maturation and PHV tests for all relevant age groups.",
      "The club conducts testing of players U13 and above a minimum of 3 times through the year.",
      "Testing data is assessed by appropriately qualified staff to inform key technical staff, parents, and players of key information regarding a player's growth.",
      "Testing data is used to clearly define each player in terms of their rate of development (i.e. early, average, late).",
      "Testing data is used to manage players through key stages of development with a clear plan articulated to player and parents.",
      "The club has a clear plan for the management of 'late developers' within the program, which may include playing down an age group.",
    ],
  },
  {
    code: "D5",
    title: "Return To Play Process",
    area: "Program Management & Monitoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 4, threeStarAt: 6,
    evidence: [
      "The club provides a documented and detailed process for injured players club-wide return to play process including roles and responsibilities of medical and coaching team; covering all aspects of the process from injury assessment to modified match minutes to full return (U13+).",
      "The club provides record of injuries for each age group with dates and actions from the beginning of the season to date in line with their process description (U13+).",
      "Evidence that the Club Physio prescribes or personally delivers RTP trainings/exercises, gym activities. The process may be assigned to a club S&C/Sport Scientist to execute on. The criteria only met if the above is provided as a club-based or club covered action.",
      "The club has an integrated mode of ongoing communication between physio/doctor, sports scientist/S&C and technical. This can be cloud based records, regular email updates or Sport Science and Medical meetings.",
      "Player injury history is recorded and maintained for a number of years (even if the player leaves) due to insurance details and player sell on requests.",
      "The club has clear club policies and procedures around items like concussion, EpiPen, defib and emergency response plans.",
      "All base line fitness tests and/or physio screening are completed at the start of the season or when a new player is onboarded. The criteria is only met if there is robust protocol around injury prevention and player screening.",
    ],
  },
  {
    code: "D6",
    title: "Session Plan Library",
    area: "Program Management & Monitoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1", "T2"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "All session plans for academy age groups are stored in a central location.",
      "They are regularly available for the Technical Director to review, and they follow a consistent approach.",
      "Coaches can access practices from other age groups, and the records facilitate knowledge sharing.",
      "The session plans provided show a good level of planning, with non generic language that links into the club's player development & coaching methodology.",
      "The planning reflects the ability to adapt to the team's periodisation loading ideally from U14s upwards (RPE may be displayed).",
      "GK & individualised/specialised session plans are clearly evidenced and uploaded.",
    ],
  },
  {
    code: "D7",
    title: "Video Analysis Services",
    area: "Program Management & Monitoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 4, threeStarAt: 7,
    evidence: [
      "The club possesses adequate equipment for filming of matches, and has an associated video analysis platform.",
      "There is evidence of consistent match day footage recording for all teams throughout the season (ideally weekly, but minimum fortnightly).",
      "Match footage is consistently made available to all key stakeholders (players, parents, medical staff etc.).",
      "Club has an up to date video library, reflecting playing style and key individual techniques. These are used as evidence of club methodology, and are distributed to key stakeholders (coaches, parents, players).",
      "Match footage is consistently used by an analyst or team coaches to create clips for individual and team development. E.g. Match reviews, Opposition Scout, Unit review/feedback.",
      "Individual clips are sent to players or a system is in place where they consistently identify their own and can share these with relevant staff.",
      "There is evidence of a feedback process being implemented within the club to support player development. Video review presentations, individual reviews or AI driven platforms that provide the key highlights and statistics.",
      "The club has a dedicated analyst who works with coaches and players to maximise the utilisation of evidence based feedback.",
    ],
  },
  {
    code: "D8",
    title: "Training Delivery Observation",
    area: "Training Program Observations",
    weight: 10,
    maxScore: 4,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 2, twoStarAt: 4, threeStarAt: 7, fourStarAt: 9,
    evidence: [
      "There is clear evidence of a training plan in place with consistency of delivery between groups in the same development phase.",
      "Session preparation and organisation is executed in a timely manner, uses appropriate field space and equipment, and utilizes available staffing efficiently.",
      "Sessions are planned with a clear technical and/or tactical outcome to meet both individual player and team needs.",
      "Session management includes appropriate timing and flow between components, as well as the ability to adapt and modify practices to meet individual/team needs.",
      "On a practical level, technical detail is evident in the delivery of the session and coaches demonstrate a high-level understanding of the session content and the mode of delivery.",
      "Feedback with players is timely, affects most players’ learning, and is age and stage-appropriate.",
      "Post-session evaluations are conducted regularly, engaging both players and staff through a variety of methods to reflect on session delivery and learning outcomes.",
      "The appearance, behaviour, and overall conduct of the club's coaches aligned with the club's values and beliefs.",
      "A technical lead (who is not directly coaching) oversees training session delivery, providing direction, support, and feedback when necessary. This should be to both coaches and players.",
      "Throughout all sessions, coaches have consistently displayed all outlined criteria, and their delivery is in line with or advances the club's coaching methodology.",
    ],
  },
  {
    code: "D9",
    title: "Coach Interaction Observation (Training)",
    area: "Training Program Observations",
    weight: 8,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 4, threeStarAt: 7,
    evidence: [
      "Coaches create a learning environment where all players are engaged and included.",
      "Coaches demonstrate appropriate mannerisms, tone, and body language.",
      "Coaches communicate clearly and concisely to deliver key messages. Messages are conveyed in a timely manner, and ball rolling time is kept high.",
      "Coaches ask purposeful questions and guide players in alignment with the club's coaching methodology.",
      "Coaches strike a balance between motivating, influencing, and inspiring players.",
      "Coaches differentiate effectively, challenging all players in the session appropriately.",
      "Coaching staff interact positively with other team members and club technical staff to exchange ideas, share knowledge, and seek advice.",
      "Across all sessions, coaches consistently demonstrate the outlined criteria, with delivery that aligns with the club's coaching methodology.",
    ],
  },
  {
    code: "D10",
    title: "TD/TL Interaction Observation (Training)",
    area: "Training Program Observations",
    weight: 6,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The TD/Technical Lead is present and available for age group coaches, organising their time to meet with coaches on training nights, either formally or informally.",
      "The TD/Technical Lead observes training sessions and provides both formal and informal feedback.",
      "The TD/Technical Lead asks purposeful questions, guides effectively, and demonstrates genuine care for both players and coaches.",
      "The TD/Technical Lead displays outstanding football knowledge, with a clear intent to share and foster a learning environment.",
      "The TD/Technical Lead provides support and influence across all age groups within the training environment, offering equal consideration and care.",
      "The TD/Technical Lead communicates and organises all key stakeholders effectively, including coaching staff, sports trainers, and strength & conditioning personnel.",
    ],
  },
  {
    code: "D11",
    title: "Individualised and Specialised Training",
    area: "Training Program Observations",
    weight: 8,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 4, threeStarAt: 6,
    evidence: [
      "Within team training, practices are designed to include specific scenarios/techniques for individual development.",
      "Within team training, coaches provide feedback that supports individual technical or positional development throughout.",
      "There is evidence of team training being structured to target specific areas within the players' individual development plans.",
      "It is evident on visits that individual and specialised trainings are planned and offered as a core part of the academy program. This may be built into the team training, held outside of those sessions or replace team training from time to time.",
      "The individual/specialised training delivered is not ad-hoc or generic and provides a high level of detail for the players.",
      "Level of Individualised/specialised training is age and stage appropriate for developing players in line with the club's own development and coaching methodologies.",
      "Individualised/Specialised trainings are managed in a way to allow for maximum intensity while work to rest ratios are appropriate.",
      "It is evident on visit that there is allocation of coaching staff within the team or program to conduct specialised sessions and monitor individual player progress.",
    ],
  },
  {
    code: "D12",
    title: "Female Player Development in Mixed Training and Playing Environments",
    area: "Training Program Observations",
    weight: 4,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club has a documented process that enables talented female players to train and/or play, either regularly or permanently, with boys in the Junior or Youth phase.",
      "The Club's Technical Director identifies female players who can benefit from training or playing with boys and creates a periodised plan to provide this challenge",
      "The Technical Director informs the Club Development Ambassador and connects with FQ’s Female Player Development Manager to consult with both on the most appropriate way to execute the plan.",
      "The collaboration should result regular updates, sharing the players' Indiviudal Development Plan and getting the players ready to particpate at FQA Emerging or QST trainings in the future.",
      "The Club facilitates competitive boys teams to play midweek fixtures against FQ Academy Girls QST and QAS programs.",
      "The club provides similar mixed opportunities to a wider group of talented female players, either individually or on a rotational basis. These merged training sessions or in-house mixed games must not occur on an ad hoc basis but be clearly planned, scheduled, and documented.",
    ],
  },
  {
    code: "D13",
    title: "Goalkeeper Development Delivery",
    area: "Training Program Observations",
    weight: 6,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club provide appropriate field space in order to conduct all types of goalkeeping practices (crossing, balls over the top and long distribution).",
      "The goalkeeping coach demonstrates excellent organisation, with a well-structured training session that caters to individual and training group needs.",
      "Sessions are well designed with a good balance of execution focused and game related practices that are age and stage appropriate and align to a session objective/topic.",
      "The goalkeeping coach exhibits thorough understanding of goalkeeping techniques and their role within the game and effectively communicates concepts with clarity and precision.",
      "The coaches intervention process is clear, concise and consistent using modelling and demonstrations to support the information provided.",
      "There is evidence that the goalkeeping coach attends a high proportion of match days to provide feedback (Formal and informal) to both junior and youth academy goalkeepers. This criteria is evaluated on Matchday.",
    ],
  },
  {
    code: "D14",
    title: "Medical Standards",
    area: "Training Program Observations",
    weight: 6,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "On site Level 1 First aid or physio at every training.",
      "Physio triage provided once a week at the club’s cost.",
      "Strapping is provided to players if required at every training.​",
      "Defibrillator and stretcher both available on site at training ground",
      "Each matchday must have an on-site and easily accessible Level 1 First Aid officer or qualified physio for all fixtures involving youth age groups. This criteria is evaluated on Matchday.",
      "Pre-game strapping, prehab covered by medical team. Defibrillator and stretcher are on site. This criteria is evaluated on Matchday.",
    ],
  },
  {
    code: "D15",
    title: "Adherence to Club's Player Development Philosophy and Playing Style",
    area: "Match Day Observations",
    weight: 6,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 2, twoStarAt: 4, threeStarAt: 7,
    evidence: [
      "Some of Junior teams consistently and clearly follow the club's defined playing style.",
      "The Majority of Junior teams consistently and clearly follow the club's defined playing style. (Select Criteria 1 aswell).",
      "Some of Youth teams consistently and clearly follow the club's defined playing style.",
      "The Majority of Youth teams consistently and clearly follow the club's defined playing style. (Select Criteria 3 aswell).",
      "Adherence to the playing style remains unwavering, regardless of uncontrollable game incidents such as scoring, conceding goals, red cards, or the perceived importance of the match.",
      "The playing style is easily recognisable as unique to the club, with key factors in the four main moments consistently present throughout games and across most, if not all, age groups.",
      "Within the playing style, there is clear evidence of consistent technical actions and behaviours across playing groups that reflect the club’s player development and coaching methodology",
      "Consistent language is used between players and coaches, reinforcing shared understanding and alignment with the club’s player development and coaching methodology",
      "The playing style prioritises principles over formation and structure. While both are important, the club’s principles of play within the playing style remain the primary focus.",
    ],
  },
  {
    code: "D16",
    title: "Individual Development and Player Behaviours (Match Day)",
    area: "Match Day Observations",
    weight: 6,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "Individual player development is central to the club’s delivery on game day. This is demonstrated through the coach’s ability to link matchday experiences back to each player’s IDP or specific learning focus.",
      "There is evidence of pre-planning through clear visual or verbal cues. Information is delivered in a way that supports understanding and avoids unnecessary cognitive overload.",
      "Each player understands their individual focus for the match, which may align with team or unit targets.",
      "Player behaviors in the game are clearly linked to what has been asked of them.",
      "Players maintain their individual focus and learning intentions regardless of the match state or scoreline.",
      "Players conduct themselves in the spirit of the game and display behaviours consistent with the club’s values and long-term development approach, prioritising learning over one-off results.",
    ],
  },
  {
    code: "D17",
    title: "Coach Interaction Observation (Match Day)",
    area: "Match Day Observations",
    weight: 8,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 4, threeStarAt: 7,
    evidence: [
      "Matchday preparation and organisation is executed in a timely manner, warmups use appropriate field space, equipment and utilize available staffing efficiently.",
      "Coaches demonstrate flexibility in how they engage and communicate with players, using a range of verbal, visual, and technological methods to enhance understanding and learning.",
      "Match day is planned with a specific technical and/or tactical outcome to meet individual and team needs.",
      "Half-time interactions and feedback are age and stage appropriate, incorporating team and individual tasks linked to learning outcomes.",
      "Full-Time interactions and feedback are age and stage appropriate, incorporating team and individual tasks linked to learning outcomes.",
      "Tone and body language when interacting with players is constructive, encouraging and development-focused.",
      "Coaches maintain positive interactions with match officials, opposition staff and players.",
      "The coach’s appearance, punctuality and overall conduct align with the club’s values and beliefs.",
    ],
  },
  {
    code: "D18",
    title: "TD/TL Interaction Observation (Match Day)",
    area: "Match Day Observations",
    weight: 6,
    maxScore: 3,
    mode: "OBSERVATION",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The TD/Technical Lead is always present at game day delivery across all phases at the club.",
      "The TD/Technical Lead can positively influence coaches’ behaviour. They are often able to assist coaches and players across the game day (on bench/in changing room) and have an influence on the organisation of pre, during and post-game education for players and coaches.",
      "After the game the TD/Technical Lead has a formal debrief or actively advises staff (doesn't have to be on the day).",
      "Individual player development is the focus of the TD/Technical Lead.. This can be observed over time through how the TD guides, reminds and encourages coaches to put club planning into action and use match day as a tool for individual growth.",
      "TD/Technical lead is a key line of communication/guardian of everyone's safety for visiting teams, referees and ground staff.",
      "The TD/Technical Lead is fully aware of all the events of the day and upholds the spirit of the game, leads by example, displays professional conduct to provide a general good experience by all involved.",
    ],
  },
  {
    code: "D19",
    title: "Players Self-Evaluation",
    area: "Individual Development & Player Reviews",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club maintains and provides records of player self-evaluation and checkpoints conducted throughout the season.",
      "Players have structured opportunities for guided self-evaluation at regular checkpoints to review progress, adjust goals, and identify key areas for improvement.",
      "Players will have education/guidance across the season that will guide how and when they critically review their own performance and how to complete any templates on the platform used.",
      "Players have access to video clips to support self-review and provide feedback to technical staff.",
      "Individual Development Plans (IDPs) are developed collaboratively, incorporating player input and allowing for continuous review and self-assessment.",
      "Self-assessment serves as the initial reference point for later player evaluations led by coaches, Technical Leads, or the club’s Technical Director.",
    ],
  },
  {
    code: "D20",
    title: "Individual Player Reviews",
    area: "Individual Development & Player Reviews",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1", "T2"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club provides records of feedback and assessment provided by coaches and technical staff for all relevant teams.",
      "Player reviews happen at least two or three times during the season on top of the self-evaluation.",
      "The feedback is tailored and allows the player to understand how they can improve or what are their strengths to achieve mastery.",
      "Whenever age appropriate, video analysis is incorporated to offer players a clearer understanding of the areas they need to work on.",
      "Feedback is not solely provided by the age group coach but involves input from the Technical Director/Technical Lead and other departments within the club.",
      "Player retention, re-trial, and release decisions follow a clear and consistent process overseen by a panel of experienced technical staff, with outcomes communicated to players and parents promptly and transparently",
    ],
  },
  {
    code: "D21",
    title: "Player-Parent Education Events",
    area: "Individual Development & Player Reviews",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club implements a planned schedule of player and parent education events (workshops, webinars, clinics, etc.) throughout the season, in addition to the yearly induction presentations.",
      "These educational events are incorporated into the academy’s annual plan and are accessible to all players across the club.",
      "A minimum of quarterly delivery (4 throughout the season) is evident in addition to the player induction presentation, ensuring consistent opportunities for education and development throughout the season.",
      "The content and topics for the education events are relevant and appropriate for the ages and stages of player development. Workshops and webinars may cover a wide range of topics, including but not limited to the playing style explanation, player evaluation procedures, match analysis, sport psychology, goal setting, injury prevention, nutrition, athlete wellbeing, and other relevant subjects.",
      "Leading industry experts may be involved in some or all the delivery of education events.",
      "The club provides evidence of the activity, including scheduled dates, attendee register, content, presentations, and video recordings of the education events.",
    ],
  },
  {
    code: "D22",
    title: "Coaches Self Evaluation",
    area: "Coach Reviews & Mentoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "The club provides evidence of coaches’ self-evaluation (including strengths and areas to improve) linked to personal and football competencies throughout the season.",
      "Self-evaluation appears across various activities, including video recording of training sessions, match review, pre-game team talks, half-time team talks, post-game team talks club workshops delivery, and more.",
      "There is consistent evidence of coaches reflecting on their practice to a high level of detail.",
      "The club strictly follows its review schedule and ensures that all self-evaluations are documented using a dedicated form or template. A minimum of quarterly self-evaluation is required.",
      "These evaluations link into the coaches individual development plans (IDPs).",
      "TD or Technical Lead provides feedback to coaches based on their self reflections with multiple check-in points throughout the season to facilitate self-reflection and monitor progress.",
    ],
  },
  {
    code: "D23",
    title: "Coaches' Individual Development Plan",
    area: "Coach Reviews & Mentoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1", "T2"],
    oneStarAt: 1, twoStarAt: 4, threeStarAt: 7,
    evidence: [
      "The club provides evidence of ongoing Coaches' individual development plans (IDP) and collaboration for all their coaching staff.",
      "Coaches are encouraged to focus on identified areas of strength and areas for improvement linked to personal and football competencies.",
      "The IDP are set up with areas that are appropriate for the different stages of development of their coaches.",
      "There is consistent evidence of IDP to a high level of detail.",
      "The club follows the processes regarding the frequency of reviews and documents evidence for all academy coaches, with check-in points scheduled throughout the season to track progress. A minimum of quarterly check-in points is required.",
      "Coaches are given benchmarks for personal and professional growth. They are shown how to develop within the club and within the profession generally, and a clear path is suggested within or outside the Club.",
      "Coaches receive additional support either internally or externally through a mentor network, which includes, but is not limited to, the technical directors, technical leads, head of phase, senior coaches, experienced coaches, or peer mentoring between coaches.",
      "A season ending performance review is accompanied by guidance leading to the development of the next seasons plan.",
    ],
  },
  {
    code: "D24",
    title: "Coach Mentoring",
    area: "Coach Reviews & Mentoring",
    weight: 8,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 3, threeStarAt: 5,
    evidence: [
      "There is substantial evidence of ongoing informal mentoring with ongoing feedback provided.",
      "There is substantial evidence of ongoing formal mentoring with ongoing feedback provided.",
      "There is clear evidence that the TD/Technical Lead is maintaining a clear outcome for all coaches through a mentoring system at the club. There is an allocation of mentors and mentees for all coaches within the Club or using external people.",
      "There is clear evidence of documented goals and specific outcomes (i.e. linked to self-evaluation and IDPs) achieved by all coaches for continuous improvement, with mutual benefits for mentors and mentees. Formal and informal mentoring are easily monitored and recorded.",
      "Coach Mentoring appears across various activities, including peer review or mentoring in the following areas throughout the season: coaching methodology or player development topics, video recording of training sessions, match review, pre-game team talks, half-time team talks, post-game team talks club workshops delivery, and more.",
      "The coaching staff have opportunities to collaborate across multiple teams. This may be through inter department workshops (on best practice) or session delivery and reviews throughout the season.",
    ],
  },
  {
    code: "D25",
    title: "Coach Education Events",
    area: "Coach Reviews & Mentoring",
    weight: 6,
    maxScore: 3,
    mode: "EVIDENCE",
    tiers: ["T1"],
    oneStarAt: 1, twoStarAt: 4, threeStarAt: 6,
    evidence: [
      "The club plans a series of annual internal educational events to support coach development. The educational events are clearly scheduled within a calendar.",
      "Within reasons, the proposed schedule at planning stage is reflected in the education events delivered. To maximize engagement and staff inclusion, training schedules have planned breaks for education events. Some consideration is given to planning those events in case of wet weather or in Term 2.",
      "The education events (i.e. workshops and webinars) are directly tied to key topics like the club's values, mission, vision and philosophy, youth development plan, coaching methodology or other topics of interest relevant to coaches after agreement / review of their IDP.",
      "Education events delivered have been tailored to engage coaches for both programs (boys and girls) and across all age groups within the club. This may include gender-specific coach workshops.",
      "External experts are invited to lead some of these educational sessions covering topics outside the technical department like sports science, physiotherapy, nutrition, psychology, etc.",
      "The club has an effective system for tracking the attendance of education events, which includes documenting the date, time, and location of sessions, technical staff in attendance, the content covered during the webinar/workshop, the presenter/s and any other relevant details.",
      "Video recordings, presentations, and materials are made available to coaches and attendees after the events and are archived as part of the club’s permanent knowledge base.",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Outcomes — O1–O14                                                          */
/* -------------------------------------------------------------------------- */

const OUTCOMES: SeedCriterion[] = [
  {
    code: "O1",
    title: "National Team Players",
    area: "Player Development",
    weight: 4,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "The club has produced a player selected for a national team.",
      "More than one player has been selected across recent cycles.",
      "Selections are tracked and recorded by the club.",
      "The club maintains a relationship with progressed players.",
    ],
  },
  {
    code: "O2",
    title: "Professional Players",
    area: "Player Development",
    weight: 4,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "A player developed at the club holds a professional contract.",
      "More than one has done so across recent cycles.",
      "Progression is tracked and recorded by the club.",
      "Progressed players return to the club in some capacity.",
    ],
  },
  {
    code: "O3",
    title: "Homegrown Players",
    area: "Player Development",
    weight: 4,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "Players developed at the club feature in its own senior teams.",
      "The number doing so has held or grown year on year.",
      "Time at the club before senior selection is recorded.",
      "The pathway from junior to senior is deliberately managed, not incidental.",
    ],
  },
  {
    code: "O4",
    title: "National Youth Team Players",
    area: "Player Development",
    weight: 4,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "A player has been selected into a national youth team.",
      "Selections span more than one age group.",
      "The club supports selected players' additional load.",
      "Selections are tracked and recorded.",
    ],
  },
  {
    code: "O5",
    title: "Full Time Queensland State Team Players",
    area: "Player Development",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "Players have been selected into full-time Queensland State Team programs.",
      "Selections span more than one age group.",
      "The club coordinates with the program on load and development.",
      "Outcomes are reviewed with players who were not selected.",
    ],
  },
  {
    code: "O6",
    title: "Club Based Queensland State Team Players",
    area: "Player Development",
    weight: 8,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "Players have been selected into club-based Queensland State Team programs.",
      "Selections span more than one age group.",
      "The number selected has held or grown year on year.",
      "The club supports selected players alongside their club program.",
    ],
  },
  {
    code: "O7",
    title: "Talented Player Programs",
    area: "Player Development",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "Players have been selected into FQ talented player programs.",
      "Selections span more than one age group.",
      "The club prepares players for selection rather than only nominating them.",
      "Participation is tracked and recorded.",
    ],
  },
  {
    code: "O8",
    title: "Progressing Players",
    area: "Player Development",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "Players have progressed to a higher-tier club, academy or program.",
      "Progression is tracked and published internally.",
      "Movements are recorded year on year rather than anecdotally.",
      "The club maintains contact with progressed players.",
    ],
  },
  {
    code: "O9",
    title: "Talent Identification Database & Management",
    area: "Player Development",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "The club maintains entries in the FQ talent identification database.",
      "Entries are kept current across the season, not filed once.",
      "Player movements are tracked every year.",
      "A named person is accountable for the database.",
    ],
  },
  {
    code: "O10",
    title: "Retention Lists",
    area: "Player Retention",
    weight: 8,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "Retention lists are maintained and provided for all relevant age groups.",
      "Overall retention is at or above 80%.",
      "Retention holds in the age bands where drop-off is sharpest.",
      "Departing players are followed up and the findings acted on.",
    ],
  },
  {
    code: "O11",
    title: "Member Experience Surveys",
    area: "Member Satisfaction",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "A member experience survey was run this cycle with a meaningful response rate.",
      "The Net Promoter Score is positive.",
      "The Net Promoter Score is 15 or above.",
      "The Net Promoter Score is 30 or above.",
    ],
  },
  {
    code: "O12",
    title: "Shared Best Practice Delivery",
    area: "Knowledge Sharing",
    weight: 6,
    tiers: ["T1"],
    evidenceProvisional: true,
    evidence: [
      "The club has delivered a shared best practice session for other clubs.",
      "The content was tied to a specific line item or methodology area.",
      "Materials were made available afterwards.",
      "More than one member of staff contributed to the delivery.",
    ],
  },
  {
    code: "O13",
    title: "Female Technical Staff",
    area: "Strategic Plan",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "At least one female coach holds a technical role in the academy.",
      "Female technical staff make up 15% or more of the academy's coaches.",
      "Female technical staff make up 30% or more of the academy's coaches.",
      "Female coaches are mentored and developed, not only recruited.",
    ],
  },
  {
    code: "O14",
    title: "Female Participation",
    area: "Strategic Plan",
    weight: 6,
    tiers: ["T1", "T2"],
    evidenceProvisional: true,
    evidence: [
      "Female registrations have grown year on year.",
      "Female teams are fielded in more than one age band.",
      "Female players are retained at a rate comparable to male players.",
      "A dedicated female entry program runs each year.",
    ],
  },
];

export const CRITERIA: SeedDomain[] = [
  { domain: "PLANNING", criteria: PLANNING },
  { domain: "DELIVERY", criteria: DELIVERY },
  { domain: "OUTCOMES", criteria: OUTCOMES },
];

/** Total line items across the three assessed domains. */
export const CRITERION_COUNT = CRITERIA.reduce((n, d) => n + d.criteria.length, 0);
