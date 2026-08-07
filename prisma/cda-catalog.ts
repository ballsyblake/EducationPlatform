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
};

/**
 * The nine mandatory eligibility checks.
 *
 * Failing any one of these means no shield at all, whatever the domain scores
 * say — so each is written to be answerable yes or no from a document, not to
 * be a matter of judgement. Anything that needs an assessor's opinion belongs
 * in a criterion instead.
 */
export const NON_NEGOTIABLES: SeedNonNegotiable[] = [
  {
    code: "NN-1",
    title: "Qualified Technical Director",
    description:
      "The club has appointed a Technical Director holding at least an AFC/FA B Licence, with a written role description and a reporting line to the committee.",
    evidenceHint: "Signed role description, and the TD's current licence certificate.",
  },
  {
    code: "NN-2",
    title: "Blue Card compliance",
    description:
      "Every person in a coaching, technical or officiating role holds a current Working with Children Check (Blue Card), and the club maintains a register of expiry dates.",
    evidenceHint: "Blue Card register showing card numbers and expiry dates for all staff.",
  },
  {
    code: "NN-3",
    title: "Female coaching presence",
    description:
      "At least one female coach holds a technical role in the club, and is included in the club's coach development program on the same terms as everyone else.",
    evidenceHint: "Staff register entry, plus the coach development plan naming her.",
  },
  {
    code: "NN-4",
    title: "Minimum coaching ratios",
    description:
      "Every team in the youth pathway has a designated accredited coach, and no coach is responsible for more than two teams.",
    evidenceHint: "Team-by-team coach allocation for the current season.",
  },
  {
    code: "NN-5",
    title: "All players registered",
    description:
      "Every participant is registered in PlayFootball before their first match, including trialists and guest players.",
    evidenceHint: "PlayFootball registration export reconciled against team sheets.",
  },
  {
    code: "NN-6",
    title: "Governance and AGM",
    description:
      "The club has a current constitution, a functioning management committee, and has held an Annual General Meeting within the last 12 months.",
    evidenceHint: "Constitution, committee list, and the minutes of the most recent AGM.",
  },
  {
    code: "NN-7",
    title: "Member protection and child safe policy",
    description:
      "A Member Protection Policy and Child Safe Policy are adopted, published to members, and a Member Protection Information Officer is nominated and contactable.",
    evidenceHint: "Both policies as published, and the MPIO's name and contact details.",
  },
  {
    code: "NN-8",
    title: "Insurance and facility compliance",
    description:
      "Current public liability insurance is held, and the club's home facility meets Football Queensland's minimum standards for the competitions it enters.",
    evidenceHint: "Certificate of currency, and the most recent facility inspection record.",
  },
  {
    code: "NN-9",
    title: "Financial standing with Football Queensland",
    description:
      "The club has no outstanding affiliation fees, competition levies or fines owing to Football Queensland.",
    evidenceHint: "Confirmed against the FQ finance ledger by the Club Development Unit.",
  },
];

export type SeedCriterion = {
  code: string;
  title: string;
  description: string;
  /** Relative weight within the domain. 2 marks a criterion that carries more. */
  weight?: number;
  /** Evidence points an assessor ticks. Their count sets the star thresholds. */
  evidence: string[];
};

export type SeedDomain = {
  domain: "PLANNING" | "DELIVERY" | "OUTCOMES";
  criteria: SeedCriterion[];
};

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

const PLANNING: SeedCriterion[] = [
  {
    code: "PL-01",
    title: "Youth development plan",
    description:
      "A documented, multi-year plan for how players are developed from entry through to senior football.",
    weight: 2,
    evidence: [
      "A written plan exists and names the person accountable for it.",
      "It covers every age band from MiniRoos to senior.",
      "It sets measurable objectives with review dates.",
      "It has been formally endorsed by the committee.",
      "It was reviewed within the last 12 months.",
    ],
  },
  {
    code: "PL-02",
    title: "Playing philosophy and style of play",
    description:
      "A stated style of play that connects what is coached on the training pitch to how teams play on match day.",
    weight: 2,
    evidence: [
      "The playing philosophy is documented in club language, not copied wholesale.",
      "It is expressed in principles of play, in and out of possession.",
      "It is age-adapted rather than applied identically to every team.",
      "Coaches can articulate it consistently when asked.",
    ],
  },
  {
    code: "PL-03",
    title: "Periodised training program",
    description:
      "Training is planned across the season rather than assembled week to week.",
    evidence: [
      "A season plan exists showing phases and their focus.",
      "Weekly plans trace back to the season plan.",
      "Loading is varied deliberately across the week around fixtures.",
      "The plan accounts for school terms, exams and holidays.",
    ],
  },
  {
    code: "PL-04",
    title: "Age-appropriate curriculum",
    description:
      "What is coached at each age band is defined and aligned to the Football Australia National Football Curriculum.",
    weight: 2,
    evidence: [
      "A curriculum document sets the technical focus for each age band.",
      "It aligns to the National Football Curriculum's stages of development.",
      "Session content is drawn from it rather than chosen ad hoc.",
      "Coaches hold a copy and are inducted into it.",
    ],
  },
  {
    code: "PL-05",
    title: "Talent identification framework",
    description:
      "How the club identifies and tracks players with potential, and how that judgement is made consistently.",
    evidence: [
      "Identification criteria are written down and shared with coaches.",
      "More than one person contributes to any identification decision.",
      "Late developers are explicitly accounted for.",
      "Identified players are tracked over time, not just at trials.",
    ],
  },
  {
    code: "PL-06",
    title: "Individual development plans",
    description: "Individual players have documented development targets and review points.",
    evidence: [
      "IDPs exist for players in the identified pathway.",
      "Each sets specific targets rather than general comments.",
      "Players and parents are taken through them at least twice a season.",
      "Progress against previous targets is recorded.",
    ],
  },
  {
    code: "PL-07",
    title: "Coach education policy",
    description:
      "A documented commitment to developing the club's own coaches, with a budget behind it.",
    weight: 2,
    evidence: [
      "A written coach education policy exists.",
      "The club funds or subsidises accreditation courses.",
      "In-house coach development sessions are scheduled across the season.",
      "Each coach has a development plan of their own.",
      "Uptake is tracked and reported to the committee.",
    ],
  },
  {
    code: "PL-08",
    title: "Coach recruitment and succession",
    description:
      "How coaches are appointed, and what happens when a key coach leaves.",
    evidence: [
      "Role descriptions exist for every technical position.",
      "Appointments follow a defined process rather than word of mouth alone.",
      "Successors are identified for the Technical Director and academy head.",
      "Exit and handover expectations are documented.",
    ],
  },
  {
    code: "PL-09",
    title: "Goalkeeper development plan",
    description:
      "Goalkeepers are planned for specifically rather than absorbed into outfield programming.",
    evidence: [
      "A goalkeeping syllabus exists by age band.",
      "Dedicated goalkeeper training is timetabled weekly.",
      "Goalkeepers are integrated into team training, not only trained apart.",
      "A qualified goalkeeping coach is accountable for the program.",
    ],
  },
  {
    code: "PL-10",
    title: "Female football strategy",
    description:
      "A plan for growing and sustaining female participation, with someone accountable for it.",
    weight: 2,
    evidence: [
      "A written female football strategy exists with growth targets.",
      "A named person is accountable for delivering it.",
      "It addresses facilities, changing rooms and scheduling equity.",
      "It includes recruiting and developing female coaches.",
      "Progress is reported to the committee at least twice a year.",
    ],
  },
  {
    code: "PL-11",
    title: "Player pathway and transitions",
    description:
      "How players move between age groups, between teams, and out of the club without being lost.",
    evidence: [
      "The pathway from MiniRoos to senior football is mapped and published.",
      "Transition points have a defined process, not just a trial.",
      "Players not selected are given a documented alternative within the club.",
      "Exiting players are followed up rather than simply lapsing.",
    ],
  },
  {
    code: "PL-12",
    title: "Strength, conditioning and load management",
    description:
      "Physical preparation is planned appropriately for youth players.",
    evidence: [
      "A physical development plan exists, age-banded.",
      "Weekly training and match load is tracked for youth-pathway players.",
      "Injury and return-to-play protocols are documented.",
      "Someone appropriately qualified oversees it.",
    ],
  },
  {
    code: "PL-13",
    title: "Facility and resource planning",
    description:
      "Pitches, equipment and budget are planned against what the programs actually require.",
    evidence: [
      "Training allocations are planned across the whole club, not first-come.",
      "Equipment is inventoried and replaced on a schedule.",
      "A technical budget is set and tracked annually.",
      "Facility constraints are documented with a plan to address them.",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Delivery                                                                   */
/* -------------------------------------------------------------------------- */

const DELIVERY: SeedCriterion[] = [
  {
    code: "DL-01",
    title: "Session organisation",
    description: "The session is set up and run so that time is spent playing, not queueing.",
    weight: 2,
    evidence: [
      "Equipment and areas are set up before players arrive.",
      "Transitions between activities take under two minutes.",
      "Group sizes keep every player active.",
      "The session starts and finishes on time.",
    ],
  },
  {
    code: "DL-02",
    title: "Session content aligned to curriculum",
    description: "What is being coached matches the club's stated curriculum for that age band.",
    weight: 2,
    evidence: [
      "A written session plan is available on request.",
      "The session's topic matches the curriculum block for that period.",
      "Activities are game-realistic rather than isolated drills.",
      "The session builds logically from start to finish.",
    ],
  },
  {
    code: "DL-03",
    title: "Coaching intervention",
    description: "The coach intervenes at the right moments, and lets play run at others.",
    weight: 2,
    evidence: [
      "Interventions are timed to natural stoppages where possible.",
      "The coach lets play continue when the learning is happening.",
      "Interventions are brief and return players to activity quickly.",
      "Individual corrections are made without stopping the whole group.",
    ],
  },
  {
    code: "DL-04",
    title: "Use of questioning",
    description:
      "Players are asked to work out answers rather than only being told them.",
    weight: 2,
    evidence: [
      "Open questions are used, not only closed ones.",
      "Players are given time to answer before the coach fills the silence.",
      "Answers are built on rather than simply corrected.",
      "Questions are directed across the group, not to the same few players.",
    ],
  },
  {
    code: "DL-05",
    title: "Demonstration and explanation",
    description: "Information is delivered so players can act on it.",
    evidence: [
      "Demonstrations are accurate and visible to everyone.",
      "Explanations are short and use consistent club terminology.",
      "Key points are limited to a manageable number.",
      "Understanding is checked before play resumes.",
    ],
  },
  {
    code: "DL-06",
    title: "Player engagement and ball-rolling time",
    description: "Players are involved, active, and touching the ball.",
    weight: 2,
    evidence: [
      "Every player is active for the great majority of the session.",
      "There are no lines waiting for a turn.",
      "Players are visibly engaged rather than compliant.",
      "Ball contacts per player are high across the session.",
    ],
  },
  {
    code: "DL-07",
    title: "Differentiation",
    description: "The session works for the strongest and the weakest player in it.",
    evidence: [
      "Activities are adjusted for individuals during the session.",
      "Constraints are varied rather than only group size.",
      "Stronger players are challenged rather than left to dominate.",
      "Less confident players are supported into the activity.",
    ],
  },
  {
    code: "DL-08",
    title: "Match-day management",
    description: "How the coach manages the team on match day.",
    weight: 2,
    evidence: [
      "A clear pre-match routine is followed.",
      "Substitutions are planned rather than reactive.",
      "Half-time addresses a small number of points.",
      "The coach's touchline behaviour models the club's standards.",
    ],
  },
  {
    code: "DL-09",
    title: "Match-day player communication",
    description: "What the coach says to players during a match, and how.",
    evidence: [
      "Instructions are concise and actionable, not a running commentary.",
      "Players are not criticised in front of others.",
      "Positive reinforcement is specific rather than generic.",
      "Players are given decisions to make themselves.",
    ],
  },
  {
    code: "DL-10",
    title: "Goalkeeper-specific delivery",
    description: "Goalkeepers receive appropriate, specific coaching.",
    evidence: [
      "Goalkeepers receive dedicated technical work each week.",
      "Goalkeeping work is integrated into team sessions as well.",
      "Distribution and playing out are coached, not only shot-stopping.",
      "The goalkeeping coach and head coach are visibly aligned.",
    ],
  },
  {
    code: "DL-11",
    title: "Coach–player environment",
    description: "The environment the coach creates around the group.",
    weight: 2,
    evidence: [
      "Players are comfortable making mistakes.",
      "The coach knows and uses every player's name.",
      "Standards are held consistently across the group.",
      "The tone is demanding without being punitive.",
    ],
  },
  {
    code: "DL-12",
    title: "Use of video and analysis",
    description: "Video or analysis is used to support learning where available.",
    evidence: [
      "Match footage is captured for pathway teams.",
      "Clips are reviewed with players, individually or as a group.",
      "Analysis is tied to the club's principles of play.",
      "Players contribute to the review rather than only watching.",
    ],
  },
  {
    code: "DL-13",
    title: "Session review and reflection",
    description: "Coaches review their own sessions and act on what they find.",
    evidence: [
      "Coaches record a reflection after sessions.",
      "The Technical Director observes sessions and gives feedback.",
      "Feedback from an earlier observation is visibly acted on.",
      "Coaches observe one another and discuss it.",
    ],
  },
  {
    code: "DL-14",
    title: "Parent and spectator management",
    description: "Sideline behaviour is actively managed rather than tolerated.",
    evidence: [
      "A code of conduct is published and referenced.",
      "Parents are briefed at the start of the season.",
      "Sideline coaching is addressed when it happens.",
      "The club acts on breaches consistently.",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                   */
/* -------------------------------------------------------------------------- */

const OUTCOMES: SeedCriterion[] = [
  {
    code: "OU-01",
    title: "Player retention",
    description: "Players stay at the club season to season.",
    weight: 2,
    evidence: [
      "Retention is measured and reported each season.",
      "Overall retention is at or above 80%.",
      "Retention holds in the 13–15 age band, where drop-off is sharpest.",
      "Departing players are exit-surveyed and the findings acted on.",
    ],
  },
  {
    code: "OU-02",
    title: "Participation growth",
    description: "Total registered participation is stable or growing.",
    weight: 2,
    evidence: [
      "Total registrations have grown year on year.",
      "Growth is spread across age bands rather than concentrated in one.",
      "Team numbers have been maintained or increased.",
      "Growth has not outrun the club's coaching capacity.",
    ],
  },
  {
    code: "OU-03",
    title: "Female participation growth",
    description: "Female registrations and teams are growing.",
    weight: 2,
    evidence: [
      "Female registrations have grown year on year.",
      "Female teams are fielded in more than one age band.",
      "Female players are retained at a comparable rate to male players.",
      "A dedicated female entry program runs each year.",
    ],
  },
  {
    code: "OU-04",
    title: "MiniRoos to junior conversion",
    description: "Grassroots participants convert into the junior club.",
    evidence: [
      "Conversion from MiniRoos into junior teams is measured.",
      "The conversion rate is at or above 70%.",
      "The transition is deliberately supported rather than left to chance.",
      "Families are contacted directly at the transition point.",
    ],
  },
  {
    code: "OU-05",
    title: "Youth game time",
    description: "Youth-pathway players get meaningful minutes.",
    weight: 2,
    evidence: [
      "Game time is recorded for youth-pathway players.",
      "A stated minimum game-time policy exists.",
      "The majority of squad players average at least half a match.",
      "Squad sizes are set so the policy is actually achievable.",
    ],
  },
  {
    code: "OU-06",
    title: "Player progression",
    description: "Players progress into higher levels of the game.",
    evidence: [
      "Players have progressed into the club's own senior teams.",
      "Players have progressed to a higher-tier club or academy.",
      "Progression is tracked and published internally.",
      "Progressed players return to the club in some capacity.",
    ],
  },
  {
    code: "OU-07",
    title: "Representative selections",
    description: "Players are selected into representative and academy programs.",
    evidence: [
      "Players have been selected into FQ Academy or representative squads.",
      "Selections span more than one age group.",
      "The club supports selected players' additional load.",
      "Selection outcomes are reviewed with the players who missed out.",
    ],
  },
  {
    code: "OU-08",
    title: "Coach accreditation growth",
    description: "The club's coaches are becoming better qualified.",
    weight: 2,
    evidence: [
      "The number of accredited coaches has grown year on year.",
      "At least one coach has moved up a licence level this cycle.",
      "Every youth-pathway team has an accredited coach.",
      "Accreditation is tracked centrally with expiry dates.",
    ],
  },
  {
    code: "OU-09",
    title: "Coach retention",
    description: "Coaches stay at the club.",
    evidence: [
      "Coach turnover is measured.",
      "The majority of coaches return the following season.",
      "Coaches leaving are exit-interviewed.",
      "Coaches report being supported when surveyed.",
    ],
  },
  {
    code: "OU-10",
    title: "Volunteer capacity",
    description: "The club has the volunteer base to run its programs.",
    evidence: [
      "Volunteer roles are filled at the start of the season.",
      "The club is not dependent on a handful of individuals.",
      "New volunteers were recruited this cycle.",
      "Volunteers are inducted and recognised.",
    ],
  },
  {
    code: "OU-11",
    title: "Female coach development",
    description: "Female coaches are being recruited, qualified and retained.",
    weight: 2,
    evidence: [
      "The number of female coaches has grown year on year.",
      "A female coach has gained an accreditation this cycle.",
      "A female coach holds a senior technical role.",
      "Female coaches are mentored, not only recruited.",
    ],
  },
  {
    code: "OU-12",
    title: "Goalkeeper development outcomes",
    description: "The goalkeeping program produces goalkeepers.",
    evidence: [
      "Every pathway team has a specialist goalkeeper.",
      "Goalkeepers are retained at a comparable rate to outfield players.",
      "A goalkeeper has progressed to a higher level this cycle.",
      "Goalkeepers receive individual feedback documented like outfield players.",
    ],
  },
  {
    code: "OU-13",
    title: "Community and school engagement",
    description: "The club is connected to the community it recruits from.",
    evidence: [
      "The club runs programs in local schools.",
      "Partnerships exist with at least two community organisations.",
      "Come-and-try events were held this cycle.",
      "Engagement translates into measurable registrations.",
    ],
  },
];

export const CRITERIA: SeedDomain[] = [
  { domain: "PLANNING", criteria: PLANNING },
  { domain: "DELIVERY", criteria: DELIVERY },
  { domain: "OUTCOMES", criteria: OUTCOMES },
];

/** Total criteria across the three assessed domains. */
export const CRITERION_COUNT = CRITERIA.reduce((n, d) => n + d.criteria.length, 0);
