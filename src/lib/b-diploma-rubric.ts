/**
 * The B Diploma assessment rubric, in Football Queensland's own words.
 *
 * Printed at the foot of both B Diploma documents — the formative assessment
 * action plan and the post-course feedback — and transcribed from the copies
 * returned for Beau Weedon and Matthew Mckay's August 2026 Toowoomba course,
 * which is the version the CETs are working from.
 *
 * **This is not the C Diploma's appendix with a different heading.** They are
 * two instruments. `fa-rubric-appendix.ts` holds Football Australia's grid: six
 * areas against *four* levels, 0 to 3, which add up to the eighteen points the
 * C Diploma form totals. This one has the same six areas against *three*
 * levels, Not Yet Competent / Competent / Highly Competent, and no points at
 * all — the B Diploma form carries no total, because the CETs tick a level per
 * area and then tick an overall outcome, and nothing is added up. Mapping one
 * onto the other would be inventing a conversion nobody has published, which is
 * the same trap the 1-5 session rating sets; see the note at the head of
 * `delivery-rubric.ts`.
 *
 * Quoted material, including its typos. If FQ revise it, re-transcribe rather
 * than paraphrase: a CET ticking Competent is reading these exact sentences.
 */

/** The three levels, as the rubric heads its columns. */
export const B_LEVELS = ["Not Yet Competent", "Competent", "Highly Competent"] as const;

/** The standing the rubric opens with, above the grid. */
export const B_RUBRIC_PREAMBLE =
  "The B Diploma coach must be able to effectively develop players and teams ranging from youth to senior amateur level. The Coach provides positive experiences to enhance players' performance through developing technical-tactical understandings and capacities, at an individual and group level.";

export type BRubricRow = {
  /** Matches `DeliveryArea.code` in `delivery-rubric.ts`. */
  code: string;
  /** The area's name as the rubric prints it, sub-headings and all. */
  heading: string[];
  /** One descriptor per level, in `B_LEVELS` order. */
  levels: [string, string, string];
};

export const B_DIPLOMA_RUBRIC: BRubricRow[] = [
  {
    code: "OBJECTIVE",
    heading: ["Objective"],
    levels: [
      "Objectives are vague or not communicated effectively.",
      "Objectives are defined and communicated but may lack specificity",
      "Objectives are clearly defined, specific, and communicated to all players.",
    ],
  },
  {
    code: "CONTENT",
    heading: ["Content", "Relevance", "Realism", "Repetition", "Rewards", "Reflection"],
    levels: [
      "Content is irrelevant, or is vague to linking with objective, failing to address any of the 5R’s. (Relevance, Realism, Repetition, Rewards, Reflection).",
      "Content is relevant and aligns with the objective and clearly addresses three or more of the 5R’s. Content based on developing individual and or small group technical/tactical actions and behaviours with detail on the specific visual cues linked to the player actions and habits.",
      "Content is highly relevant, meets the objective, covering all 5R’s. Content based on developing individual and or small group technical/tactical actions and behaviours with detail on the specific visual cues linked to the player actions and habits.",
    ],
  },
  {
    code: "ORGANISATION",
    heading: ["Organisation"],
    levels: [
      "Session is poorly organised and lacks structure and flow.",
      "Organisation is adequate; session is structured with clear and smooth transitions.",
      "Organisation is exemplary; session is well-structured, with clear, logical progression, smooth transitions.",
    ],
  },
  {
    code: "PRESENTING",
    heading: ["Presenting", "Engage", "Explain", "Exit"],
    levels: [
      "Presentation is unclear or ineffective with no demonstration or representation of the 3Es (Engage, Explain and Exit) hindering understanding and engagement.",
      "Presentation is clear and effective but may lack engagement. The 3Es of (Engage, Explain and Exit) are utilised with a demonstration.",
      "Presentation is highly engaging and clear, effectively capturing attention and enhancing understanding with good clear demonstration and checks for players understanding.",
    ],
  },
  {
    code: "COACHING",
    heading: ["Coaching", "Enter", "Enhance/ Educate", "Ensure"],
    levels: [
      "Coaching methods are ineffective or, with poor or does not identify the correct time to enter. Coach has an inability to enhance or educate throughout the session.",
      "Coaching methods are effective, generally good identification of when to enter and shows an ability to enhance and educate throughout the session, clearly linking specific visual cues to player actions.",
      "Coaching methods are highly effective, efficient, tailored to the individual, content is consistent, language used is clear. Coach identifies the most appropriate time to educate or enhance and can consistently enhance performance by link specific visual cues to player actions.",
    ],
  },
  {
    // The B form says Motivational Climate on both its tick table and its
    // rubric, so there is no contradiction to resolve here — unlike the C
    // form, which says Motivational Climate on one and Environment on the
    // other. The code is still ENVIRONMENT, which is what `DeliveryScore.code`
    // stores and what ties this row to its area.
    code: "ENVIRONMENT",
    heading: ["Motivational Climate"],
    levels: [
      "Environment is poorly managed, with issues in safety, inclusivity, or motivation.",
      "Environment is managed adequately, with good engagement and inclusive practices but may lack in certain motivational strategies.",
      "Environment is expertly managed, ensuring safety, inclusivity, and high levels of motivation and engagement, promoting self-directed learners.",
    ],
  },
];

/**
 * The area headings as the B form's *tick table* prints them, which are not
 * quite the rubric's own.
 *
 * `CONTENT – 5Rs` rather than Content over five bullets, and the three sub-word
 * areas spelled out on one line under the heading. Transcribed rather than
 * derived from the rubric rows above, because the two really do differ and
 * generating one from the other would quietly correct FQ's form.
 */
export const B_TICK_HEADINGS: Record<string, [string, string?]> = {
  OBJECTIVE: ["OBJECTIVE"],
  CONTENT: ["CONTENT – 5Rs"],
  ORGANISATION: ["ORGANISATION"],
  PRESENTING: ["PRESENTING", "Engage – Explain - Exit"],
  COACHING: ["COACHING", "Enter – Educate / Enhance - Ensure"],
  ENVIRONMENT: ["MOTIVATIONAL CLIMATE"],
};

/**
 * The Coach Development Plan's two competency panels, as the page lists them.
 *
 * FA's course competencies, five off the field and six on it. The page is blank
 * for the coach to fill in, so these are the only words on it that are not a
 * label.
 */
export const FA_COMPETENCIES = {
  offField: ["Engagement", "Session Design", "Interaction", "Football Knowledge", "Reflection"],
  onField: [
    "Objective",
    "Content",
    "Organisation",
    "Presenting",
    "Coaching",
    "Environment",
  ],
};
